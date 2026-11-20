<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Activity;
use App\Support\AdminAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Admin -> Account -> Team and Activity log. Only the main administrator (super admin) may use these: the server
 * checks that on every call. The main administrator's account can never be deleted, switched off or demoted.
 */
class UserController extends Controller
{
    private function deny(): JsonResponse
    {
        return response()->json(['message' => 'Only the main administrator can do this.'], 403);
    }

    /** @return array<string, mixed> */
    private function present(object $u, ?string $creatorEmail, ?string $lastActivity): array
    {
        return [
            'id' => $u->id,
            'email' => $u->email,
            'name' => $u->name,
            'role' => AdminAuth::roleOf($u->email, $u->role),
            'active' => (bool) $u->active,
            'last_login_at' => $u->last_login_at ? gmdate('Y-m-d\TH:i:s\Z', strtotime($u->last_login_at.' UTC')) : null,
            'last_activity_at' => $lastActivity ? gmdate('Y-m-d\TH:i:s\Z', strtotime($lastActivity.' UTC')) : null,
            'created_at' => $u->created_at ? gmdate('Y-m-d\TH:i:s\Z', strtotime($u->created_at.' UTC')) : null,
            'created_by' => $creatorEmail,
        ];
    }

    public function index(Request $request): JsonResponse
    {
        if (! AdminAuth::isSuper($request)) {
            return $this->deny();
        }
        $emails = DB::table('admin_users')->pluck('email', 'id');
        $last = DB::table('admin_activity')->whereNotNull('admin_id')->selectRaw('admin_id, MAX(created_at) as last_at')->groupBy('admin_id')->pluck('last_at', 'admin_id');
        $rows = DB::table('admin_users')->orderBy('created_at')->get()
            ->map(fn ($u) => $this->present($u, $u->created_by ? ($emails[$u->created_by] ?? null) : null, $last[$u->id] ?? null))
            ->sortBy(fn ($u) => [$u['role'] === 'super' ? 0 : 1, $u['created_at']])->values();

        return response()->json(['users' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = AdminAuth::current($request);
        if (! AdminAuth::isSuper($request) || ! $actor) {
            return $this->deny();
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:160'],
            'password' => ['required', 'string', 'min:10', 'max:200'],
        ]);
        $email = strtolower(trim($data['email']));
        if (DB::table('admin_users')->where('email', $email)->exists()) {
            return response()->json(['message' => 'There is already an admin with that e-mail address.'], 422);
        }

        $id = (string) Str::uuid();
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('admin_users')->insert([
            'id' => $id, 'email' => $email, 'name' => trim($data['name']), 'password_hash' => AdminAuth::hashPassword($data['password']),
            'role' => 'admin', 'active' => 1, 'created_by' => $actor['id'], 'created_at' => $now, 'updated_at' => $now,
        ]);
        Activity::log($request, $actor, 'user_create', 'team', 'Added admin user '.trim($data['name']).' ('.$email.')', ['email' => $email, 'name' => trim($data['name'])], 'admin_users', $id);

        return response()->json(['id' => $id]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $actor = AdminAuth::current($request);
        if (! AdminAuth::isSuper($request) || ! $actor) {
            return $this->deny();
        }
        $user = DB::table('admin_users')->where('id', $id)->first();
        if (! $user) {
            return response()->json(['message' => 'That user no longer exists.'], 404);
        }
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'email' => ['sometimes', 'required', 'email', 'max:160'],
            'active' => ['sometimes', 'boolean'],
            'password' => ['sometimes', 'nullable', 'string', 'min:10', 'max:200'],
        ]);

        $protected = AdminAuth::roleOf($user->email, $user->role) === 'super';
        $self = $user->id === $actor['id'];
        $changes = [];
        $log = [];

        if (isset($data['name']) && trim($data['name']) !== (string) $user->name) {
            $changes['name'] = trim($data['name']);
            $log['name'] = ['from' => $user->name, 'to' => $changes['name']];
        }
        if (isset($data['email'])) {
            $email = strtolower(trim($data['email']));
            if ($email !== strtolower($user->email)) {
                if ($protected) {
                    return response()->json(['message' => "The main administrator's e-mail address cannot be changed."], 422);
                }
                if (DB::table('admin_users')->where('email', $email)->where('id', '!=', $user->id)->exists()) {
                    return response()->json(['message' => 'There is already an admin with that e-mail address.'], 422);
                }
                $changes['email'] = $email;
                $log['email'] = ['from' => $user->email, 'to' => $email];
            }
        }
        if (array_key_exists('active', $data) && (bool) $data['active'] !== (bool) $user->active) {
            if ($protected || $self) {
                return response()->json(['message' => $protected ? 'The main administrator cannot be switched off.' : 'You cannot switch off your own account.'], 422);
            }
            $changes['active'] = $data['active'] ? 1 : 0;
            $log['active'] = ['from' => (bool) $user->active, 'to' => (bool) $data['active']];
        }
        $newPassword = isset($data['password']) && $data['password'] !== '' ? $data['password'] : null;
        if ($newPassword !== null) {
            if ($protected && ! $self) {
                return response()->json(['message' => "Only the main administrator can change their own password (use Change password)."], 422);
            }
            $changes['password_hash'] = AdminAuth::hashPassword($newPassword);
            $log['password'] = 'new password set';
        }
        if (! $changes) {
            return response()->json(['ok' => true, 'changed' => false]);
        }

        DB::table('admin_users')->where('id', $user->id)->update($changes + ['updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
        // A new password or a switched-off account ends every browser that user was signed in on.
        if ($newPassword !== null || (isset($changes['active']) && $changes['active'] === 0)) {
            if (! $self) {
                AdminAuth::endAllSessions($user->id);
            }
        }
        $label = trim((string) ($changes['name'] ?? $user->name)) ?: $user->email;
        Activity::log($request, $actor, 'user_update', 'team', 'Changed admin user '.$label.' ('.implode(', ', array_keys($log)).')', $log, 'admin_users', $user->id);

        return response()->json(['ok' => true, 'changed' => true]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $actor = AdminAuth::current($request);
        if (! AdminAuth::isSuper($request) || ! $actor) {
            return $this->deny();
        }
        $user = DB::table('admin_users')->where('id', $id)->first();
        if (! $user) {
            return response()->json(['message' => 'That user no longer exists.'], 404);
        }
        if (AdminAuth::roleOf($user->email, $user->role) === 'super') {
            return response()->json(['message' => 'The main administrator cannot be deleted.'], 422);
        }
        if ($user->id === $actor['id']) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        AdminAuth::endAllSessions($user->id);
        DB::table('admin_users')->where('id', $user->id)->delete();
        // Their past activity stays in the log, with the e-mail they used.
        Activity::log($request, $actor, 'user_delete', 'team', 'Deleted admin user '.(trim((string) $user->name) ?: $user->email).' ('.$user->email.')', ['email' => $user->email, 'name' => $user->name], 'admin_users', $user->id);

        return response()->json(['ok' => true]);
    }

    /** The activity log, newest first, with filters. */
    public function activity(Request $request): JsonResponse
    {
        if (! AdminAuth::isSuper($request)) {
            return $this->deny();
        }
        $per = 40;
        $page = max(1, (int) $request->query('page', 1));
        $q = DB::table('admin_activity');

        if ($user = (string) $request->query('user', '')) {
            $q->where(fn ($w) => $w->where('admin_id', $user)->orWhere('admin_email', $user));
        }
        if ($action = (string) $request->query('action', '')) {
            $q->where('action', $action);
        }
        if ($area = (string) $request->query('area', '')) {
            $q->where('area', $area);
        }
        if ($text = trim((string) $request->query('q', ''))) {
            $like = '%'.addcslashes($text, '\\%_').'%';
            $q->where(fn ($w) => $w->where('summary', 'like', $like)->orWhere('admin_email', 'like', $like)->orWhere('ip', 'like', $like));
        }
        // Dates are the owner's own day in India (IST), converted to the UTC the log is stored in.
        foreach (['from' => ['>=', 'startOfDay'], 'to' => ['<=', 'endOfDay']] as $key => [$op, $edge]) {
            $day = (string) $request->query($key, '');
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
                $q->where('created_at', $op, \Carbon\Carbon::parse($day, \App\Support\Brand::timezone())->{$edge}()->utc()->format('Y-m-d H:i:s'));
            }
        }

        $total = (clone $q)->count();
        $rows = $q->orderByDesc('created_at')->orderByDesc('id')->forPage($page, $per)->get()->map(function ($r) {
            return [
                'id' => $r->id, 'admin_id' => $r->admin_id, 'email' => $r->admin_email, 'action' => $r->action, 'area' => $r->area,
                'subject_type' => $r->subject_type, 'subject_id' => $r->subject_id, 'summary' => $r->summary,
                'details' => $r->details ? json_decode($r->details, true) : null, 'ip' => $r->ip, 'user_agent' => $r->user_agent,
                'created_at' => gmdate('Y-m-d\TH:i:s\Z', strtotime($r->created_at.' UTC')),
            ];
        });

        return response()->json([
            'items' => $rows, 'total' => $total, 'page' => $page, 'pages' => max(1, (int) ceil($total / $per)),
            'filters' => [
                'users' => DB::table('admin_activity')->select('admin_email')->distinct()->orderBy('admin_email')->pluck('admin_email'),
                'actions' => DB::table('admin_activity')->select('action')->distinct()->orderBy('action')->pluck('action'),
                'areas' => DB::table('admin_activity')->where('area', '!=', '')->select('area')->distinct()->orderBy('area')->pluck('area'),
            ],
        ]);
    }
}
