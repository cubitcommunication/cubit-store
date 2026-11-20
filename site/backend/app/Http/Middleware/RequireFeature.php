<?php

namespace App\Http\Middleware;

use App\Support\Features;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Refuses a paid add-on's endpoints while the add-on is switched off: `->middleware('feature:offline_shop')`. */
class RequireFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        if (! Features::on($feature)) {
            return response()->json(['message' => 'This feature is not part of your plan.', 'feature' => $feature], 403);
        }

        return $next($request);
    }
}
