<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The site runs on example.com only once FORCE_CANONICAL_HOST is on. */
class CanonicalHostTest extends TestCase
{
    use RefreshDatabase;

    private function on(): void
    {
        config(['shop.force_canonical_host' => true, 'shop.site_url' => 'https://example.com']);
    }

    public function test_the_test_subdomain_and_www_are_sent_to_the_main_domain_with_the_same_page(): void
    {
        $this->on();
        foreach (['http://old.example.com/shop?q=Bridal', 'https://www.example.com/shop?q=Bridal', 'https://other.example.org/shop?q=Bridal'] as $url) {
            $this->get($url)->assertStatus(301)->assertRedirect('https://example.com/shop?q=Bridal');
        }
    }

    public function test_the_main_domain_is_not_redirected(): void
    {
        $this->on();
        $this->get('https://example.com/api/promotions')->assertStatus(200);
        $this->get('https://EXAMPLE.com/api/promotions')->assertStatus(200);
    }

    public function test_it_stays_off_until_switched_on_so_previews_keep_working(): void
    {
        config(['shop.site_url' => 'https://example.com']);   // FORCE_CANONICAL_HOST not set
        $this->get('http://old.example.com/api/promotions')->assertStatus(200);
    }

    public function test_forms_and_health_checks_are_never_redirected(): void
    {
        $this->on();
        $this->postJson('http://old.example.com/api/newsletter', ['email' => 'not-an-email'], ['X-Requested-With' => 'XMLHttpRequest'])->assertStatus(422);
        $this->get('http://old.example.com/up')->assertStatus(200);
    }

    public function test_local_development_is_never_redirected(): void
    {
        $this->on();
        $this->app->detectEnvironment(fn () => 'local');
        $this->get('http://127.0.0.1:8000/api/promotions')->assertStatus(200);
    }
}
