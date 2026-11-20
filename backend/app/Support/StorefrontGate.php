<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Storefront password (like Shopify's "Password protection"): while it is on, only people who know the password, and
 * signed-in admins, can see the shop. Enforced on the server (the data API and the shopping endpoints refuse everyone else),
 * not just hidden in the browser. The password is stored encrypted (secure_settings) and never returned; the visitor's
 * cookie holds only an HMAC of it, so changing the password signs every visitor out.
 */
final class StorefrontGate
{
    public const PASSWORD = 'storefront_password';
    public const COOKIE = 'shop_gate';

    private static ?array $cache = null;

    public static function forget(): void
    {
        self::$cache = null;
    }

    /** @return array{enabled: string, message: string} */
    private static function settings(): array
    {
        if (self::$cache === null) {
            self::$cache = ['enabled' => '0', 'message' => ''];
            try {
                $rows = DB::table('site_settings')->whereIn('key', ['storefront_password_enabled', 'storefront_password_message'])->pluck('value', 'key');
                self::$cache = ['enabled' => (string) ($rows['storefront_password_enabled'] ?? '0'), 'message' => (string) ($rows['storefront_password_message'] ?? '')];
            } catch (\Throwable) {
                // the settings do not exist yet (before the migration): the shop is open
            }
        }

        return self::$cache;
    }

    public static function passwordSet(): bool
    {
        return Secrets::get(self::PASSWORD) !== '';
    }

    /** On, and there is a password to ask for (without one the shop stays open rather than locking everyone out). */
    public static function enabled(): bool
    {
        return self::settings()['enabled'] === '1' && self::passwordSet();
    }

    public static function message(): string
    {
        return trim(self::settings()['message']) ?: 'This store is not open to the public yet. Enter the password to take a look.';
    }

    private static function token(): string
    {
        return hash_hmac('sha256', 'storefront-gate|'.Secrets::get(self::PASSWORD), (string) config('app.key'));
    }

    public static function check(string $password): bool
    {
        $real = Secrets::get(self::PASSWORD);

        return $real !== '' && hash_equals($real, $password);
    }

    public static function cookie(Request $request): Cookie
    {
        return new Cookie(self::COOKIE, self::token(), now()->addDays(30)->getTimestamp(), '/', null, $request->isSecure(), true, false, Cookie::SAMESITE_LAX);
    }

    /** May this visitor see the shop? Everyone when it is open; otherwise admins and people who entered the password. */
    public static function allows(Request $request): bool
    {
        if (! self::enabled()) {
            return true;
        }
        if (AdminAuth::isAdmin($request)) {
            return true;
        }
        $given = $request->cookie(self::COOKIE);

        return is_string($given) && $given !== '' && hash_equals(self::token(), $given);
    }
}
