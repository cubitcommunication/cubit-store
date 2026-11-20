<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Admin sign-in without any third party: passwords are stored only as salted
 * hashes, and the browser holds nothing but an opaque HttpOnly session cookie.
 * Only a SHA-256 hash of that cookie value is kept in the database.
 */
final class AdminAuth
{
    public static function cookieName(): string
    {
        return config('shop.session_cookie');
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function hashPassword(string $password): string
    {
        return Hash::make($password);
    }

    public static function verifyPassword(string $password, string $stored): bool
    {
        return $stored !== '' && Hash::check($password, $stored);
    }

    /** Creates a session row and returns the cookie to attach to the response. */
    public static function startSession(string $adminId, Request $request): Cookie
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $days = (int) config('shop.session_days');
        $expires = now()->utc()->addDays($days);

        $row = [
            'id' => (string) Str::uuid(),
            'admin_id' => $adminId,
            'token_hash' => self::hashToken($token),
            'expires_at' => $expires->format('Y-m-d H:i:s'),
            'created_at' => now()->utc()->format('Y-m-d H:i:s'),
        ];
        try {
            // Where this device came from, so the main administrator can recognise it (and sign it out).
            DB::table('admin_sessions')->insert($row + [
                'ip' => mb_substr((string) $request->ip(), 0, 64), 'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
                'last_active_at' => $row['created_at'],
            ]);
        } catch (\Illuminate\Database\QueryException) {
            // The new columns do not exist yet (an update is half-way through): sign in without the details.
            DB::table('admin_sessions')->insert($row);
        }

        return new Cookie(self::cookieName(), $token, $expires->getTimestamp(), '/', null, $request->isSecure(), true, false, Cookie::SAMESITE_LAX);
    }

    /** A cookie that makes the browser forget the session. */
    public static function forgetCookie(Request $request): Cookie
    {
        return new Cookie(self::cookieName(), '', 1, '/', null, $request->isSecure(), true, false, Cookie::SAMESITE_LAX);
    }

    public static function endSession(Request $request): void
    {
        $token = $request->cookie(self::cookieName());
        if (is_string($token) && $token !== '') {
            DB::table('admin_sessions')->where('token_hash', self::hashToken($token))->delete();
        }
    }

    public static function endAllSessions(string $adminId): void
    {
        DB::table('admin_sessions')->where('admin_id', $adminId)->delete();
    }

    /** True for the main administrator's address, whatever role is stored. */
    public static function isSuperEmail(?string $email): bool
    {
        return $email !== null && strtolower(trim($email)) === strtolower((string) config('shop.super_admin_email'));
    }

    /** The role to use for an account row: the main administrator is always "super". */
    public static function roleOf(string $email, ?string $stored): string
    {
        return (self::isSuperEmail($email) || $stored === 'super') ? 'super' : 'admin';
    }

    /** @return array{id: string, email: string, name: ?string, role: string, sid: string}|null */
    public static function current(Request $request): ?array
    {
        if ($request->attributes->has('shop_admin')) {
            return $request->attributes->get('shop_admin');
        }

        $admin = null;
        $token = $request->cookie(self::cookieName());
        if (is_string($token) && $token !== '') {
            $row = DB::table('admin_sessions as s')
                ->join('admin_users as u', 'u.id', '=', 's.admin_id')
                ->where('s.token_hash', self::hashToken($token))
                ->select('u.id as id', 'u.email as email', 'u.name as name', 'u.role as role', 'u.active as active', 's.expires_at as expires_at', 's.id as sid')
                ->first();

            if ($row) {
                if (strtotime($row->expires_at.' UTC') < time() || ! (bool) $row->active) {
                    // Expired, or the account was switched off: the browser is signed out.
                    DB::table('admin_sessions')->where('token_hash', self::hashToken($token))->delete();
                } else {
                    $admin = ['id' => $row->id, 'email' => $row->email, 'name' => $row->name, 'role' => self::roleOf($row->email, $row->role), 'sid' => $row->sid];
                    self::touch($row->sid);
                }
            }
        }

        $request->attributes->set('shop_admin', $admin);

        return $admin;
    }

    /** Notes that this session is in use, at most once a minute. Never fails a request. */
    private static function touch(string $sessionId): void
    {
        try {
            $now = now()->utc();
            DB::table('admin_sessions')->where('id', $sessionId)
                ->where(fn ($q) => $q->whereNull('last_active_at')->orWhere('last_active_at', '<', $now->copy()->subMinute()->format('Y-m-d H:i:s')))
                ->update(['last_active_at' => $now->format('Y-m-d H:i:s')]);
        } catch (\Throwable) {
            // the column may not exist yet
        }
    }

    /** Only the main administrator may manage the team and read the activity log. */
    public static function isSuper(Request $request): bool
    {
        return (self::current($request)['role'] ?? null) === 'super';
    }

    public static function isAdmin(Request $request): bool
    {
        return self::current($request) !== null;
    }
}
