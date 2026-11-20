<?php

namespace Tests\Feature;

use App\Support\Commerce;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Shipping zones (a fee per group of states) and the "spend X, get a free gift" milestones. */
class ShippingZoneTest extends TestCase
{
    use RefreshDatabase;

    private array $h = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];
    private const RING = '00000000-0000-0000-0000-000000000011';

    protected function setUp(): void
    {
        parent::setUp();
        DB::table('products')->insert([
            'id' => self::RING, 'name' => 'Ring', 'slug' => 'ring', 'sku' => 'RING', 'price' => 1000, 'category' => 'Rings', 'material' => 'Brass',
            'stock_quantity' => null, 'occasion' => '[]', 'specifications' => '{}', 'published' => 1,
        ]);
        foreach (['cart', 'checkout'] as $k) {
            DB::table('site_settings')->where('key', "commerce_{$k}_enabled")->update(['value' => '1']);
        }
        $this->setting('commerce_shipping_flat', '100');
        $this->setting('commerce_free_shipping_over', '5000');
    }

    private function setting(string $key, string $value): void
    {
        $row = ['value' => $value, 'group_name' => 'commerce', 'label' => $key];
        if (DB::table('site_settings')->where('key', $key)->exists()) {
            DB::table('site_settings')->where('key', $key)->update($row);
        } else {
            DB::table('site_settings')->insert($row + ['id' => (string) Str::uuid(), 'key' => $key]);
        }
        Commerce::forget();
    }

    private function zone(string $name, array $states, float $rate, ?float $freeOver = null, bool $active = true, int $sort = 0): void
    {
        DB::table('shipping_zones')->insert([
            'id' => (string) Str::uuid(), 'name' => $name, 'states' => json_encode($states), 'rate' => $rate, 'free_over' => $freeOver, 'active' => $active, 'sort_order' => $sort,
        ]);
        Commerce::forget();
    }

    private function quote(?string $state, int $qty = 1)
    {
        return $this->postJson('/api/cart/quote', ['items' => [['id' => self::RING, 'qty' => $qty]], 'state' => $state], $this->h);
    }

    public function test_each_zone_has_its_own_fee_and_other_states_pay_the_standard_fee(): void
    {
        $this->zone('Metro', ['Maharashtra', 'Delhi'], 60);
        $this->zone('North-east', ['Assam', 'Sikkim'], 180, 8000);

        $this->quote('maharashtra')->assertOk()->assertJsonPath('shipping', 60)->assertJsonPath('shippingZone', 'Metro')->assertJsonPath('freeShippingOver', 5000);
        $this->quote('Assam')->assertJsonPath('shipping', 180)->assertJsonPath('freeShippingOver', 8000);
        $this->quote('Kerala')->assertJsonPath('shipping', 100)->assertJsonPath('shippingZone', null);
        $this->quote(null)->assertJsonPath('shipping', 100);
    }

    public function test_a_zone_can_turn_free_shipping_off_or_use_its_own_amount_and_switched_off_zones_are_ignored(): void
    {
        $this->zone('Islands', ['Lakshadweep'], 400, 0);
        $this->zone('Local', ['Goa'], 40, 1500);
        $this->zone('Off', ['Kerala'], 999, null, false);

        $this->quote('Lakshadweep', 10)->assertJsonPath('shipping', 400);       // never free there, even over 5000
        $this->quote('Goa', 2)->assertJsonPath('shipping', 0);                  // 2000 is over this zone's 1500
        $this->quote('Goa', 1)->assertJsonPath('shipping', 40);
        $this->quote('Kerala')->assertJsonPath('shipping', 100);                // the switched-off zone does not count
    }

    public function test_the_order_uses_the_delivery_state_and_notes_zone_and_gifts_on_the_timeline(): void
    {
        $this->zone('Metro', ['Maharashtra'], 60);
        $this->setting('commerce_gifts', json_encode([['amount' => 2500, 'label' => 'Free jhumka pair'], ['amount' => 1000, 'label' => 'Gift box'], ['amount' => 0, 'label' => 'bad'], ['amount' => 500, 'label' => '']]));

        $this->quote('Maharashtra', 3)->assertJsonPath('gifts.0.label', 'Gift box')->assertJsonPath('gifts.1.label', 'Free jhumka pair');
        $this->quote('Maharashtra', 1)->assertJsonCount(1, 'gifts');

        $body = [
            'items' => [['id' => self::RING, 'qty' => 3]], 'paymentMethod' => 'cod',
            'customer' => ['name' => 'Asha', 'email' => 'asha@example.com', 'phone' => '9876543210'],
            'address' => ['name' => 'Asha', 'phone' => '9876543210', 'line1' => '1 MG Road', 'city' => 'Pune', 'state' => 'Maharashtra', 'pincode' => '411001'],
        ];
        $this->postJson('/api/checkout', $body, $this->h)->assertCreated();

        $order = DB::table('orders')->first();
        $this->assertEquals(60, (float) $order->shipping_total);
        $events = DB::table('order_events')->where('order_id', $order->id)->pluck('message')->implode("\n");
        $this->assertStringContainsString('Shipping zone: Metro', $events);
        $this->assertStringContainsString('Free gift earned: Gift box', $events);
        $this->assertStringContainsString('Free gift earned: Free jhumka pair', $events);
    }

    public function test_zones_are_managed_by_admins_only(): void
    {
        $this->zone('Metro', ['Delhi'], 60);
        $res = $this->postJson('/api/query', ['table' => 'shipping_zones', 'action' => 'select', 'fields' => '*', 'count' => false, 'head' => false, 'filters' => [], 'orders' => [], 'returning' => true], $this->h);
        $this->assertEmpty($res->json('data') ?? []);
    }
}
