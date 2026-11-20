<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sends every page address that is not the site's own domain (the old test subdomain, www., or any other
 * name pointed at this server) to the same page on SITE_URL with a permanent redirect, so the site only ever
 * runs on example.com.
 *
 * It is switched on with FORCE_CANONICAL_HOST=true in backend/.env, after the domain has gone live, so it can
 * never lock you out of a preview address while the move is still in progress. Only GET and HEAD requests are
 * redirected; forms and API writes are left alone.
 */
class CanonicalHost
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('shop.force_canonical_host') || app()->isLocal() || ! $request->isMethodSafe() || $request->is('up')) {
            return $next($request);
        }

        $canonical = parse_url((string) config('shop.site_url'), PHP_URL_HOST);
        if (! is_string($canonical) || $canonical === '' || strcasecmp($request->getHost(), $canonical) === 0) {
            return $next($request);
        }

        return redirect()->to(rtrim((string) config('shop.site_url'), '/').$request->getRequestUri(), 301);
    }
}
