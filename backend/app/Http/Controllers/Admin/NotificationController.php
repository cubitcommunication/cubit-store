<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AdminAuth;
use App\Support\Notifier;
use App\Support\Push\WebPushTransport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The bell in the admin panel and the devices that get system notifications. Every admin can use their own bell and
 * turn notifications on for their own devices; which events are announced at all is the main administrator's setting.
 */
class NotificationController extends Controller
{
    private function me(Request $request): array
    {
        return (array) AdminAuth::current($request);
    }

    private function iso(string $utc): string
    {
        return gmdate('Y-m-d\TH:i:s\Z', strtotime($utc.' UTC'));
    }

    /** The newest notifications and how many this admin has not read. Polled every half minute while the panel is open. */
    public function index(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $seen = DB::table('admin_users')->where('id', $me['id'])->value('notifications_seen_at');
        if ($seen === null) {
            // A new admin starts with nothing unread instead of the whole history.
            $seen = now()->utc()->format('Y-m-d H:i:s');
            DB::table('admin_users')->where('id', $me['id'])->update(['notifications_seen_at' => $seen]);
        }
        $items = DB::table('admin_notifications')->orderByDesc('created_at')->orderByDesc('id')->limit(30)->get()->map(fn ($n) => [
            'id' => $n->id, 'event' => $n->event, 'title' => $n->title, 'body' => $n->body, 'url' => $n->url,
            'at' => $this->iso($n->created_at), 'unread' => $n->created_at > $seen,
        ]);

        return response()->json([
            'items' => $items,
            'unread' => DB::table('admin_notifications')->where('created_at', '>', $seen)->count(),
            'devices' => DB::table('push_subscriptions')->where('admin_id', $me['id'])->count(),
            'sound' => Notifier::sound(),
        ]);
    }

    public function seen(Request $request): JsonResponse
    {
        DB::table('admin_users')->where('id', $this->me($request)['id'])->update(['notifications_seen_at' => now()->utc()->format('Y-m-d H:i:s')]);

        return response()->json(['ok' => true]);
    }

    /** The public half of the server's push key, which the browser needs in order to subscribe. */
    public function pushKey(): JsonResponse
    {
        try {
            return response()->json(['publicKey' => WebPushTransport::keys()['public']]);
        } catch (\Throwable) {
            return response()->json(['message' => 'This server cannot create the key that system notifications need (OpenSSL).'], 503);
        }
    }

    public function subscribe(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'max:1000', 'regex:#^https://#i'],
            'keys.p256dh' => ['required', 'string', 'max:200'],
            'keys.auth' => ['required', 'string', 'max:100'],
        ]);
        $hash = hash('sha256', $data['endpoint']);
        $row = [
            'admin_id' => $me['id'], 'endpoint' => $data['endpoint'], 'p256dh' => $data['keys']['p256dh'], 'auth' => $data['keys']['auth'],
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ];
        // The same device can be re-subscribed (and may now belong to a different admin who signed in on it).
        if (DB::table('push_subscriptions')->where('endpoint_hash', $hash)->exists()) {
            DB::table('push_subscriptions')->where('endpoint_hash', $hash)->update($row);
        } else {
            DB::table('push_subscriptions')->insert($row + ['id' => (string) Str::uuid(), 'endpoint_hash' => $hash, 'created_at' => now()->utc()->format('Y-m-d H:i:s')]);
        }

        return response()->json(['ok' => true]);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        $endpoint = (string) $request->validate(['endpoint' => ['required', 'string', 'max:1000']])['endpoint'];
        DB::table('push_subscriptions')->where('endpoint_hash', hash('sha256', $endpoint))->where('admin_id', $this->me($request)['id'])->delete();

        return response()->json(['ok' => true]);
    }

    /* ------------------------------------------------------- main administrator only (route group enforces it) */

    public function settings(): JsonResponse
    {
        $events = [];
        foreach (Notifier::EVENTS as $key => [$label, $group, $help]) {
            $events[] = ['key' => $key, 'label' => $label, 'group' => $group, 'help' => $help, 'enabled' => Notifier::enabled($key)];
        }
        $devices = DB::table('push_subscriptions as s')->join('admin_users as u', 'u.id', '=', 's.admin_id')
            ->selectRaw('u.email as email, COUNT(*) as devices')->groupBy('u.email')->orderBy('u.email')->get()
            ->map(fn ($r) => ['email' => $r->email, 'devices' => (int) $r->devices])->all();

        return response()->json(['events' => $events, 'lowStockThreshold' => Notifier::lowStockThreshold(), 'devices' => $devices, 'sound' => Notifier::sound()]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'events' => ['required', 'array'],
            'events.*' => ['boolean'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'sound_tone' => ['nullable', 'string', 'in:'.implode(',', Notifier::TONES)],
            'sound_url' => ['nullable', 'string', 'max:300'],
        ]);
        if (isset($data['sound_tone'])) {
            $url = (string) ($data['sound_url'] ?? '');
            if ($data['sound_tone'] === 'custom' && ! Notifier::isSoundUrl($url)) {
                return response()->json(['message' => 'Choose an MP3 audio file for the custom sound (upload it here or pick it from Media).'], 422);
            }
            Notifier::saveSound($data['sound_tone'], $url);
        }
        Notifier::save(array_map('boolval', $data['events']), isset($data['low_stock_threshold']) ? (int) $data['low_stock_threshold'] : null);

        return response()->json(['ok' => true]);
    }

    /** A test notification to every subscribed device (and the bell), whatever the switches say. */
    public function test(): JsonResponse
    {
        Notifier::send('test', 'Test notification', 'If you can read this, notifications work on this device.', '/admin/orders', null, true);

        return response()->json(['ok' => true]);
    }
}
