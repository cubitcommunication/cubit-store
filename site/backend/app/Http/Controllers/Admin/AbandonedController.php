<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AbandonedCarts;
use App\Support\Mail\MailSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Admin -> Abandoned carts: the list, the numbers, the schedule settings and manual actions. */
class AbandonedController extends Controller
{
    private const SETTING_KEYS = [
        'abandoned_enabled', 'abandoned_reminders', 'abandoned_delay_1', 'abandoned_delay_2', 'abandoned_delay_3', 'abandoned_expire_days',
        'abandoned_min_value', 'abandoned_coupon_code', 'abandoned_notify_admin', 'abandoned_admin_after_minutes',
    ];

    public function index(): JsonResponse
    {
        $carts = DB::table('abandoned_carts')->orderByDesc('last_activity_at')->limit(300)->get()->map(fn ($c) => [
            'id' => $c->id, 'email' => $c->email, 'name' => $c->name, 'phone' => $c->phone, 'status' => $c->status,
            'subtotal' => (float) $c->subtotal, 'items' => json_decode((string) $c->items, true) ?: [], 'remindersSent' => (int) $c->reminders_sent,
            'lastActivityAt' => \Carbon\Carbon::parse($c->last_activity_at, 'UTC')->format('Y-m-d\TH:i:s\Z'),
            'lastReminderAt' => $c->last_reminder_at ? \Carbon\Carbon::parse($c->last_reminder_at, 'UTC')->format('Y-m-d\TH:i:s\Z') : null,
            'clicked' => (bool) $c->clicked_at, 'recoveredTotal' => $c->recovered_total !== null ? (float) $c->recovered_total : null,
        ])->all();

        $by = DB::table('abandoned_carts')->selectRaw('status, COUNT(*) n, COALESCE(SUM(subtotal),0) v, COALESCE(SUM(recovered_total),0) r')->groupBy('status')->get()->keyBy('status');
        $n = fn ($s) => (int) ($by[$s]->n ?? 0);
        $remindedOrBetter = $n('reminded') + $n('recovered') + $n('expired') + $n('unsubscribed');
        $all = MailSettings::all();

        return response()->json([
            'carts' => $carts,
            'stats' => [
                'waiting' => $n('active') + $n('reminded'), 'waitingValue' => (float) (($by['active']->v ?? 0) + ($by['reminded']->v ?? 0)),
                'recovered' => $n('recovered'), 'recoveredValue' => (float) ($by['recovered']->r ?? 0),
                'rate' => $remindedOrBetter > 0 ? round($n('recovered') / ($remindedOrBetter) * 100, 1) : 0,
                'unsubscribed' => $n('unsubscribed'),
            ],
            'settings' => array_intersect_key($all, array_flip(self::SETTING_KEYS)),
            'lastRun' => AbandonedCarts::lastRun(),
        ]);
    }

    public function settings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'values' => ['required', 'array'],
            'values.abandoned_enabled' => ['nullable', 'in:0,1'], 'values.abandoned_notify_admin' => ['nullable', 'in:0,1'],
            'values.abandoned_reminders' => ['nullable', 'integer', 'between:1,3'],
            'values.abandoned_delay_1' => ['nullable', 'integer', 'between:5,10080'], 'values.abandoned_delay_2' => ['nullable', 'integer', 'between:1,720'],
            'values.abandoned_delay_3' => ['nullable', 'integer', 'between:1,720'], 'values.abandoned_expire_days' => ['nullable', 'integer', 'between:1,90'],
            'values.abandoned_min_value' => ['nullable', 'numeric', 'min:0'], 'values.abandoned_coupon_code' => ['nullable', 'string', 'max:60'],
            'values.abandoned_admin_after_minutes' => ['nullable', 'integer', 'between:5,10080'],
        ]);
        MailSettings::save(array_intersect_key($data['values'], array_flip(self::SETTING_KEYS)));

        return response()->json(['ok' => true]);
    }

    /** Actions on one or more carts: send the next reminder now, or delete. */
    public function act(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:100'], 'ids.*' => ['string', 'max:40'], 'action' => ['required', 'in:send,delete']]);
        $done = 0;
        $skipped = 0;
        foreach (DB::table('abandoned_carts')->whereIn('id', $data['ids'])->get() as $cart) {
            if ($data['action'] === 'delete') {
                DB::table('abandoned_carts')->where('id', $cart->id)->delete();
                $done++;
            } elseif (in_array($cart->status, ['active', 'reminded'], true) && $cart->reminders_sent < 3 && AbandonedCarts::sendReminder($cart, (int) $cart->reminders_sent + 1)) {
                $done++;
            } else {
                $skipped++;
            }
        }

        return response()->json(['ok' => true, 'done' => $done, 'skipped' => $skipped]);
    }

    public function run(): JsonResponse
    {
        return response()->json(['ok' => true] + AbandonedCarts::process());
    }
}
