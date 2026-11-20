<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Admin notifications go out as web push; tests replace this with a fake.
        $this->app->bind(\App\Support\Push\PushTransport::class, \App\Support\Push\WebPushTransport::class);
    }

    public function boot(): void
    {
        // Each limiter has its own counter, so normal browsing (many /api/query calls)
        // can never use up the sign-in allowance.
        RateLimiter::for('query', fn (Request $r) => Limit::perMinute(300)->by('query|'.$r->ip()));
        RateLimiter::for('sign-in', fn (Request $r) => Limit::perMinute(10)->by('sign-in|'.$r->ip()));
        RateLimiter::for('first-admin', fn (Request $r) => Limit::perMinute(5)->by('first-admin|'.$r->ip()));
        RateLimiter::for('newsletter', fn (Request $r) => Limit::perMinute(6)->by('newsletter|'.$r->ip()));
        RateLimiter::for('checkout', fn (Request $r) => Limit::perMinute(12)->by('checkout|'.$r->ip()));
        RateLimiter::for('account-auth', fn (Request $r) => Limit::perMinute(10)->by('account-auth|'.$r->ip()));
        RateLimiter::for('webhook', fn (Request $r) => Limit::perMinute(120)->by('webhook|'.$r->ip()));
        RateLimiter::for('password', fn (Request $r) => Limit::perMinute(10)->by('password|'.$r->ip()));
        RateLimiter::for('shipping', fn (Request $r) => Limit::perMinute(60)->by('shipping|'.$r->ip()));
    }
}
