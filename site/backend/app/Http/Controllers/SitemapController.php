<?php

namespace App\Http\Controllers;

use App\Support\Seo;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sitemap generated straight from the catalogue. Only published, non-archived
 * public pages appear — admin, API and draft URLs never do.
 */
class SitemapController extends Controller
{
    public function __invoke(): Response
    {
        // A password-protected store lists nothing for search engines.
        if (\App\Support\StorefrontGate::enabled()) {
            abort(404);
        }

        $entries = [];
        foreach ([
            '/', '/shop', '/collections', '/about', '/contact', '/blog',
        ] as $path) {
            $entries[$path] = null;
        }

        foreach (DB::table('products')->where('published', 1)->whereNull('archived_at')->orderByDesc('updated_at')->get(['slug', 'updated_at']) as $row) {
            $entries['/product/'.rawurlencode($row->slug)] = $row->updated_at;
        }
        foreach (DB::table('collections')->where('published', 1)->orderBy('sort_order')->get(['slug', 'updated_at']) as $row) {
            $entries['/collection/'.rawurlencode($row->slug)] = $row->updated_at;
        }
        foreach (DB::table('pages')->where('kind', 'page')->where('published', 1)->get(['slug', 'updated_at']) as $row) {
            $entries['/pages/'.rawurlencode($row->slug)] = $row->updated_at;
        }
        foreach (DB::table('pages')->where('kind', 'policy')->where('published', 1)->get(['slug', 'updated_at']) as $row) {
            $entries['/policies/'.rawurlencode($row->slug)] = $row->updated_at;
        }
        foreach (DB::table('pages')->where('kind', 'post')->where('published', 1)->get(['slug', 'updated_at']) as $row) {
            $entries['/blog/'.rawurlencode($row->slug)] = $row->updated_at;
        }
        foreach (DB::table('categories')->where('published', 1)->orderBy('sort_order')->get(['slug', 'updated_at']) as $row) {
            $entries['/collections/'.rawurlencode($row->slug)] = $row->updated_at;
            $entries['/category/'.rawurlencode($row->slug)] = $row->updated_at;
        }

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n".'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n";
        foreach ($entries as $path => $lastmod) {
            $xml .= "  <url>\n    <loc>".htmlspecialchars(Seo::absoluteUrl($path), ENT_XML1 | ENT_QUOTES, 'UTF-8')."</loc>\n";
            if ($lastmod) {
                $xml .= '    <lastmod>'.\Carbon\Carbon::parse($lastmod, 'UTC')->utc()->format('Y-m-d\TH:i:s\Z')."</lastmod>\n";
            }
            $xml .= "  </url>\n";
        }
        $xml .= '</urlset>';

        return response($xml, 200, [
            'Content-Type' => 'application/xml; charset=utf-8',
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }
}
