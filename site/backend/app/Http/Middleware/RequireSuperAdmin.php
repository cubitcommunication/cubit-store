<?php

namespace App\Http\Middleware;

use App\Support\AdminAuth;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Integrations, payment keys and mail servers are for the main administrator only. Checked on every call. */
class RequireSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! AdminAuth::isSuper($request)) {
            return response()->json(['message' => 'Only the main administrator can do this.'], 403);
        }

        return $next($request);
    }
}
