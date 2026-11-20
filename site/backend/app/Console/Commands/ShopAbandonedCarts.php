<?php

namespace App\Console\Commands;

use App\Support\AbandonedCarts;
use Illuminate\Console\Command;

/**
 * Sends the due abandoned-cart reminders and the store alerts (see App\Support\AbandonedCarts).
 * Run it every 5-15 minutes from the hosting control panel's cron:  php artisan shop:abandoned-carts
 * (or run `php artisan schedule:run` every minute: it calls this command on its own schedule).
 */
class ShopAbandonedCarts extends Command
{
    protected $signature = 'shop:abandoned-carts';

    protected $description = 'Send abandoned-cart reminders and alerts';

    public function handle(): int
    {
        $r = AbandonedCarts::process();
        $this->info("Alerts: {$r['alerts']}, reminders: {$r['reminders']}, recovered: {$r['recovered']}, expired: {$r['expired']}");

        return self::SUCCESS;
    }
}
