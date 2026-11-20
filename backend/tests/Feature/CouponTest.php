<?php

namespace Tests\Feature;

use App\Support\Commerce;
use App\Support\CustomerAuth;
use App\Support\Data\QueryEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Discount codes (Shopify-style) plus the admin order/customer edits that came with them. */
class CouponTest extends TestCase
{
    use RefreshDatabase;

    private array $h = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];
    private const RING = '00000000-0000-0000-0000-000000000001';
    private const CHAIN = '00000000-0000-0000-0000-000000000002';

    protected function setUp(): void
    {
        parent::setUp();
        Commerce::forget();
        foreach ([[self::RING, 'ring', 1000, 'Rings', 'Brass'], [self::CHAIN, 'chain', 500, 'Necklaces', 'Oxidised']] as [$id, $slug, $price, $cat, $mat]) {
            DB::table('products')->insert([
                'id' => $id, 'name' => ucfirst($slug), 'slug' => $slug, 'sku' => strtoupper($slug), 'price' => $price, 'category' => $cat, 'material' => $mat,
                'stock_quantity' => null, 'occasion' => '[]', 'specifications' => '{}', 'published' => 1,
            ]);
        }
        foreach (['cart', 'checkout'] as $k) {
            DB::table('site_settings')->where('key', "commerce_{$k}_enabled")->update(['value' => '1']);
        }
        DB::table('site_settings')->where('key', 'commerce_free_shipping_over')->update(['value' => '5000']);
        DB::table('site_settings')->where('key', 'commerce_shipping_flat')->update(['value' => '100']);
        Commerce::forget();
    }

    private function coupon(array $over = []): string
    {
        $row = $over + [
            'id' => (string) \Illuminate\Support\Str::uuid(), 'code' => 'SAVE10', 'discount_type' => 'percentage', 'value' => 10,
            'applies_to' => 'all', 'active' => 1, 'show_on_site' => 0, 'times_used' => 0,
        ];
        DB::table('coupons')->insert($row);

        return $row['code'];
    }

    private function quote(string $code, array $items = null, array $extra = [])
    {
        return $this->postJson('/api/cart/quote', ['items' => $items ?? [['id' => self::RING, 'qty' => 1], ['id' => self::CHAIN, 'qty' => 2]], 'coupon' => $code] + $extra, $this->h);
    }

    private function order(string $code, array $over = []): array
    {
        return $over + [
            'items' => [['id' => self::RING, 'qty' => 1], ['id' => self::CHAIN, 'qty' => 2]], 'paymentMethod' => 'cod', 'coupon' => $code,
            'customer' => ['name' => 'Asha', 'email' => 'asha@example.com', 'phone' => '9876543210'],
            'address' => ['name' => 'Asha', 'phone' => '9876543210', 'line1' => '1 MG Road', 'city' => 'Pune', 'state' => 'Maharashtra', 'pincode' => '411001'],
        ];
    }

    public function test_percentage_fixed_and_free_shipping_codes_are_priced_on_the_server(): void
    {
        // Basket = 1000 + 2 x 500 = 2000, shipping 100.
        $this->coupon(['code' => 'PCT']);
        $this->quote('pct')->assertOk()->assertJsonPath('discount', 200)->assertJsonPath('total', 1900)->assertJsonPath('coupon.code', 'PCT')->assertJsonPath('couponError', null);

        $this->coupon(['code' => 'CAP', 'value' => 50, 'max_discount' => 120]);
        $this->quote('CAP')->assertJsonPath('discount', 120);

        $this->coupon(['code' => 'FLAT', 'discount_type' => 'fixed', 'value' => 300]);
        $this->quote('FLAT')->assertJsonPath('discount', 300)->assertJsonPath('total', 1800);

        $this->coupon(['code' => 'BIG', 'discount_type' => 'fixed', 'value' => 99999]);
        $this->quote('BIG')->assertJsonPath('discount', 2000)->assertJsonPath('total', 100);   // never below zero + shipping

        $this->coupon(['code' => 'SHIP', 'discount_type' => 'free_shipping', 'value' => 0]);
        $this->quote('SHIP')->assertJsonPath('discount', 0)->assertJsonPath('shipping', 0)->assertJsonPath('total', 2000);
    }

    public function test_bad_codes_explain_themselves_and_never_change_the_total(): void
    {
        $this->quote('NOPE')->assertOk()->assertJsonPath('couponError', "That code isn't valid.")->assertJsonPath('discount', 0)->assertJsonPath('total', 2100);

        $this->coupon(['code' => 'OFF', 'active' => 0]);
        $this->quote('OFF')->assertJsonPath('couponError', "That code isn't valid.");

        $this->coupon(['code' => 'OLD', 'ends_at' => now()->subDay()->format('Y-m-d H:i:s')]);
        $this->quote('OLD')->assertJsonPath('couponError', 'This code has expired.');

        $this->coupon(['code' => 'SOON', 'starts_at' => now()->addDay()->format('Y-m-d H:i:s')]);
        $this->quote('SOON')->assertJsonPath('couponError', "This code isn't active yet.");

        $this->coupon(['code' => 'MIN', 'min_subtotal' => 3000]);
        $this->quote('MIN')->assertJsonPath('couponError', 'Add ₹1,000 more to use this code.');

        $this->coupon(['code' => 'QTY', 'min_quantity' => 5]);
        $this->quote('QTY')->assertJsonPath('couponError', 'Add 2 more pieces to use this code.');

        $this->coupon(['code' => 'GONE', 'usage_limit' => 3, 'times_used' => 3]);
        $this->quote('GONE')->assertJsonPath('couponError', 'This code has reached its usage limit.');
    }

    public function test_a_code_can_be_limited_to_products_categories_or_materials(): void
    {
        $this->coupon(['code' => 'RINGS', 'applies_to' => 'categories', 'applies_ids' => json_encode(['rings'])]);
        $this->quote('RINGS')->assertJsonPath('discount', 100);                      // 10% of the ring only

        $this->coupon(['code' => 'OXI', 'applies_to' => 'materials', 'applies_ids' => json_encode(['Oxidised'])]);
        $this->quote('OXI')->assertJsonPath('discount', 100);                        // 10% of 2 x 500

        $this->coupon(['code' => 'ONEPIECE', 'applies_to' => 'products', 'applies_ids' => json_encode([self::CHAIN])]);
        $this->quote('ONEPIECE', [['id' => self::RING, 'qty' => 1]])->assertJsonPath('couponError', "This code doesn't apply to the items in your cart.");

        DB::table('products')->where('id', self::RING)->update(['compare_at_price' => 1500]);
        $this->coupon(['code' => 'NOSALE', 'exclude_sale_items' => 1]);
        $this->quote('NOSALE')->assertJsonPath('discount', 100);                     // the ring is on sale, so only the chains count
    }

    public function test_placing_an_order_records_the_discount_and_counts_the_use(): void
    {
        $this->coupon(['code' => 'DIWALI', 'usage_limit' => 1]);
        $res = $this->postJson('/api/checkout', $this->order('diwali'), $this->h)->assertStatus(201);

        $order = DB::table('orders')->where('number', $res->json('number'))->first();
        $this->assertSame('DIWALI', $order->coupon_code);
        $this->assertEquals(200, $order->discount_total);
        $this->assertEquals(1900, $order->total);
        $this->assertSame(1, (int) DB::table('coupons')->where('code', 'DIWALI')->value('times_used'));
        $this->assertSame(1, DB::table('coupon_redemptions')->count());

        // The single allowed use is gone.
        $this->postJson('/api/checkout', $this->order('DIWALI', ['customer' => ['name' => 'B', 'email' => 'b@example.com', 'phone' => '9876543211']]), $this->h)
            ->assertStatus(422)->assertJsonPath('message', 'This code has reached its usage limit.');
        $this->assertSame(1, DB::table('orders')->count());

        // Cancelling gives the use back.
        \App\Support\OrderService::cancel($order->id);
        $this->assertSame(0, (int) DB::table('coupons')->where('code', 'DIWALI')->value('times_used'));
        $this->assertSame(0, DB::table('coupon_redemptions')->count());
    }

    public function test_one_per_customer_and_first_order_only(): void
    {
        $this->coupon(['code' => 'ONCE', 'one_per_customer' => 1]);
        $this->postJson('/api/checkout', $this->order('ONCE'), $this->h)->assertStatus(201);
        $this->postJson('/api/checkout', $this->order('ONCE'), $this->h)->assertStatus(422)->assertJsonPath('message', "You've already used this code.");

        $this->coupon(['code' => 'WELCOME', 'first_order_only' => 1]);
        $this->postJson('/api/checkout', $this->order('WELCOME'), $this->h)->assertStatus(422)->assertJsonPath('message', 'This code is for first orders only.');
        $new = $this->order('WELCOME', ['customer' => ['name' => 'N', 'email' => 'new@example.com', 'phone' => '9876543299']]);
        $this->postJson('/api/checkout', $new, $this->h)->assertStatus(201);
    }

    public function test_only_switched_on_running_offers_are_shown_and_the_list_is_off_without_a_cart(): void
    {
        $this->coupon(['code' => 'SHOWN', 'show_on_site' => 1, 'description' => 'Diwali offer', 'min_subtotal' => 999]);
        $this->coupon(['code' => 'HIDDEN', 'show_on_site' => 0]);
        $this->coupon(['code' => 'PAUSED', 'show_on_site' => 1, 'active' => 0]);
        $this->coupon(['code' => 'ENDED', 'show_on_site' => 1, 'ends_at' => now()->subDay()->format('Y-m-d H:i:s')]);

        $list = $this->getJson('/api/promotions', $this->h)->assertOk()->json();
        $this->assertSame(['SHOWN'], array_column($list, 'code'));
        $this->assertSame('10% OFF', $list[0]['label']);
        $this->assertStringContainsString('₹999', $list[0]['terms']);

        DB::table('site_settings')->where('key', 'commerce_cart_enabled')->update(['value' => '0']);
        Commerce::forget();
        $this->getJson('/api/promotions', $this->h)->assertOk()->assertExactJson([]);
    }

    public function test_discount_codes_are_private_and_only_the_admin_manages_them(): void
    {
        $this->coupon(['code' => 'SECRET']);
        $select = ['table' => 'coupons', 'action' => 'select', 'fields' => '*', 'filters' => [], 'orders' => [], 'returning' => true, 'count' => false, 'head' => false];
        $this->assertSame('Not authorised', (new QueryEngine(false))->execute($select)['error']['message']);
        $this->assertCount(1, (new QueryEngine(true))->execute($select)['data']);
        $dup = (new QueryEngine(true))->execute(['action' => 'insert', 'values' => ['code' => 'SECRET', 'discount_type' => 'fixed', 'value' => 5]] + $select);
        $this->assertNotNull($dup['error']);                       // codes are unique
        $this->assertSame(1, DB::table('coupons')->where('code', 'SECRET')->count());
    }

    private function adminCookie(): string
    {
        if (DB::table('admin_users')->exists()) {
            return 'tok';
        }
        DB::table('admin_users')->insert(['id' => '50000000-0000-0000-0000-000000000001', 'email' => 'a@b.co', 'password_hash' => 'x']);
        DB::table('admin_sessions')->insert(['id' => '50000000-0000-0000-0000-000000000002', 'admin_id' => '50000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'tok'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);

        return 'tok';
    }

    private function admin(string $uri, array $json)
    {
        return $this->call('POST', $uri, [], [config('shop.session_cookie') => $this->adminCookie()], [], [
            'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json',
        ], json_encode($json));
    }

    public function test_the_admin_can_correct_an_orders_address_and_every_edit_is_logged(): void
    {
        $res = $this->postJson('/api/checkout', $this->order(''), $this->h)->assertStatus(201);
        $order = DB::table('orders')->where('number', $res->json('number'))->first();

        $new = ['action' => 'edit_details', 'contact' => ['name' => 'Asha K', 'email' => 'asha.k@example.com', 'phone' => '9000000001'],
            'address' => ['name' => 'Asha K', 'phone' => '9000000001', 'line1' => '22 FC Road', 'line2' => 'Flat 4', 'city' => 'Pune', 'state' => 'Maharashtra', 'pincode' => '411004']];
        $this->admin("/api/admin/orders/{$order->id}", $new)->assertOk();

        $row = DB::table('orders')->where('id', $order->id)->first();
        $this->assertSame('asha.k@example.com', $row->email);
        $this->assertSame('22 FC Road', json_decode($row->shipping_address, true)['line1']);
        $this->assertTrue(DB::table('order_events')->where('order_id', $order->id)->where('message', 'like', '%edited by the store%')->exists());

        $new['address']['pincode'] = '123';
        $this->admin("/api/admin/orders/{$order->id}", $new)->assertStatus(422);
    }

    public function test_customers_keep_a_birthday_and_the_admin_can_note_that_a_gift_was_sent(): void
    {
        DB::table('site_settings')->where('key', 'commerce_accounts_enabled')->update(['value' => '1']);
        Commerce::forget();
        $res = $this->postJson('/api/account/register', ['name' => 'Asha', 'email' => 'asha@example.com', 'password' => 'password123', 'dateOfBirth' => '1998-11-20'], $this->h)->assertOk();
        $this->assertSame('1998-11-20', (string) DB::table('customers')->value('date_of_birth'));

        $cookie = collect($res->headers->getCookies())->first(fn ($c) => $c->getName() === CustomerAuth::COOKIE)->getValue();
        $profile = fn (array $json) => $this->call('POST', '/api/account/profile', [], [CustomerAuth::COOKIE => $cookie], [], [
            'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json',
        ], json_encode($json));
        $profile(['name' => 'Asha', 'dateOfBirth' => '1998-11-21', 'giftNote' => 'I love oxidised jhumkas'])->assertOk();
        $this->assertSame('I love oxidised jhumkas', DB::table('customers')->value('gift_note'));
        $profile(['name' => 'Asha', 'dateOfBirth' => '2999-01-01'])->assertStatus(422);

        $id = DB::table('customers')->value('id');
        $this->admin("/api/admin/customers/{$id}", ['birthdayGiftSent' => true])->assertOk();
        $this->assertSame((int) now()->setTimezone('Asia/Kolkata')->format('Y'), (int) DB::table('customers')->value('birthday_gift_year'));
        $this->admin("/api/admin/customers/{$id}", ['dateOfBirth' => '1998-12-01', 'birthdayGiftSent' => false])->assertOk();
        $this->assertNull(DB::table('customers')->value('birthday_gift_year'));
        $this->assertSame('1998-12-01', (string) DB::table('customers')->value('date_of_birth'));
    }
}
