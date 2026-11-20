<?php

namespace Tests\Feature;

use App\Support\Brand;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BrandTest extends TestCase
{
    use RefreshDatabase;

    private function rename(): void
    {
        config([
            'brand.name' => 'Acme Gems', 'brand.support_email' => 'hello@acme.test', 'brand.phone_e164' => '911234567890',
            'brand.instagram_url' => 'https://www.instagram.com/acme/', 'brand.facebook_url' => '',
            'shop.site_url' => 'https://acme.test',
        ]);
    }

    private function page(string $path): string
    {
        $html = '';
        $this->withAppShell(function () use ($path, &$html) {
            $html = $this->get($path)->getContent();
        });

        return $html;
    }

    public function test_the_page_head_uses_the_configured_store_name(): void
    {
        $this->rename();

        $html = $this->page('/shop');

        $this->assertStringContainsString('Shop — Acme Gems', $html);
        $this->assertStringNotContainsString('Your Store', $html);
        $this->assertStringContainsString('content="Acme Gems"', $html); // og:site_name
        $this->assertStringContainsString('https://acme.test/shop', $html);
    }

    public function test_the_home_page_organisation_data_uses_the_brand_details(): void
    {
        $this->rename();

        $html = $this->page('/');

        $this->assertStringContainsString('"name":"Acme Gems"', $html);
        $this->assertStringContainsString('"email":"hello@acme.test"', $html);
        $this->assertStringContainsString('"telephone":"+911234567890"', $html);
        $this->assertStringContainsString('"sameAs":["https://www.instagram.com/acme/"]', $html);
    }

    public function test_the_web_app_receives_the_brand_in_the_page(): void
    {
        $this->rename();

        $html = $this->page('/');

        $this->assertStringContainsString('window.__BRAND__=', $html);
        $this->assertStringContainsString('"name":"Acme Gems"', $html);
        $this->assertStringContainsString('"websiteLabel":"acme.test"', $html);
    }

    public function test_robots_txt_points_to_this_sites_sitemap(): void
    {
        $this->rename();

        $body = $this->get('/robots.txt')->assertOk()->getContent();

        $this->assertStringContainsString('Sitemap: https://acme.test/sitemap.xml', $body);
        $this->assertStringContainsString('Disallow: /admin', $body);
    }

    public function test_the_public_brand_endpoint_and_placeholders(): void
    {
        $this->rename();

        $this->getJson('/api/brand')->assertOk()->assertJsonPath('name', 'Acme Gems')->assertJsonPath('email', 'hello@acme.test');
        $this->assertSame('Hi Acme Gems', Brand::fill('Hi {brand}'));
        $this->assertSame('Say \"hi\"', Brand::fillJson('Say \"hi\"'));
    }
}
