<?php

namespace App\Http\Controllers;

use App\Support\Brand;
use App\Support\Installer;
use App\Support\Seo;
use App\Support\StorefrontGate;
use App\Support\Tracking;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Serves the React single-page app. The built index.html (renamed app.html by
 * the frontend build) is read per request so the right <title>, Open Graph
 * tags and JSON-LD can be written into it, and so unknown product, collection
 * and category addresses return real 404 / 301 responses instead of a blank 200.
 */
class SpaController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $path = '/'.ltrim($request->path(), '/');

        // API paths that matched no route must answer JSON, never the web app.
        if ($path === '/api' || str_starts_with($path, '/api/')) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        // A brand-new site (no .env yet): only the installer form, without any database work.
        if (Installer::needed() && is_file(public_path('app.html'))) {
            $html = (string) file_get_contents(public_path('app.html'));
            $head = '<meta name="robots" content="noindex, nofollow" data-shop-ssr><title data-shop-ssr>Set up your store</title><script>window.__INSTALL__=true;</script>';
            $html = str_contains($html, '<!--SHOP_HEAD-->') ? str_replace('<!--SHOP_HEAD-->', $head, $html) : str_replace('</head>', $head.'</head>', $html);

            return response($html, 200, ['Content-Type' => 'text/html; charset=utf-8', 'Cache-Control' => 'no-store']);
        }

        // Password-protected store: search engines get no page details and are told not to index it.
        $locked = ! str_starts_with($path, '/admin') && ! StorefrontGate::allows($request);
        $page = $locked
            ? ['redirect' => null, 'status' => 200, 'meta' => '<meta name="robots" content="noindex, nofollow" data-shop-ssr>']
            : Seo::resolve($path, $request->query());

        if ($page['redirect']) {
            return redirect($page['redirect'], 301);
        }

        $file = public_path('app.html');
        if (! is_file($file)) {
            return response(
                'The '.Brand::name().' web app has not been built yet. Run "npm run build" in /frontend, then copy frontend/dist into backend/public '
                .'(or use the Vite dev server at http://localhost:5173 while developing).',
                503,
                ['Content-Type' => 'text/plain; charset=utf-8'],
            );
        }

        $html = (string) file_get_contents($file);
        // The store's name and contact details for the web app (read by frontend/src/config/brand.ts).
        $meta = Brand::script().$page['meta'];
        if (Tracking::enabledFor($path, $request->getHost())) {
            // Analytics tags go with the page head; they carry no data-shop-ssr marker, so the app keeps them.
            $meta .= Tracking::head();
            if (($body = Tracking::body()) !== '') {
                $html = preg_replace('/<body([^>]*)>/i', '<body$1>'.str_replace('$', '\$', $body), $html, 1) ?? $html;
            }
        }
        if ($meta !== '') {
            $marker = '<!--SHOP_HEAD-->';
            $at = strpos($html, $marker);
            if ($at !== false) {
                $html = substr_replace($html, $meta, $at, strlen($marker));
            } elseif (($end = strpos($html, '</head>')) !== false) {
                $html = substr_replace($html, $meta, $end, 0);
            }
        }

        return response($html, $page['status'], [
            'Content-Type' => 'text/html; charset=utf-8',
            'Cache-Control' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
