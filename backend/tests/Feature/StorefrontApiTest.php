<?php

namespace Tests\Feature;

use App\Support\Commerce;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The external storefront API: a client's own website reading this catalogue and writing its orders here.
 * What matters is that it stays shut unless the add-on is on, that only allowed websites may call it, and that
 * money and stock are decided here and never by the caller.
 */
class StorefrontApiTest extends TestCase
{
    use RefreshDatabase;

    private const PRODUCT = '00000000-0000-0000-0000-0000000000a1';
    private const VARIANT = '00000000-0000-0000-0000-0000000000b1';
    private const ORIGIN = 'https://shop.example.com';

    protected function setUp(): void
    {
        parent::setUp();
        Commerce::forget();

        DB::table('products')->insert([
            'id' => self::PRODUCT, 'name' => '9 inch Plate', 'slug' => 'p9-round', 'sku' => 'P9-ROUND',
            'price' => 199, 'stock_quantity' => null, 'occasion' => '[]', 'specifications' => '{}', 'published' => 1,
        ]);
        DB::table('product_variants')->insert([
            'id' => self::VARIANT, 'product_id' => self::PRODUCT, 'title' => 'Pack of 25', 'options' => '{"Pack":"25"}',
            'sku' => 'P9-ROUND-25', 'price' => 199, 'stock_quantity' => 10, 'sort_order' => 0,
        ]);
    }

    private function enable(): void
    {
        config([
            'shop.features.external_storefront' => true,
            'shop.storefront_api.origins' => self::ORIGIN,
            // In a running site both come from STOREFRONT_API_ORIGINS; here they are set by hand.
            'cors.allowed_origins' => [self::ORIGIN],
        ]);
    }

    /** @return array<string, string> */
    private function headers(string $origin = self::ORIGIN): array
    {
        return ['Origin' => $origin, 'Accept' => 'application/json'];
    }

    public function test_it_is_closed_until_the_add_on_is_switched_on(): void
    {
        $this->getJson('/api/public/products', $this->headers())->assertStatus(404);
    }

    public function test_only_an_allowed_website_may_read_the_catalogue(): void
    {
        $this->enable();

        $this->getJson('/api/public/products', $this->headers('https://someone-else.test'))->assertStatus(403);

        $response = $this->getJson('/api/public/products', $this->headers());
        $response->assertOk()
            ->assertHeader('Access-Control-Allow-Origin', self::ORIGIN)
            ->assertJsonPath('products.0.id', 'p9-round')
            ->assertJsonPath('products.0.variants.0.qty', 25)
            ->assertJsonPath('products.0.variants.0.stock', 10);
    }

    public function test_it_places_an_order_and_takes_the_stock(): void
    {
        $this->enable();

        $response = $this->postJson('/api/public/order', [
            'name' => 'Asha', 'phone' => '98765 43210', 'address' => '1 Green Road',
            'city' => 'Vadodara', 'state' => 'Gujarat', 'pin' => '390001',
            'items' => [['id' => 'p9-round', 'q' => 25, 'n' => 2]],
        ], $this->headers());

        $response->assertOk()->assertJsonPath('ok', true);

        $order = DB::table('orders')->latest('created_at')->first();
        $this->assertNotNull($order);
        $this->assertSame('Asha', $order->name);
        // The price is read from the variant here, never from the browser: 2 packs of 199.
        $this->assertEqualsWithDelta(398.0, (float) $order->subtotal, 0.01);
        $this->assertSame('9876543210@phone.invalid', $order->email);
        $this->assertSame(8, (int) DB::table('product_variants')->where('id', self::VARIANT)->value('stock_quantity'));
    }

    public function test_a_cart_wide_discount_code_works_from_a_subtotal_alone(): void
    {
        $this->enable();
        DB::table('coupons')->insert([
            'id' => '00000000-0000-0000-0000-0000000000c1', 'code' => 'SAVE10',
            'discount_type' => 'percentage', 'value' => 10, 'applies_to' => 'all', 'active' => 1,
        ]);

        $this->getJson('/api/public/coupon?code=SAVE10&subtotal=800&phone=9999900000', $this->headers())
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('code', 'SAVE10')
            ->assertJsonPath('discount', 80);
    }

    public function test_an_unknown_product_does_not_become_an_order(): void
    {
        $this->enable();

        $this->postJson('/api/public/order', [
            'name' => 'Asha', 'phone' => '9876543210', 'address' => '1 Green Road',
            'city' => 'Vadodara', 'state' => 'Gujarat', 'pin' => '390001',
            'items' => [['id' => 'does-not-exist', 'q' => 25, 'n' => 1]],
        ], $this->headers())->assertStatus(422)->assertJsonPath('ok', false);

        $this->assertSame(0, DB::table('orders')->count());
    }
}
