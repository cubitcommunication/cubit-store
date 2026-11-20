<?php

namespace App\Http\Middleware;

use App\Support\Features;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate for the external storefront API (/api/public/products|coupon|order).
 *
 * That API exists for sites that are NOT this app's own React storefront: a client's hand-built or static website
 * that should still read its catalogue from this admin and write its orders into it. Those requests come from
 * another origin, so they cannot pass `same-origin`; this middleware is what stands in its place.
 *
 * Three locks, all off by default:
 *   - the add-on itself (FEATURE_EXTERNAL_STOREFRONT),
 *   - an allow-list of origins that may call it (STOREFRONT_API_ORIGINS),
 *   - the CORS headers, which are only sent for an origin on that list.
 *
 * An Origin header can be forged by anything that is not a browser, so the allow-list stops other websites from
 * using this store's API, not a determined script. Order intake is therefore rate limited as well, and the orders
 * it writes are ordinary unpaid orders that staff confirm, exactly like the ones the WhatsApp flow already creates.
 */
final class StorefrontApi
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! Features::on(Features::EXTERNAL_STOREFRONT)) {
            return response()->json(['ok' => false, 'error' => 'Not available.'], 404);
        }

        $origin = (string) $request->headers->get('Origin', '');
        $allowed = self::origins();

        // A browser always sends Origin on a cross-site request. Same-origin calls and server-to-server calls
        // (no Origin at all) are let through: they cannot be driven by another website.
        if ($origin !== '' && ! in_array($origin, $allowed, true)) {
            return response()->json(['ok' => false, 'error' => 'This website is not allowed to use the store API.'], 403);
        }

        if ($request->getMethod() === 'OPTIONS') {
            return self::cors(response('', 204), $origin, $allowed);
        }

        return self::cors($next($request), $origin, $allowed);
    }

    /** @return string[] origins exactly as a browser sends them, e.g. https://www.example.com */
    public static function origins(): array
    {
        $raw = (string) config('shop.storefront_api.origins', '');

        return array_values(array_filter(array_map(
            fn ($o) => rtrim(trim($o), '/'),
            explode(',', $raw)
        )));
    }

    private static function cors(Response $response, string $origin, array $allowed): Response
    {
        if ($origin !== '' && in_array($origin, $allowed, true)) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Vary', 'Origin');
            $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            $response->headers->set('Access-Control-Allow-Headers', 'Content-Type');
            $response->headers->set('Access-Control-Max-Age', '86400');
        }

        return $response;
    }
}
