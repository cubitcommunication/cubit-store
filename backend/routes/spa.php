<?php

use App\Http\Controllers\SitemapController;
use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

// Dynamic sitemap built from the catalogue.
Route::get('/sitemap.xml', SitemapController::class);

// robots.txt is built here so its Sitemap line carries this site's own address.
Route::get('/robots.txt', function () {
    $rules = ['Googlebot', 'Bingbot', 'Twitterbot', 'facebookexternalhit'];
    $out = '';
    foreach ($rules as $bot) {
        $out .= "User-agent: {$bot}
Allow: /

";
    }
    $out .= "User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /api/

";
    $out .= 'Sitemap: '.\App\Support\Brand::siteUrl()."/sitemap.xml
";

    return response($out, 200, ['Content-Type' => 'text/plain; charset=utf-8']);
});

// Every other address belongs to the React app (client-side routing). The controller
// writes the right <head> for the page and answers real 404 / 301 statuses.
Route::get('/', SpaController::class);
Route::fallback(SpaController::class);
