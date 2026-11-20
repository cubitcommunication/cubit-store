<?php

namespace App\Support\Mail;

use App\Support\Brand;
use Illuminate\Support\Facades\DB;

/**
 * The store's e-mail settings, edited in Admin -> Emails (company addresses, who gets alerts, abandoned-cart rules).
 * Stored in the admin-only `mail_settings` table. SMTP login details are NOT here: they stay in the server .env.
 */
final class MailSettings
{
    private static ?array $cache = null;

    /** key => [default, label] — the defaults apply until the owner saves a value. */
    public static function defaults(): array
    {
        $orders = (string) (config('mail.from.address') ?: Brand::get('orders_email'));
        $support = (string) (DB::table('site_settings')->where('key', 'email')->value('value') ?: Brand::get('support_email'));
        $alerts = (string) (config('shop.order_notify') ?: $orders);

        return [
            'from_name' => Brand::name(),
            'orders_email' => $orders,
            'support_email' => $support,
            'admin_emails' => $alerts,
            'send_customer_emails' => '1',
            'notify_admin_new_order' => '1',
            'notify_admin_payment' => '1',
            'notify_admin_cancel' => '1',
            'abandoned_enabled' => '1',
            'abandoned_delay_1' => '60',      // minutes after the shopper's last activity
            'abandoned_delay_2' => '24',      // hours after reminder 1
            'abandoned_delay_3' => '72',      // hours after reminder 2
            'abandoned_reminders' => '3',     // 1 to 3
            'abandoned_expire_days' => '14',
            'abandoned_min_value' => '0',
            'abandoned_coupon_code' => '',
            'abandoned_notify_admin' => '1',
            'abandoned_admin_after_minutes' => '60',
        ];
    }

    public static function forget(): void
    {
        self::$cache = null;
    }

    /** @return array<string,string> */
    public static function all(): array
    {
        if (self::$cache === null) {
            $stored = DB::table('mail_settings')->pluck('value', 'key')->all();
            self::$cache = array_merge(self::defaults(), array_map(fn ($v) => (string) $v, $stored));
        }

        return self::$cache;
    }

    public static function get(string $key): string
    {
        return self::all()[$key] ?? '';
    }

    public static function on(string $key): bool
    {
        return self::get($key) === '1';
    }

    public static function int(string $key): int
    {
        return (int) self::get($key);
    }

    /** @return string[] valid addresses of the alert recipients */
    public static function adminEmails(): array
    {
        $list = preg_split('/[\s,;]+/', self::get('admin_emails')) ?: [];

        return array_values(array_unique(array_filter($list, fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL))));
    }

    /** Saves the given keys (unknown keys are ignored). */
    public static function save(array $values): void
    {
        $known = array_keys(self::defaults());
        $now = now()->utc()->format('Y-m-d H:i:s');
        foreach ($values as $key => $value) {
            if (! in_array($key, $known, true)) {
                continue;
            }
            DB::table('mail_settings')->updateOrInsert(['key' => $key], ['value' => trim((string) $value), 'updated_at' => $now]);
        }
        self::forget();
    }
}
