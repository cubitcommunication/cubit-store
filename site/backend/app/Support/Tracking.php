<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Google Analytics 4, Google Tag Manager, Microsoft Clarity, the Meta Pixel and search-engine verification tags.
 * The IDs are editable in the admin (Admin -> Integrations), so each one is checked against its exact format before
 * it is written into a page: a typo, or anything that is not a plain ID, simply switches that tool off instead of
 * reaching the HTML.
 */
final class Tracking
{
    public const KEYS = ['ga4_measurement_id', 'ga4_mode', 'gtm_container_id', 'clarity_project_id', 'meta_pixel_id', 'google_site_verification', 'bing_site_verification', 'recaptcha_site_key'];

    /** @return array{ga4: ?string, ga4_mode: string, gtm: ?string, clarity: ?string, meta: ?string, google_verify: ?string, bing_verify: ?string, recaptcha: ?string} */
    public static function ids(): array
    {
        $rows = DB::table('site_settings')->whereIn('key', self::KEYS)->pluck('value', 'key');
        $pick = fn (string $key, string $pattern) => preg_match($pattern, $v = trim((string) ($rows[$key] ?? ''))) === 1 ? $v : null;

        return [
            'ga4' => $pick('ga4_measurement_id', '/^G-[A-Z0-9]{4,20}$/'),
            // "direct": the site loads gtag.js itself. "gtm": Analytics lives inside the Tag Manager container.
            'ga4_mode' => trim((string) ($rows['ga4_mode'] ?? 'direct')) === 'gtm' ? 'gtm' : 'direct',
            'gtm' => $pick('gtm_container_id', '/^GTM-[A-Z0-9]{4,12}$/'),
            'clarity' => $pick('clarity_project_id', '/^[a-z0-9]{6,20}$/'),
            'meta' => $pick('meta_pixel_id', '/^[0-9]{8,20}$/'),
            'google_verify' => $pick('google_site_verification', '/^[A-Za-z0-9_\-]{20,100}$/'),
            'bing_verify' => $pick('bing_site_verification', '/^[A-Fa-f0-9]{20,64}$/'),
            'recaptcha' => $pick('recaptcha_site_key', '/^6L[A-Za-z0-9_\-]{30,50}$/'),
        ];
    }

    /** Visitors on the real site are counted; the owner's local testing and the admin panel are not. */
    public static function enabledFor(string $path, ?string $host = null): bool
    {
        if (app()->isLocal()) {
            return false;
        }
        // A copy opened on the owner's own computer is never counted, whatever the environment says.
        if ($host !== null && (in_array($host, ['localhost', '127.0.0.1', '::1'], true) || preg_match('/\.(test|local|localhost)$/', $host))) {
            return false;
        }

        return ! ($path === '/admin' || str_starts_with($path, '/admin/'));
    }

    /** Scripts and meta tags for the <head>. */
    public static function head(): string
    {
        $id = self::ids();
        $out = '';
        if ($id['google_verify']) {
            $out .= "<meta name=\"google-site-verification\" content=\"{$id['google_verify']}\">\n";
        }
        if ($id['bing_verify']) {
            $out .= "<meta name=\"msvalidate.01\" content=\"{$id['bing_verify']}\">\n";
        }
        // The shop's own events (add to cart, purchase...) are pushed to window.dataLayer by the web app.
        if ($id['gtm'] || $id['ga4']) {
            $out .= "<script>window.dataLayer=window.dataLayer||[];</script>\n";
        }
        if ($id['gtm']) {
            $out .= "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','{$id['gtm']}');</script>\n";
        }
        if ($id['ga4'] && $id['ga4_mode'] === 'direct') {
            $out .= "<script async src=\"https://www.googletagmanager.com/gtag/js?id={$id['ga4']}\"></script>\n"
                ."<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','{$id['ga4']}');</script>\n";
        }
        if ($id['clarity']) {
            $out .= "<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src=\"https://www.clarity.ms/tag/\"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,\"clarity\",\"script\",\"{$id['clarity']}\");</script>\n";
        }
        if ($id['meta']) {
            $out .= "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','{$id['meta']}');fbq('track','PageView');</script>\n";
        }

        return $out;
    }

    /** Fallbacks that go right after <body> (Tag Manager and Meta Pixel for visitors without JavaScript). */
    public static function body(): string
    {
        $id = self::ids();
        $out = '';
        if ($id['gtm']) {
            $out .= "<noscript><iframe src=\"https://www.googletagmanager.com/ns.html?id={$id['gtm']}\" height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"></iframe></noscript>\n";
        }
        if ($id['meta']) {
            $out .= "<noscript><img height=\"1\" width=\"1\" style=\"display:none\" alt=\"\" src=\"https://www.facebook.com/tr?id={$id['meta']}&amp;ev=PageView&amp;noscript=1\"></noscript>\n";
        }

        return $out;
    }
}
