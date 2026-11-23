<?php

use App\Http\Middleware\RequireAdmin;
use App\Http\Middleware\SameOriginWrites;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            // Public pages (React app shell + sitemap): no session, no cookies, no CSRF machinery.
            Route::middleware([])->group(base_path('routes/spa.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Hostinger terminates HTTPS in front of PHP; trust it so cookies get the Secure flag.
        $middleware->trustProxies(at: '*');
        // Only runs on the real domain: see App\Http\Middleware\CanonicalHost.
        $middleware->prepend(\App\Http\Middleware\CanonicalHost::class);
        // After Hostinger pulls a new release, the first request finishes the update (migrations, caches): no SSH needed.
        $middleware->prepend(\App\Http\Middleware\AutoUpdate::class);
        $middleware->alias([
            'admin' => RequireAdmin::class,
            'admin.super' => \App\Http\Middleware\RequireSuperAdmin::class,
            'admin.log' => \App\Http\Middleware\LogAdminActivity::class,
            'same-origin' => SameOriginWrites::class,
            'feature' => \App\Http\Middleware\RequireFeature::class,
            'storefront' => \App\Http\Middleware\StorefrontPassword::class,
            'storefront-api' => \App\Http\Middleware\StorefrontApi::class,
            'recaptcha' => \App\Http\Middleware\VerifyRecaptcha::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request, Throwable $e) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();

/*
| Single-folder hosting layout: the app lives in <site>/backend and the website's
| index.php sits one level up. Web requests already point public_path() there
| (public/index.php does it), but command-line runs (php artisan ...) never go
| through index.php. Do it here too, so images imported or uploaded from the
| command line land in <site>/media, the folder the web server really serves,
| instead of backend/public/media, which every deploy replaces.
*/
if (is_file(dirname(__DIR__, 2).'/index.php') && is_dir(dirname(__DIR__, 2).'/assets')) {
    $app->usePublicPath(dirname(__DIR__, 2));
}

return $app;
