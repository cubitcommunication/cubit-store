<?php

namespace App\Support;

use App\Support\Mail\MailVars;
use App\Support\Push\PushTransport;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Admin notifications. Something happens (an order arrives, a payment fails, stock runs low...) and, if the main
 * administrator has that event switched on (Settings -> Notifications), it is added to the shared feed that every admin
 * sees in the bell and sent as a system notification to every device an admin has allowed them on (web push).
 * Nothing here may ever break the action it reports: every failure is only written to the server log.
 */
final class Notifier
{
    /** key => [label, group, help, switched on until the main administrator changes it] */
    public const EVENTS = [
        'order_new' => ['New order', 'Orders', 'A customer placed an order (online orders count once the payment is confirmed).', true],
        'payment_received' => ['Payment received', 'Orders', 'A Cash on Delivery order was marked as paid (for example when the cash is collected).', true],
        'payment_failed' => ['Payment failed', 'Orders', 'An online payment did not go through.', true],
        'order_cancelled' => ['Order cancelled', 'Orders', 'An order was cancelled, by the customer, the store or because payment could not be started.', true],
        'order_refunded' => ['Refund issued', 'Orders', 'A refund was recorded on an order.', true],
        'shipment_delivered' => ['Parcel delivered', 'Shipping', 'The courier reports that a parcel was delivered (needs Shiprocket).', false],
        'shipment_returned' => ['Parcel returned to you', 'Shipping', 'A parcel is coming back to you (RTO) (needs Shiprocket).', false],
        'return_requested' => ['Return requested', 'Orders', 'A customer asked to return something.', true],
        'low_stock' => ['Low stock', 'Stock', 'A piece or variation is running low after an order.', true],
        'out_of_stock' => ['Sold out', 'Stock', 'A piece or variation just sold out.', true],
        'abandoned_cart' => ['Abandoned cart', 'Customers', 'A shopper left a cart behind (you can contact them).', false],
        'new_customer' => ['New customer account', 'Customers', 'Someone created an account on the website.', false],
        'new_subscriber' => ['New newsletter subscriber', 'Customers', 'Someone subscribed to the newsletter.', false],
    ];

    /** Keep the shared feed small: only the newest rows are needed. */
    private const KEEP = 300;

    private static ?array $settings = null;

    public static function forget(): void
    {
        self::$settings = null;
    }

    /** @return array<string, string> */
    private static function settings(): array
    {
        if (self::$settings === null) {
            try {
                self::$settings = DB::table('notification_settings')->pluck('value', 'key')->all();
            } catch (\Throwable) {
                self::$settings = [];
            }
        }

        return self::$settings;
    }

    public static function enabled(string $event): bool
    {
        $default = self::EVENTS[$event][3] ?? false;
        $stored = self::settings()['event.'.$event] ?? null;

        return $stored === null ? $default : $stored === '1';
    }

    /** Stock at or below this number counts as "low". */
    public static function lowStockThreshold(): int
    {
        $v = (int) (self::settings()['low_stock_threshold'] ?? 3);

        return $v >= 1 && $v <= 1000 ? $v : 3;
    }

    /** The built-in sounds the main administrator can pick; "custom" plays an uploaded audio file. */
    public const TONES = ['classic', 'long', 'bell', 'custom'];

    /**
     * The sound the admin panel plays for a new notification (the same for every admin).
     *
     * @return array{tone: string, url: string}
     */
    public static function sound(): array
    {
        $tone = self::settings()['sound.tone'] ?? 'long';
        $url = (string) (self::settings()['sound.url'] ?? '');
        if (! in_array($tone, self::TONES, true) || ($tone === 'custom' && $url === '')) {
            $tone = 'long';
        }

        return ['tone' => $tone, 'url' => $tone === 'custom' ? $url : ''];
    }

    /** True for an uploaded audio file kept in Media (an address such as /api/public/img/2026-11/library/ding.mp3). */
    public static function isSoundUrl(string $url): bool
    {
        return str_starts_with($url, Media::URL_PREFIX)
            && Media::isSafeKey(substr($url, strlen(Media::URL_PREFIX)))
            && Media::kindFor($url) === 'audio';
    }

    public static function saveSound(string $tone, string $url): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('notification_settings')->updateOrInsert(['key' => 'sound.tone'], ['value' => $tone, 'updated_at' => $now]);
        DB::table('notification_settings')->updateOrInsert(['key' => 'sound.url'], ['value' => $tone === 'custom' ? $url : '', 'updated_at' => $now]);
        self::forget();
    }

    /** Saves the switches and the threshold. @param array<string, bool> $events */
    public static function save(array $events, ?int $threshold): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        foreach ($events as $event => $on) {
            if (isset(self::EVENTS[$event])) {
                DB::table('notification_settings')->updateOrInsert(['key' => 'event.'.$event], ['value' => $on ? '1' : '0', 'updated_at' => $now]);
            }
        }
        if ($threshold !== null) {
            DB::table('notification_settings')->updateOrInsert(['key' => 'low_stock_threshold'], ['value' => (string) max(1, min(1000, $threshold)), 'updated_at' => $now]);
        }
        self::forget();
    }

    /**
     * Records an event and pushes it to every subscribed device.
     *
     * @param  string|null  $dedupe  the same key within 15 minutes is only announced once (an order can be confirmed twice)
     */
    public static function send(string $event, string $title, string $body = '', ?string $url = null, ?string $dedupe = null, bool $force = false): void
    {
        try {
            if (! $force && ! self::enabled($event)) {
                return;
            }
            if ($dedupe !== null && DB::table('admin_notifications')->where('dedupe', $dedupe)->where('created_at', '>=', now()->subMinutes(15)->utc()->format('Y-m-d H:i:s'))->exists()) {
                return;
            }
            $id = (string) Str::uuid();
            $title = mb_substr($title, 0, 160);
            $body = mb_substr($body, 0, 400);
            DB::table('admin_notifications')->insert([
                'id' => $id, 'event' => $event, 'title' => $title, 'body' => $body, 'url' => $url, 'dedupe' => $dedupe,
                'created_at' => now()->utc()->format('Y-m-d H:i:s'),
            ]);
            if (random_int(1, 25) === 1) {
                $cut = DB::table('admin_notifications')->orderByDesc('created_at')->skip(self::KEEP)->limit(1)->value('created_at');
                if ($cut) {
                    DB::table('admin_notifications')->where('created_at', '<', $cut)->delete();
                }
            }

            $payload = json_encode(['id' => $id, 'event' => $event, 'title' => $title, 'body' => $body, 'url' => $url ?: '/admin/orders', 'tag' => $event.'-'.($dedupe ?? $id)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $deliver = static fn () => self::deliver((string) $payload);
            // After the response has gone to the shopper, so placing an order never waits for the push services.
            if (function_exists('Illuminate\\Support\\defer') && ! app()->runningUnitTests() && ! app()->runningInConsole()) {
                \Illuminate\Support\defer($deliver);
            } else {
                $deliver();
            }
        } catch (\Throwable $e) {
            Log::error('[notify] '.$event.' failed: '.$e->getMessage());
        }
    }

    /** Sends a payload to every device of every active admin and forgets devices that are gone. */
    public static function deliver(string $payload): void
    {
        try {
            $rows = DB::table('push_subscriptions as s')
                ->join('admin_users as u', 'u.id', '=', 's.admin_id')
                ->where('u.active', 1)
                ->get(['s.id', 's.endpoint', 's.p256dh', 's.auth'])
                ->map(fn ($r) => ['id' => $r->id, 'endpoint' => $r->endpoint, 'p256dh' => $r->p256dh, 'auth' => $r->auth])
                ->all();
            if (! $rows) {
                return;
            }
            $results = app(PushTransport::class)->send($rows, $payload);
            $gone = array_keys(array_filter($results, fn ($r) => $r === 'gone'));
            if ($gone) {
                DB::table('push_subscriptions')->whereIn('id', $gone)->delete();
            }
            $ok = array_keys(array_filter($results, fn ($r) => $r === 'ok'));
            if ($ok) {
                DB::table('push_subscriptions')->whereIn('id', $ok)->update(['last_sent_at' => now()->utc()->format('Y-m-d H:i:s')]);
            }
        } catch (\Throwable $e) {
            Log::error('[notify] delivery failed: '.$e->getMessage());
        }
    }

    /* ------------------------------------------------------------------ events */

    private static function orderLine(object $o): string
    {
        $pay = $o->payment_method === 'cod' ? 'Cash on Delivery' : 'Paid online';

        return MailVars::money((float) $o->total).' · '.$pay.' · '.$o->name;
    }

    public static function newOrder(object $o): void
    {
        self::send('order_new', 'New order #'.$o->number, self::orderLine($o), '/admin/orders/'.$o->id, 'order_new:'.$o->id);
    }

    public static function orderEvent(string $event, object $o, string $title, string $extra = ''): void
    {
        self::send($event, $title.' #'.$o->number, trim(self::orderLine($o).($extra !== '' ? ' · '.$extra : '')), '/admin/orders/'.$o->id, $event.':'.$o->id);
    }

    /** A courier status changed: announce delivered and returned parcels. */
    public static function shipment(object $o, string $status): void
    {
        if (preg_match('/\b(rto|return)/i', $status)) {
            self::orderEvent('shipment_returned', $o, 'Parcel coming back', $status);
        } elseif (preg_match('/^delivered$/i', trim($status))) {
            self::orderEvent('shipment_delivered', $o, 'Parcel delivered');
        }
    }

    /** Called after an order reduced stock: announces pieces that are now low or sold out. @param list<array{name: string, left: int}> $items */
    public static function stock(array $items): void
    {
        foreach ($items as $i) {
            if ($i['left'] <= 0) {
                self::send('out_of_stock', 'Sold out: '.$i['name'], 'No pieces left. Update the stock in Products.', '/admin/products');
            } elseif ($i['left'] <= self::lowStockThreshold()) {
                self::send('low_stock', 'Low stock: '.$i['name'], 'Only '.$i['left'].' left.', '/admin/products');
            }
        }
    }
}
