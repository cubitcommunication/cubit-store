<?php

namespace App\Http\Middleware;

use App\Support\Recaptcha;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Usage: ->middleware('recaptcha:register,0.5'). Does nothing until reCAPTCHA is fully set up. */
class VerifyRecaptcha
{
    public function handle(Request $request, Closure $next, string $action, string $minScore = '0.5'): Response
    {
        if (! Recaptcha::active()) {
            return $next($request);
        }
        $problem = Recaptcha::check($request, $action, (float) $minScore);

        return $problem === null ? $next($request) : response()->json(['message' => $problem], 422);
    }
}
