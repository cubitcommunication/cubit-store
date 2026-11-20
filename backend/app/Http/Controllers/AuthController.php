<?php

namespace App\Http\Controllers;

use App\Support\Activity;
use App\Support\AdminAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Admin sign-in, one-time setup, sign-out and password change.
 * The response shapes match what the React admin screens already expect.
 */
class AuthController extends Controller
{
    /** Tells the sign-in screen whether the very first admin still has to be created. */
    public function setupStatus(): JsonResponse
    {
        try {
            return response()->json(['needsSetup' => DB::table('admin_users')->count() === 0, 'ready' => true]);
        } catch (\Throwable $e) {
            Log::error('[auth] setup status failed: '.$e->getMessage());

            // Fail closed: never offer the one-time setup form when unsure.
            return response()->json(['needsSetup' => false, 'ready' => false]);
        }
    }

    /** Who is signed in, if anyone. */
    public function session(Request $request): JsonResponse
    {
        $admin = AdminAuth::current($request);

        return response()->json(['email' => $admin['email'] ?? null, 'name' => $admin['name'] ?? null, 'role' => $admin['role'] ?? null]);
    }

    /** Works only while no admin exists; safe against two people submitting at once. */
    public function firstAdmin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:160'],
            'password' => ['required', 'string', 'min:10', 'max:200'],
        ]);

        $id = (string) Str::uuid();
        $now = now()->utc()->format('Y-m-d H:i:s');
        $email = strtolower(trim($data['email']));

        $created = DB::transaction(function () use ($id, $email, $data, $now) {
            // Lock so two simultaneous setups cannot both succeed.
            DB::select('SELECT id FROM admin_users FOR UPDATE');
            if (DB::table('admin_users')->count() > 0) {
                return false;
            }
            DB::table('admin_users')->insert([
                'id' => $id, 'email' => $email, 'password_hash' => AdminAuth::hashPassword($data['password']),
                'role' => 'super', 'created_at' => $now, 'updated_at' => $now,
            ]);

            return true;
        });

        if (! $created) {
            return response()->json(['ok' => false, 'message' => 'An admin account already exists.']);
        }

        Activity::log($request, ['id' => $id, 'email' => $email], 'login', 'account', 'Created the first admin account and signed in');

        return response()->json(['ok' => true])->withCookie(AdminAuth::startSession($id, $request));
    }

    public function signIn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'max:160'],
            'password' => ['required', 'string', 'max:200'],
        ]);

        $typed = strtolower(trim($data['email']));
        $user = DB::table('admin_users')->where('email', $typed)->first();
        $valid = $user ? AdminAuth::verifyPassword($data['password'], $user->password_hash) : false;
        if (! $user || ! $valid) {
            Activity::log($request, $user ? ['id' => $user->id, 'email' => $user->email] : null, 'login_failed', 'account', 'Failed sign-in attempt for '.mb_substr($typed, 0, 120), [], null, null, $typed);

            return response()->json(['ok' => false, 'message' => 'Email or password is incorrect.']);
        }
        if (! (bool) $user->active) {
            Activity::log($request, ['id' => $user->id, 'email' => $user->email], 'login_failed', 'account', 'Sign-in refused: this account is switched off');

            return response()->json(['ok' => false, 'message' => 'This account has been switched off. Please contact the main administrator.']);
        }

        DB::table('admin_users')->where('id', $user->id)->update(['last_login_at' => now()->utc()->format('Y-m-d H:i:s')]);
        Activity::log($request, ['id' => $user->id, 'email' => $user->email], 'login', 'account', 'Signed in');

        return response()->json(['ok' => true])->withCookie(AdminAuth::startSession($user->id, $request));
    }

    public function signOut(Request $request): JsonResponse
    {
        if ($admin = AdminAuth::current($request)) {
            Activity::log($request, $admin, 'logout', 'account', 'Signed out');
        }
        AdminAuth::endSession($request);

        return response()->json(['ok' => true])->withCookie(AdminAuth::forgetCookie($request));
    }

    /** Requires the current password and signs every browser out afterwards. */
    public function changePassword(Request $request): JsonResponse
    {
        $admin = AdminAuth::current($request);
        if (! $admin) {
            return response()->json(['ok' => false, 'message' => 'Please sign in again.']);
        }

        $data = $request->validate([
            'currentPassword' => ['required', 'string', 'max:200'],
            'newPassword' => ['required', 'string', 'min:10', 'max:200'],
        ]);

        $stored = DB::table('admin_users')->where('id', $admin['id'])->value('password_hash');
        if (! $stored || ! AdminAuth::verifyPassword($data['currentPassword'], $stored)) {
            return response()->json(['ok' => false, 'message' => 'Your current password is not correct.']);
        }

        DB::table('admin_users')->where('id', $admin['id'])->update([
            'password_hash' => AdminAuth::hashPassword($data['newPassword']),
            'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
        ]);
        AdminAuth::endAllSessions($admin['id']);
        Activity::log($request, $admin, 'password', 'account', 'Changed their own password');

        return response()->json(['ok' => true])->withCookie(AdminAuth::forgetCookie($request));
    }
}
