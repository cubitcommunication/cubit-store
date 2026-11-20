<?php

namespace App\Http\Middleware;

use App\Support\Updater;
use Closure;
use Illuminate\Http\Request;

/** Applies a freshly pulled release (migrations, cache refresh) on its first request: see App\Support\Updater. */
class AutoUpdate
{
    public function handle(Request $request, Closure $next)
    {
        if (! app()->runningUnitTests()) {
            Updater::runIfPending();
        }

        return $next($request);
    }
}
