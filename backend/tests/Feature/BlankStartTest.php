<?php

namespace Tests\Feature;

use App\Support\Installer;
use App\Support\Seo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BlankStartTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_store_has_no_menu_no_announcement_and_no_published_policies(): void
    {
        $this->assertSame(0, DB::table('site_nav')->count());
        foreach (['announcement', 'announcement_url', 'announcement_2', 'announcement_2_url'] as $key) {
            $this->assertSame('', (string) DB::table('site_settings')->where('key', $key)->value('value'), $key);
        }
        $this->assertSame(0, DB::table('pages')->where('kind', 'policy')->where('published', 1)->count());
        $this->assertGreaterThan(0, DB::table('pages')->where('kind', 'policy')->count()); // the starter texts are kept as drafts
        $this->assertSame(0, DB::table('categories')->count());
        $this->assertSame(0, DB::table('collections')->where('slug', 'like', '%diwali%')->count());
    }

    public function test_prices_follow_the_stores_own_currency_and_grouping(): void
    {
        config(['brand.currency_symbol' => '$', 'brand.locale' => 'en-US']);
        $this->assertSame('$125,000', Seo::price(125000));

        config(['brand.currency_symbol' => '₹', 'brand.locale' => 'en-IN']);
        $this->assertSame('₹1,25,000', Seo::price(125000));
    }

    public function test_the_installer_writes_the_money_and_place_settings(): void
    {
        config(['brand.currency_symbol' => '€', 'brand.currency_code' => 'EUR', 'brand.locale' => 'de-DE', 'brand.timezone' => 'Europe/Berlin', 'brand.country' => 'Germany']);
        $env = \Dotenv\Dotenv::parse(Installer::envContents([
            'siteName' => 'Acme', 'siteUrl' => 'https://acme.test', 'adminEmail' => 'a@acme.test', 'dbName' => 'x', 'dbUser' => 'y', 'dbPassword' => 'z',
        ]));

        $this->assertSame('€', $env['BRAND_CURRENCY_SYMBOL']);
        $this->assertSame('EUR', $env['BRAND_CURRENCY_CODE']);
        $this->assertSame('de-DE', $env['BRAND_LOCALE']);
        $this->assertSame('Europe/Berlin', $env['BRAND_TIMEZONE']);
        $this->assertSame('Germany', $env['BRAND_COUNTRY']);
    }
}
