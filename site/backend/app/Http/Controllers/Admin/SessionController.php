<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Activity;
use App\Support\AdminAuth;
use App\Support\DeviceLabel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Admin -> Account -> Devices: every browser that is signed in to the admin panel, with who, which device, where from and
 * when it was last used, and a way to sign any of them out. Main administrator only (the route group enforces it).
 */
class SessionController extends Controller
{
    private function iso(?string $utc): ?string
    {
        return $utc ? gmdate('Y-m-d\TH:i:s\Z', strtotime($utc.' UTC')) : null;
    }

    public function index(Request $request): JsonResponse
    {
        $me = AdminAuth::current($request)['sid'] ?? null;
        $rows = DB::table('admin_sessions as s')->join('admin_users as u', 'u.id', '=', 's.admin_id')
            ->where('s.expires_at', '>', now()->utc()->format('Y-m-d H:i:s'))
            ->orderByDesc('s.last_active_at')->orderByDesc('s.created_at')
            ->get(['s.id', 's.admin_id', 's.ip', 's.user_agent', 's.created_at', 's.last_active_at', 's.expires_at', 'u.email', 'u.name', 'u.role']);

        return response()->json(['sessions' => $rows->map(function ($r) use ($me) {
            $d = DeviceLabel::describe($r->user_agent);

            return [
                'id' => $r->id, 'admin_id' => $r->admin_id, 'email' => $r->email, 'name' => $r->name,
                'role' => AdminAuth::roleOf($r->email, $r->role), 'device' => $d['device'], 'mobile' => $d['mobile'],
                'known' => $r->user_agent !== null, 'ip' => $r->ip,
                'signed_in_at' => $this->iso($r->created_at), 'last_active_at' => $this->iso($r->last_active_at ?: $r->created_at),
                'expires_at' => $this->iso($r->expires_at), 'current' => $r->id === $me,
            ];
        })->values()]);
    }

    private function log(Request $request, string $summary, array $details = []): void
    {
        if ($admin = AdminAuth::current($request)) {
            Activity::log($request, $admin, 'session_revoke', 'security', $summary, $details);
        }
    }

    /** Signs one device out. */
    public function revoke(Request $request, string $id): JsonResponse
    {
        $s = DB::table('admin_sessions as s')->join('admin_users as u', 'u.id', '=', 's.admin_id')->where('s.id', $id)->first(['s.id', 's.user_agent', 's.ip', 'u.email']);
        if (! $s) {
            return response()->json(['message' => 'That device is already signed out.'], 404);
        }
        DB::table('admin_sessions')->where('id', $id)->delete();
        $this->log($request, 'Signed out '.$s->email.' on '.DeviceLabel::describe($s->user_agent)['device'], ['email' => $s->email, 'ip' => $s->ip]);

        return response()->json(['ok' => true, 'self' => $id === (AdminAuth::current($request)['sid'] ?? null)]);
    }

    /** Signs a person out of every device (keeping the one the main administrator is using right now, if it is theirs). */
    public function revokeUser(Request $request): JsonResponse
    {
        $adminId = (string) $request->validate(['admin_id' => ['required', 'string', 'max:36']])['admin_id'];
        $email = (string) DB::table('admin_users')->where('id', $adminId)->value('email');
        $keep = AdminAuth::current($request)['sid'] ?? '';
        $n = DB::table('admin_sessions')->where('admin_id', $adminId)->where('id', '!=', $keep)->delete();
        $this->log($request, 'Signed '.$email.' out of '.$n.' '.($n === 1 ? 'device' : 'devices'), ['email' => $email, 'devices' => $n]);

        return response()->json(['ok' => true, 'signedOut' => $n]);
    }

    /** Signs every device out except the one in use now (for example if a password may have leaked). */
    public function revokeOthers(Request $request): JsonResponse
    {
        $keep = AdminAuth::current($request)['sid'] ?? '';
        $n = DB::table('admin_sessions')->where('id', '!=', $keep)->delete();
        $this->log($request, 'Signed out all other devices ('.$n.')', ['devices' => $n]);

        return response()->json(['ok' => true, 'signedOut' => $n]);
    }
}
