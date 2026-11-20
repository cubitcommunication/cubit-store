<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * The admin activity log: who did what, to which record, from where and when. Every sign-in and every change made in
 * the admin panel is written here (see App\Http\Middleware\LogAdminActivity and QueryController). Logging can never
 * break the action it records: any failure is only written to the server log.
 */
final class Activity
{
    /** Keys whose values are never stored. */
    private const SECRET = '/pass|secret|token|authorization|cookie|signature/i';

    /**
     * @param  array{id?: string, email: string}|null  $admin  the signed-in admin (null for a failed sign-in)
     * @param  array<string, mixed>  $details
     */
    public static function log(Request $request, ?array $admin, string $action, string $area, string $summary, array $details = [], ?string $subjectType = null, ?string $subjectId = null, ?string $email = null): void
    {
        try {
            $json = $details ? json_encode(self::clean($details), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR) : null;
            if ($json !== null && strlen($json) > 12000) {
                $json = json_encode(['note' => 'Details were too long to keep.', 'preview' => mb_substr($json, 0, 4000)]);
            }
            DB::table('admin_activity')->insert([
                'id' => (string) Str::uuid(),
                'admin_id' => $admin['id'] ?? null,
                'admin_email' => mb_substr((string) ($email ?? $admin['email'] ?? 'unknown'), 0, 191),
                'action' => mb_substr($action, 0, 40),
                'area' => mb_substr($area, 0, 60),
                'subject_type' => $subjectType !== null ? mb_substr($subjectType, 0, 60) : null,
                'subject_id' => $subjectId !== null ? mb_substr($subjectId, 0, 64) : null,
                'summary' => mb_substr($summary, 0, 500),
                'details' => $json,
                'ip' => mb_substr((string) $request->ip(), 0, 64),
                'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
                'created_at' => now()->utc()->format('Y-m-d H:i:s'),
            ]);
        } catch (\Throwable $e) {
            Log::error('[activity] could not write the log: '.$e->getMessage());
        }
    }

    /** Hides secrets and shortens long values so one entry stays readable and small. */
    public static function clean(mixed $value, int $depth = 0, string $key = ''): mixed
    {
        if ($key !== '' && preg_match(self::SECRET, $key)) {
            return '[hidden]';
        }
        if (is_array($value)) {
            if ($depth >= 3) {
                return '[…]';
            }
            $out = [];
            $n = 0;
            foreach ($value as $k => $v) {
                if (++$n > 40) {
                    $out['…'] = count($value) - 40 .' more';
                    break;
                }
                $out[$k] = self::clean($v, $depth + 1, (string) $k);
            }

            return $out;
        }
        if (is_string($value)) {
            return mb_strlen($value) > 300 ? mb_substr($value, 0, 300).'…' : $value;
        }

        return is_scalar($value) || $value === null ? $value : '[unsupported]';
    }
}
