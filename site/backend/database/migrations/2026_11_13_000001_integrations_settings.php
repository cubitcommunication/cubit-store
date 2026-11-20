<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Third-party tools get their own admin page (Admin -> Integrations). The tracking IDs move there from the
 * SEO page, and the new fields (how Analytics is installed, Meta Pixel, search-engine verification and the
 * reCAPTCHA site key) are added. Secrets (reCAPTCHA secret, Razorpay keys, SMTP) stay in the server .env.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');

        // Existing tracking settings: same keys and values, new home.
        $moves = [
            'ga4_measurement_id' => ['Google Analytics 4 measurement ID', 'Looks like G-XXXXXXXXXX. Leave empty to turn Analytics off.', 100],
            'gtm_container_id' => ['Google Tag Manager container ID', 'Looks like GTM-XXXXXXX. Leave empty to turn Tag Manager off.', 120],
            'clarity_project_id' => ['Microsoft Clarity project ID', 'The short code from your Clarity project. Leave empty to turn Clarity off.', 200],
        ];
        foreach ($moves as $key => [$label, $help, $sort]) {
            DB::table('site_settings')->where('key', $key)->update(['group_name' => 'integrations', 'label' => $label, 'help' => $help, 'sort_order' => $sort]);
        }

        $new = [
            ['ga4_mode', 'How Google Analytics is installed', 'direct', 'direct = the site loads Analytics itself with the ID above. gtm = Analytics is a tag inside your Tag Manager container (the site then loads only Tag Manager, so visits are never counted twice).', 110],
            ['google_site_verification', 'Google Search Console verification code', '', 'The content="…" value of the HTML-tag method in Search Console. Leave empty if not used.', 130],
            ['bing_site_verification', 'Bing Webmaster verification code', '', 'The msvalidate.01 value from Bing Webmaster Tools. Leave empty if not used.', 140],
            ['meta_pixel_id', 'Meta (Facebook / Instagram) Pixel ID', '', 'A number of 8–20 digits from Meta Events Manager. Leave empty to turn the Pixel off.', 300],
            ['recaptcha_site_key', 'Google reCAPTCHA v3 site key', '', 'The public site key (starts with 6L). The secret key goes only in the server .env as RECAPTCHA_SECRET_KEY.', 400],
        ];
        foreach ($new as [$key, $label, $value, $help, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => 'integrations', 'label' => $label, 'help' => $help,
                'multiline' => 0, 'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', ['ga4_mode', 'google_site_verification', 'bing_site_verification', 'meta_pixel_id', 'recaptcha_site_key'])->delete();
        DB::table('site_settings')->whereIn('key', ['ga4_measurement_id', 'gtm_container_id', 'clarity_project_id'])->update(['group_name' => 'seo']);
    }
};
