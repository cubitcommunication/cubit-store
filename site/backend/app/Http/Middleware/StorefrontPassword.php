<?php

namespace App\Http\Middleware;

use App\Support\StorefrontGate;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** While the storefront password is on, the shop's data and shopping endpoints answer only people who unlocked it (and admins). */
class StorefrontPassword
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! StorefrontGate::allows($request)) {
            return response()->json(['data' => null, 'count' => null, 'locked' => true, 'message' => 'This store is password protected.', 'error' => ['message' => 'This store is password protected.']], 403);
        }

        return $next($request);
    }
}
