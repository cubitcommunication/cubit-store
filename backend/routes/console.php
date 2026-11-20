<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Abandoned-cart reminders and alerts (needs the hosting cron: php artisan schedule:run, every minute).
Schedule::command('shop:abandoned-carts')->everyFiveMinutes()->withoutOverlapping();
