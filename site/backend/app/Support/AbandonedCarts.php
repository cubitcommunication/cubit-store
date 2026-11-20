<?php

namespace App\Support;

use App\Support\Mail\Mailer;
use App\Support\Mail\MailSettings;
use App\Support\Mail\MailVars;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Abandoned carts. When a shopper types their e-mail at checkout we keep a server-side copy of the basket. If no order
 * follows, the reminder e-mails (Admin -> Emails templates abandoned_1..3) go out on the schedule set in Admin ->
 * Abandoned carts, and the store gets an alert. A shopper can stop the reminders with the link in the e-mail.
 *
 * Prices in the stored copy are for display only: checkout always re-prices from the database.
 */
final class AbandonedCarts
{
    private static function now(): string
    {
        return now()->utc()->format('Y-m-d H:i:s');
    }

    /** Keeps (or refreshes) the cart of this e-mail. */
    public static function capture(array $items, string $email, ?string $name, ?string $phone, ?string $customerId): void
    {
        if (! Commerce::cartEnabled() || ! MailSettings::on('abandoned_enabled')) {
            return;
        }
        $email = strtolower(trim($email));
        $quote = Commerce::quote($items, 'cod', false, null, $email, $customerId);
        $lines = array_values(array_filter($quote['lines'], fn ($l) => $l['issue'] === null));
        $existing = DB::table('abandoned_carts')->where('email', $email)->whereIn('status', ['active', 'reminded', 'unsubscribed'])->orderByDesc('updated_at')->first();

        if (! $lines) {
            if ($existing && $existing->status !== 'unsubscribed') {
                DB::table('abandoned_carts')->where('id', $existing->id)->delete();
            }

            return;
        }
        $snapshot = array_map(fn ($l) => [
            'id' => $l['id'], 'variantId' => $l['variantId'], 'variantTitle' => $l['variantTitle'], 'slug' => $l['slug'], 'name' => $l['name'],
            'sku' => $l['sku'], 'qty' => $l['qty'], 'price' => $l['price'], 'lineTotal' => $l['lineTotal'], 'image' => $l['image'],
        ], $lines);
        $now = self::now();
        $fields = [
            'items' => json_encode($snapshot, JSON_UNESCAPED_UNICODE), 'subtotal' => $quote['subtotal'],
            'name' => $name ?: ($existing->name ?? null), 'phone' => $phone ?: ($existing->phone ?? null),
            'customer_id' => $customerId ?: ($existing->customer_id ?? null), 'last_activity_at' => $now, 'updated_at' => $now,
        ];
        if ($existing) {
            DB::table('abandoned_carts')->where('id', $existing->id)->update($fields);

            return;
        }
        DB::table('abandoned_carts')->insert($fields + [
            'id' => (string) Str::uuid(), 'token' => bin2hex(random_bytes(16)), 'email' => $email, 'status' => 'active', 'reminders_sent' => 0, 'created_at' => $now,
        ]);
    }

    /** An order was placed with this e-mail: a cart that had been reminded counts as recovered, any other simply goes away. */
    public static function orderPlaced(string $email, string $orderId, float $total): void
    {
        $email = strtolower(trim($email));
        foreach (DB::table('abandoned_carts')->where('email', $email)->whereIn('status', ['active', 'reminded'])->get() as $cart) {
            if ($cart->reminders_sent > 0 || $cart->clicked_at) {
                DB::table('abandoned_carts')->where('id', $cart->id)->update([
                    'status' => 'recovered', 'recovered_at' => self::now(), 'recovered_order_id' => $orderId, 'recovered_total' => $total, 'updated_at' => self::now(),
                ]);
            } else {
                DB::table('abandoned_carts')->where('id', $cart->id)->delete();
            }
        }
    }

    /** The basket behind a recovery link, for the browser to refill its cart. */
    public static function recover(string $token): ?array
    {
        $cart = DB::table('abandoned_carts')->where('token', $token)->first();
        if (! $cart || in_array($cart->status, ['recovered'], true)) {
            return null;
        }
        DB::table('abandoned_carts')->where('id', $cart->id)->update(['clicked_at' => self::now(), 'updated_at' => self::now()]);

        return ['items' => json_decode((string) $cart->items, true) ?: [], 'email' => $cart->email, 'name' => $cart->name, 'coupon' => MailSettings::get('abandoned_coupon_code')];
    }

    public static function unsubscribe(string $token): bool
    {
        return DB::table('abandoned_carts')->where('token', $token)->update(['status' => 'unsubscribed', 'updated_at' => self::now()]) > 0;
    }

    /** Sends reminder number $n (1-3) of a cart now. */
    public static function sendReminder(object $cart, int $n): bool
    {
        $ok = Mailer::send('abandoned_'.$n, $cart->email, MailVars::cart($cart));
        if ($ok) {
            DB::table('abandoned_carts')->where('id', $cart->id)->update(['status' => 'reminded', 'reminders_sent' => max((int) $cart->reminders_sent, $n), 'last_reminder_at' => self::now(), 'updated_at' => self::now()]);
        }

        return $ok;
    }

    /**
     * The scheduled job (run every few minutes by cron): alerts the store about new abandoned carts, sends the due
     * reminders and retires old carts.
     *
     * @return array{alerts: int, reminders: int, expired: int, recovered: int}
     */
    public static function process(): array
    {
        $result = ['alerts' => 0, 'reminders' => 0, 'expired' => 0, 'recovered' => 0];
        $now = time();

        try {
            $expireDays = max(1, MailSettings::int('abandoned_expire_days'));
            $result['expired'] = DB::table('abandoned_carts')->whereIn('status', ['active', 'reminded'])
                ->where('last_activity_at', '<', now()->utc()->subDays($expireDays)->format('Y-m-d H:i:s'))
                ->update(['status' => 'expired', 'updated_at' => self::now()]);

            $max = max(1, min(3, MailSettings::int('abandoned_reminders')));
            $minValue = (float) MailSettings::get('abandoned_min_value');
            $delays = [1 => MailSettings::int('abandoned_delay_1') * 60, 2 => MailSettings::int('abandoned_delay_2') * 3600, 3 => MailSettings::int('abandoned_delay_3') * 3600];

            foreach (DB::table('abandoned_carts')->whereIn('status', ['active', 'reminded'])->orderBy('last_activity_at')->limit(200)->get() as $cart) {
                $activity = strtotime($cart->last_activity_at.' UTC');
                // An order placed after the cart was last touched means the shopper did buy: stop.
                $order = DB::table('orders')->where('email', $cart->email)->where('created_at', '>=', $cart->last_activity_at)->where('status', '!=', 'cancelled')->orderBy('created_at')->first();
                if ($order) {
                    self::orderPlaced($cart->email, $order->id, (float) $order->total);
                    $result['recovered']++;

                    continue;
                }
                if ((float) $cart->subtotal < $minValue) {
                    continue;
                }
                $idleMinutes = ($now - $activity) / 60;

                if (MailSettings::on('abandoned_notify_admin') && ! $cart->admin_notified_at && $idleMinutes >= max(1, MailSettings::int('abandoned_admin_after_minutes'))) {
                    Mailer::toAdmins('admin_abandoned_cart', MailVars::cart($cart));
                    Notifier::send('abandoned_cart', 'Abandoned cart', trim((string) ($cart->name ?: $cart->email)).' left '.MailVars::money((float) $cart->subtotal).' in their cart', '/admin/abandoned', 'abandoned:'.$cart->id);
                    DB::table('abandoned_carts')->where('id', $cart->id)->update(['admin_notified_at' => self::now()]);
                    $result['alerts']++;
                }

                if (! MailSettings::on('abandoned_enabled') || $cart->reminders_sent >= $max) {
                    continue;
                }
                $n = (int) $cart->reminders_sent + 1;
                $since = $n === 1 ? $now - $activity : $now - strtotime($cart->last_reminder_at.' UTC');
                if ($since >= $delays[$n] && self::sendReminder($cart, $n)) {
                    $result['reminders']++;
                }
            }
        } catch (\Throwable $e) {
            Log::error('[abandoned] run failed: '.$e->getMessage());
        }
        DB::table('mail_settings')->updateOrInsert(['key' => 'abandoned_last_run'], ['value' => self::now(), 'updated_at' => self::now()]);

        return $result;
    }

    public static function lastRun(): ?string
    {
        $v = DB::table('mail_settings')->where('key', 'abandoned_last_run')->value('value');

        return $v ? \Carbon\Carbon::parse($v, 'UTC')->format('Y-m-d\TH:i:s\Z') : null;
    }
}
