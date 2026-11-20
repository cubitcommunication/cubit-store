<?php

namespace App\Http\Middleware;

use App\Support\AdminAuth;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Authorization is always re-checked on the server; hiding buttons is never the boundary. */
class RequireAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! AdminAuth::isAdmin($request)) {
            return response()->json(['message' => 'Not signed in.'], 401);
        }

        return $next($request);
    }
}
