<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * CSRF protection for the cookie-authenticated JSON API.
 *
 * Every state-changing request must (1) come from this site when the browser
 * says where it came from, and (2) carry the X-Requested-With header the web
 * app always sends. A form on another site can set neither.
 */
class SameOriginWrites
{
    public function handle(Request $request, Closure $next): Response
    {
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        $origin = $request->headers->get('Origin');
        if ($origin !== null && $origin !== '' && $origin !== 'null') {
            $originHost = parse_url($origin, PHP_URL_HOST);
            $originPort = parse_url($origin, PHP_URL_PORT);
            $same = $originHost === $request->getHost()
                || in_array($originHost, $this->trustedHosts(), true);
            // Vite dev server (different port, same host name) is allowed in local development only.
            if (! $same && app()->environment('local') && in_array($originHost, ['localhost', '127.0.0.1'], true)) {
                $same = true;
            }
            if (! $same) {
                return response()->json(['message' => 'Cross-site request blocked.'], 403);
            }
            unset($originPort);
        }

        if ($request->headers->get('X-Requested-With') !== 'XMLHttpRequest') {
            return response()->json(['message' => 'Cross-site request blocked.'], 403);
        }

        return $next($request);
    }

    /** @return string[] */
    private function trustedHosts(): array
    {
        $host = parse_url((string) config('shop.site_url'), PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return [];
        }

        return [$host, 'www.'.$host, preg_replace('/^www\./', '', $host)];
    }
}
