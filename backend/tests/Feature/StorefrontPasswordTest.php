<?php

namespace Tests\Feature;

use App\Support\Secrets;
use App\Support\StorefrontGate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The storefront password: off by default, enforced on the server, opened with the right password. */
class StorefrontPasswordTest extends TestCase
{
    use RefreshDatabase;

    private array $h = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];

    protected function setUp(): void
    {
        parent::setUp();
        // These classes cache in static properties, which survive between tests in one run.
        Secrets::forget();
        StorefrontGate::forget();
    }

    private function turnOn(string $password = 'secret-door'): void
    {
        Secrets::set(StorefrontGate::PASSWORD, $password);
        DB::table('site_settings')->where('key', 'storefront_password_enabled')->update(['value' => '1']);
        StorefrontGate::forget();
    }

    private function read(?string $cookie = null): \Illuminate\Testing\TestResponse
    {
        $body = json_encode(['table' => 'products', 'action' => 'select', 'fields' => 'id', 'filters' => [], 'orders' => [], 'returning' => false, 'count' => false, 'head' => false]);

        return $this->call('POST', '/api/query', [], $cookie ? [StorefrontGate::COOKIE => $cookie] : [], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], $body);
    }

    public function test_the_store_is_open_by_default(): void
    {
        $this->read()->assertOk();
        $this->getJson('/api/storefront/status', $this->h)->assertOk()->assertJson(['locked' => false]);
    }

    public function test_it_stays_open_when_switched_on_without_a_password(): void
    {
        DB::table('site_settings')->where('key', 'storefront_password_enabled')->update(['value' => '1']);
        StorefrontGate::forget();
        $this->read()->assertOk();
    }

    public function test_when_on_the_data_api_refuses_visitors_without_the_password(): void
    {
        $this->turnOn();
        $this->read()->assertStatus(403)->assertJson(['locked' => true]);
        $this->getJson('/api/storefront/status', $this->h)->assertJson(['locked' => true]);
    }

    public function test_a_wrong_password_is_refused_and_the_right_one_unlocks(): void
    {
        $this->turnOn();
        $this->postJson('/api/storefront/unlock', ['password' => 'nope'], $this->h)->assertStatus(422);

        $response = $this->postJson('/api/storefront/unlock', ['password' => 'secret-door'], $this->h)->assertOk();
        $cookie = collect($response->headers->getCookies())->first(fn ($c) => $c->getName() === StorefrontGate::COOKIE);
        $this->assertNotNull($cookie);
        $this->assertTrue($cookie->isHttpOnly());

        $this->read($cookie->getValue())->assertOk();
    }

    public function test_changing_the_password_signs_visitors_out(): void
    {
        $this->turnOn();
        $cookie = collect($this->postJson('/api/storefront/unlock', ['password' => 'secret-door'], $this->h)->headers->getCookies())->first()->getValue();
        $this->turnOn('another-one');
        $this->read($cookie)->assertStatus(403);
    }

    public function test_the_sitemap_is_hidden_while_the_store_is_private(): void
    {
        $this->turnOn();
        $this->withAppShell(fn () => $this->get('https://example.com/sitemap.xml')->assertNotFound());
    }

    public function test_the_main_admin_can_set_the_password_and_switch_it_on(): void
    {
        DB::table('admin_users')->insert(['id' => '50000000-0000-0000-0000-000000000001', 'email' => 'owner@example.com', 'password_hash' => 'x', 'role' => 'super']);
        DB::table('admin_sessions')->insert(['id' => '50000000-0000-0000-0000-000000000002', 'admin_id' => '50000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'tok'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);
        $post = fn (array $body) => $this->call('POST', '/api/admin/storefront-password', [], [config('shop.session_cookie') => 'tok'], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], json_encode($body));

        $post(['enabled' => true])->assertStatus(422);
        $post(['password' => 'open-sesame'])->assertOk()->assertJson(['passwordSet' => true, 'enabled' => false]);
        $post(['enabled' => true, 'message' => 'Back soon'])->assertOk()->assertJson(['enabled' => true, 'message' => 'Back soon']);
        $this->getJson('/api/storefront/status', $this->h)->assertJson(['locked' => true, 'message' => 'Back soon']);
    }
}
