<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Analytics, Tag Manager and Clarity: on for visitors, off for the admin and for bad IDs. */
class TrackingTest extends TestCase
{
    use RefreshDatabase;

    private function set(string $key, string $value): void
    {
        DB::table('site_settings')->where('key', $key)->update(['value' => $value]);
    }

    private function page(string $path = '/'): string
    {
        $html = '';
        $this->withAppShell(function () use ($path, &$html) {
            $html = $this->get('https://example.com'.$path)->getContent();
        });

        return $html;
    }

    public function test_the_ids_from_the_old_site_are_on_every_public_page(): void
    {
        foreach (['/', '/shop', '/about'] as $path) {
            $html = $this->page($path);
            $this->assertStringContainsString('https://www.googletagmanager.com/gtag/js?id=G-4CE5N44PGB', $html, $path);
            $this->assertStringContainsString("gtag('config','G-4CE5N44PGB')", $html, $path);
            $this->assertStringContainsString('"https://www.clarity.ms/tag/"', $html, $path);
            $this->assertStringContainsString('"ylt7uihcpe"', $html, $path);
        }
        // The Tag Manager container from the old site: head script plus the page-body fallback.
        $html = $this->page();
        $this->assertStringContainsString("'dataLayer','GTM-NM967FPR'", $html);
        $this->assertStringContainsString('https://www.googletagmanager.com/ns.html?id=GTM-NM967FPR', $html);
    }

    public function test_the_admin_panel_and_local_development_are_never_counted(): void
    {
        $this->assertStringNotContainsString('G-4CE5N44PGB', $this->page('/admin/dashboard'));

        $this->app->detectEnvironment(fn () => 'local');
        $this->assertStringNotContainsString('G-4CE5N44PGB', $this->page('/'));
    }

    public function test_an_empty_id_switches_that_tool_off(): void
    {
        $this->set('clarity_project_id', '');
        $this->set('ga4_measurement_id', '');
        $this->set('gtm_container_id', '');
        $html = $this->page();
        foreach (['clarity', 'gtag', 'gtm.js', 'ns.html'] as $gone) {
            $this->assertStringNotContainsString($gone, $html, $gone);
        }
    }

    public function test_anything_that_is_not_a_plain_id_never_reaches_the_page(): void
    {
        $this->set('ga4_measurement_id', 'G-ABCD1234"></script><script>alert(1)</script>');
        $this->set('clarity_project_id', 'abc");alert(2);//');
        $this->set('gtm_container_id', "GTM-X'});alert(3);//");
        $html = $this->page();
        foreach (['alert(1)', 'alert(2)', 'alert(3)', 'gtag', 'clarity', 'gtm.js'] as $bad) {
            $this->assertStringNotContainsString($bad, $html, $bad);
        }
    }

    public function test_a_tag_manager_container_adds_its_head_script_and_the_body_fallback(): void
    {
        $this->set('gtm_container_id', 'GTM-ABC1234');
        $html = $this->page();
        $this->assertStringContainsString("'dataLayer','GTM-ABC1234'", $html);
        $this->assertStringContainsString('https://www.googletagmanager.com/ns.html?id=GTM-ABC1234', $html);
        $this->assertLessThan(strpos($html, 'ns.html'), strpos($html, '<body>'));       // the fallback sits inside <body>
        $this->assertLessThan(strpos($html, '</head>'), strpos($html, 'gtm.js'));        // the script sits inside <head>
    }

    public function test_a_copy_opened_on_localhost_is_never_counted_even_in_production_mode(): void
    {
        $html = '';
        $this->withAppShell(function () use (&$html) {
            $html = $this->get('http://127.0.0.1:8000/')->getContent();
        });
        $this->assertStringNotContainsString('G-4CE5N44PGB', $html);
        $this->assertStringContainsString('G-4CE5N44PGB', $this->page());   // the real domain still is
    }
}
