<?php

namespace App\Support;

/**
 * Paid add-ons. A feature is switched on by the vendor with a line in backend/.env (for example FEATURE_OFFLINE_SHOP=true,
 * then `php artisan config:cache`), not from the admin panel, so a store only gets what it has paid for. Everything an
 * add-on adds is refused by the server while it is off (see App\Http\Middleware\RequireFeature), and the admin panel hides it.
 */
final class Features
{
    /** Offline shop: Quick sell by barcode, barcode and piece labels, shop customers, and the online/shop split in reports. */
    public const OFFLINE_SHOP = 'offline_shop';

    /** External storefront API: a client's own website reads this catalogue and posts its orders here (/api/public/*). */
    public const EXTERNAL_STOREFRONT = 'external_storefront';

    public static function on(string $feature): bool
    {
        return (bool) config('shop.features.'.$feature, false);
    }

    /** @return array<string, bool> every add-on and whether it is on (what the admin panel is told). */
    public static function all(): array
    {
        return [self::OFFLINE_SHOP => self::on(self::OFFLINE_SHOP), self::EXTERNAL_STOREFRONT => self::on(self::EXTERNAL_STOREFRONT)];
    }
}
