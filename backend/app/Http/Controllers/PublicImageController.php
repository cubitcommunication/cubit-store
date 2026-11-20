<?php

namespace App\Http\Controllers;

use App\Support\Media;
use Symfony\Component\HttpFoundation\Response;

/**
 * PHP fallback for /api/public/img/*. Apache normally serves these files
 * directly from disk; this route covers the PHP built-in server (local
 * development) and hosts where the rewrite rule is unavailable.
 */
class PublicImageController extends Controller
{
    public function __invoke(string $path): Response
    {
        if (! Media::exists($path)) {
            abort(404);
        }

        $headers = [
            'Content-Type' => Media::contentTypeFor($path),
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ];
        // An SVG is code: when opened on its own address it may draw, but nothing in it can run.
        if (strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'svg') {
            $headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
        }

        return response()->file(Media::path($path), $headers);
    }
}
