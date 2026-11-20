<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Offline store: scan a SKU, record a shop sale from the shared stock, and see it as a "shop" order in the reports. */
class ShopSaleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The offline shop is a paid add-on, off by default; these tests run with it switched on.
        config(['shop.features.offline_shop' => true]);
    }

    private function admin(string $method, string $uri, array $body = [])
    {
        if (! DB::table('admin_users')->exists()) {
            DB::table('admin_users')->insert(['id' => '50000000-0000-0000-0000-000000000001', 'email' => 'owner@example.com', 'password_hash' => 'x', 'role' => 'super']);
            DB::table('admin_sessions')->insert(['id' => '50000000-0000-0000-0000-000000000002', 'admin_id' => '50000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'tok'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);
        }

        return $this->call($method, $uri, $method === 'GET' ? $body : [], [config('shop.session_cookie') => 'tok'], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], $method === 'GET' ? null : json_encode($body));
    }

    private function product(string $id, string $sku, ?int $stock, float $price = 500): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('products')->insert([
            'id' => $id, 'name' => 'Test Jhumka '.$sku, 'slug' => 'jhumka-'.strtolower($sku), 'sku' => $sku, 'price' => $price, 'occasion' => '[]', 'specifications' => '{}',
            'stock_quantity' => $stock, 'published' => 1, 'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    public function test_a_scanned_sku_finds_the_piece(): void
    {
        $this->product('p0000000-0000-0000-0000-000000000001', 'PR-100', 5);
        $r = $this->admin('GET', '/api/admin/shop/lookup', ['q' => 'PR-100'])->assertOk()->json();
        $this->assertTrue($r['exact']);
        $this->assertCount(1, $r['items']);
        $this->assertSame(5, $r['items'][0]['stock']);
        $this->assertEmpty($this->admin('GET', '/api/admin/shop/lookup', ['q' => 'NOPE-1'])->json('items'));
    }

    public function test_a_shop_sale_takes_stock_logs_it_and_is_a_shop_order(): void
    {
        $this->product('p0000000-0000-0000-0000-000000000001', 'PR-100', 5, 450);
        $res = $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => 'p0000000-0000-0000-0000-000000000001', 'variant_id' => null, 'qty' => 2]], 'payment_method' => 'upi'])->assertOk();
        $res->assertJson(['ok' => true, 'total' => 900]);

        $this->assertSame(3, (int) DB::table('products')->where('sku', 'PR-100')->value('stock_quantity'));
        $order = DB::table('orders')->first();
        $this->assertSame('shop', $order->channel);
        $this->assertSame('paid', $order->payment_status);
        $this->assertSame('fulfilled', $order->fulfillment_status);
        $this->assertSame('upi', $order->payment_method);
        $log = DB::table('stock_adjustments')->first();
        $this->assertSame('shop', $log->reason);
        $this->assertSame(-2, (int) $log->change);
    }

    public function test_it_cannot_sell_more_than_is_in_stock(): void
    {
        $this->product('p0000000-0000-0000-0000-000000000001', 'PR-100', 1);
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => 'p0000000-0000-0000-0000-000000000001', 'variant_id' => null, 'qty' => 2]], 'payment_method' => 'cash'])
            ->assertStatus(422)->assertJsonFragment(['message' => 'Only 1 left of Test Jhumka PR-100.']);
        $this->assertSame(1, (int) DB::table('products')->where('sku', 'PR-100')->value('stock_quantity'));
        $this->assertSame(0, DB::table('orders')->count());
    }

    public function test_only_admins_can_use_it_and_the_method_is_checked(): void
    {
        $this->postJson('/api/admin/shop/sale', [], ['X-Requested-With' => 'XMLHttpRequest'])->assertStatus(401);
        $this->product('p0000000-0000-0000-0000-000000000001', 'PR-100', 5);
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => 'p0000000-0000-0000-0000-000000000001', 'qty' => 1]], 'payment_method' => 'cheque'])->assertStatus(422);
    }

    public function test_reports_split_online_and_shop(): void
    {
        $this->product('p0000000-0000-0000-0000-000000000001', 'PR-100', 9, 100);
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => 'p0000000-0000-0000-0000-000000000001', 'qty' => 3]], 'payment_method' => 'cash'])->assertOk();

        $all = $this->admin('GET', '/api/admin/reports')->assertOk()->json();
        $shop = collect($all['channels'])->firstWhere('name', 'Shop');
        $this->assertSame(300.0, (float) $shop['revenue']);
        $this->assertSame(0, collect($all['channels'])->firstWhere('name', 'Online')['orders']);
        $this->assertSame(0, $this->admin('GET', '/api/admin/reports', ['channel' => 'online'])->json('summary.orders'));
        $this->assertSame(1, $this->admin('GET', '/api/admin/reports', ['channel' => 'shop'])->json('summary.orders'));
    }

    public function test_skus_are_the_category_code_and_a_number_per_category(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('categories')->insert(['id' => 'c0000000-0000-0000-0000-000000000001', 'name' => 'Earrings', 'slug' => 'earrings', 'sku_code' => 'ER', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('categories')->insert(['id' => 'c0000000-0000-0000-0000-000000000002', 'name' => 'Necklaces', 'slug' => 'necklaces', 'sku_code' => null, 'created_at' => $now, 'updated_at' => $now]);

        $this->assertSame('ER-0001', \App\Support\SkuGenerator::forProduct('Earrings', 'Gold Plated Jhumka'));
        $this->product('p0000000-0000-0000-0000-000000000001', 'ER-0007', 1);
        $this->assertSame('ER-0008', \App\Support\SkuGenerator::forProduct('Earrings', 'Anything'));
        // Another category counts on its own; without a code it uses the first letters of its name.
        $this->assertSame('NE-0001', \App\Support\SkuGenerator::forProduct('Necklaces', 'Pearl Set'));
        $this->assertSame('ER-0007-1', \App\Support\SkuGenerator::forVariant('ER-0007'));
        $this->assertSame('ER-0007-3', \App\Support\SkuGenerator::forVariant('ER-0007', ['ER-0007-1', 'ER-0007-2']));
    }

    public function test_generate_missing_skus_fills_only_the_empty_ones(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('categories')->insert(['id' => 'c0000000-0000-0000-0000-000000000001', 'name' => 'Earrings', 'slug' => 'earrings', 'sku_code' => 'ER', 'created_at' => $now, 'updated_at' => $now]);
        $this->product('p0000000-0000-0000-0000-000000000001', '', 3);
        $this->product('p0000000-0000-0000-0000-000000000002', 'KEEP-1', 3);
        DB::table('products')->where('id', 'p0000000-0000-0000-0000-000000000001')->update(['category' => 'Earrings']);
        DB::table('product_variants')->insert(['id' => 'v0000000-0000-0000-0000-000000000001', 'product_id' => 'p0000000-0000-0000-0000-000000000001', 'title' => 'Gold / 7', 'options' => json_encode(['Colour' => 'Gold', 'Size' => '7']), 'sku' => null, 'sort_order' => 0]);

        $this->admin('POST', '/api/admin/inventory/generate-skus')->assertOk()->assertJson(['products' => 1, 'variants' => 1]);
        $this->assertSame('KEEP-1', DB::table('products')->where('id', 'p0000000-0000-0000-0000-000000000002')->value('sku'));
        $this->assertSame('ER-0001', DB::table('products')->where('id', 'p0000000-0000-0000-0000-000000000001')->value('sku'));
        $this->assertSame('ER-0001-1', DB::table('product_variants')->value('sku'));
        $this->admin('POST', '/api/admin/inventory/generate-skus')->assertJson(['products' => 0, 'variants' => 0]);
    }

    public function test_saving_a_product_without_a_sku_makes_one(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('categories')->insert(['id' => 'c0000000-0000-0000-0000-000000000001', 'name' => 'Earrings', 'slug' => 'earrings', 'sku_code' => 'ER', 'created_at' => $now, 'updated_at' => $now]);
        $payload = ['name' => 'Gold Plated Jhumka', 'sku' => '', 'price' => 499, 'slug' => 'gold-plated-jhumka', 'category' => 'Earrings', 'material' => 'Brass', 'published' => true];

        $this->admin('POST', '/api/admin/products/save', ['payload' => $payload, 'images' => [], 'variants' => []])->assertOk();
        $this->assertSame('ER-0001', DB::table('products')->where('slug', 'gold-plated-jhumka')->value('sku'));

        $second = ['name' => 'Pearl Drop', 'slug' => 'pearl-drop'] + $payload;
        $this->admin('POST', '/api/admin/products/save', ['payload' => $second, 'images' => [], 'variants' => []])->assertOk();
        $this->assertSame('ER-0002', DB::table('products')->where('slug', 'pearl-drop')->value('sku'));

        $own = ['name' => 'Own', 'slug' => 'own', 'sku' => 'MY-SKU'] + $payload;
        $this->admin('POST', '/api/admin/products/save', ['payload' => $own, 'images' => [], 'variants' => []])->assertOk();
        $this->assertSame('MY-SKU', DB::table('products')->where('slug', 'own')->value('sku'));
    }

    public function test_a_piece_with_its_own_barcode_cannot_be_sold_twice(): void
    {
        $id = 'p0000000-0000-0000-0000-000000000001';
        $this->product($id, 'ER-0001', 3, 200);
        $codes = $this->admin('POST', '/api/admin/units/create', ['product_id' => $id, 'count' => 3])->assertOk()->json('codes');
        $this->assertSame(['ER-0001.01', 'ER-0001.02', 'ER-0001.03'], $codes);
        // More pieces continue the numbering.
        $this->assertSame(['ER-0001.04'], $this->admin('POST', '/api/admin/units/create', ['product_id' => $id, 'count' => 1])->json('codes'));

        // Scanning the design's own SKU is not enough once its pieces have barcodes.
        $this->assertTrue($this->admin('GET', '/api/admin/shop/lookup', ['q' => 'ER-0001'])->json('needsPiece'));
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => $id, 'qty' => 1]], 'payment_method' => 'cash'])->assertStatus(422);

        $found = $this->admin('GET', '/api/admin/shop/lookup', ['q' => 'ER-0001.02'])->json();
        $this->assertSame('in_stock', $found['unit']['status']);
        $sale = ['lines' => [['product_id' => $id, 'variant_id' => null, 'qty' => 1, 'unit_code' => 'ER-0001.02']], 'payment_method' => 'upi'];
        $this->admin('POST', '/api/admin/shop/sale', $sale)->assertOk();
        $this->assertSame(2, (int) DB::table('products')->where('id', $id)->value('stock_quantity'));

        // The same piece scanned again: told it was already sold, and nothing is sold.
        $again = $this->admin('GET', '/api/admin/shop/lookup', ['q' => 'ER-0001.02'])->json();
        $this->assertSame('sold', $again['unit']['status']);
        $this->assertNotNull($again['unit']['orderNumber']);
        $this->admin('POST', '/api/admin/shop/sale', $sale)->assertStatus(422)->assertJsonFragment(['message' => 'ER-0001.02 was already sold on '.now('Asia/Kolkata')->format('j M Y').'.']);
        $this->assertSame(2, (int) DB::table('products')->where('id', $id)->value('stock_quantity'));
        $this->assertSame(1, DB::table('orders')->count());

        // Cancelling the sale puts the piece back.
        \App\Support\OrderService::cancel((string) DB::table('orders')->value('id'), 'test', false);
        $this->assertSame('in_stock', DB::table('stock_units')->where('code', 'ER-0001.02')->value('status'));
        $this->assertSame(3, (int) DB::table('products')->where('id', $id)->value('stock_quantity'));
    }

    public function test_customer_details_are_optional_and_saved_with_the_shop_sale(): void
    {
        $id = 'p0000000-0000-0000-0000-000000000001';
        $this->product($id, 'ER-0001', 9, 100);
        $line = [['product_id' => $id, 'variant_id' => null, 'qty' => 1]];

        $this->admin('POST', '/api/admin/shop/sale', ['lines' => $line, 'payment_method' => 'cash'])->assertOk();
        $plain = DB::table('orders')->first();
        $this->assertSame('Shop customer', $plain->name);
        $this->assertSame('{}', $plain->shipping_address);

        $customer = ['name' => 'Asha Verma', 'phone' => '+91 98765 43210', 'address' => '12 MG Road, Pune', 'dob' => '1992-04-18'];
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => $line, 'payment_method' => 'upi', 'customer' => $customer])->assertOk();
        $o = DB::table('orders')->orderByDesc('number')->first();
        $this->assertSame('Asha Verma', $o->name);
        $this->assertSame('+91 98765 43210', $o->phone);
        $address = json_decode($o->shipping_address, true);
        $this->assertSame('12 MG Road, Pune', $address['line1']);
        $this->assertSame('1992-04-18', $address['date_of_birth']);

        // A mistyped mobile number or a future birthday is refused.
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => $line, 'payment_method' => 'cash', 'customer' => ['phone' => 'abc']])->assertStatus(422);
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => $line, 'payment_method' => 'cash', 'customer' => ['dob' => now()->addYear()->format('Y-m-d')]])->assertStatus(422);
    }

    public function test_shop_buyers_become_customers_tagged_shop_and_are_not_duplicated(): void
    {
        $id = 'p0000000-0000-0000-0000-000000000001';
        $this->product($id, 'ER-0001', 9, 100);
        $sale = fn (array $customer) => $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => $id, 'variant_id' => null, 'qty' => 1]], 'payment_method' => 'cash', 'customer' => $customer])->assertOk();

        // Nothing identifying entered: no customer is made.
        $sale(['address' => 'Somewhere']);
        $this->assertSame(0, DB::table('customers')->count());

        $sale(['name' => 'Asha Verma', 'phone' => '+91 98765 43210', 'dob' => '1992-04-18', 'address' => '12 MG Road', 'marketing' => true]);
        $c = DB::table('customers')->first();
        $this->assertSame('shop', $c->source);
        $this->assertSame('', $c->password_hash);
        $this->assertSame('1992-04-18', $c->date_of_birth);
        $this->assertSame(1, (int) $c->accepts_marketing);
        $this->assertNull($c->email);
        $this->assertSame($c->id, DB::table('orders')->orderByDesc('number')->value('customer_id'));

        // The same mobile number written differently is the same person; an e-mail is added to the record.
        $sale(['phone' => '9876543210', 'email' => 'Asha@Example.com']);
        $this->assertSame(1, DB::table('customers')->count());
        $this->assertSame('asha@example.com', DB::table('customers')->value('email'));
        // A second shop customer without any e-mail does not clash with the first.
        $sale(['name' => 'Ravi', 'phone' => '9123456780']);
        $this->assertSame(2, DB::table('customers')->count());
        $this->assertSame(2, DB::table('orders')->where('customer_id', $c->id)->count());
    }

    public function test_a_shop_customer_can_register_online_and_takes_over_their_record(): void
    {
        DB::table('site_settings')->where('key', 'commerce_accounts_enabled')->update(['value' => '1']);
        \App\Support\Commerce::forget();
        $id = 'p0000000-0000-0000-0000-000000000001';
        $this->product($id, 'ER-0001', 9, 100);
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => $id, 'variant_id' => null, 'qty' => 1]], 'payment_method' => 'cash', 'customer' => ['name' => 'Asha', 'email' => 'asha@example.com']])->assertOk();
        $shopId = DB::table('customers')->value('id');

        $this->postJson('/api/account/register', ['name' => 'Asha Verma', 'email' => 'asha@example.com', 'password' => 'a-long-password'], ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'])->assertOk()->assertJson(['ok' => true]);
        $this->assertSame(1, DB::table('customers')->count());
        $this->assertNotSame('', DB::table('customers')->where('id', $shopId)->value('password_hash'));
        // A shop customer who has not registered cannot sign in, whatever password is tried.
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => $id, 'variant_id' => null, 'qty' => 1]], 'payment_method' => 'cash', 'customer' => ['name' => 'Ravi', 'email' => 'ravi@example.com']])->assertOk();
        $this->postJson('/api/account/sign-in', ['email' => 'ravi@example.com', 'password' => 'anything-at-all'], ['X-Requested-With' => 'XMLHttpRequest'])->assertOk()->assertJson(['ok' => false]);
    }

    public function test_the_offline_shop_is_refused_everywhere_while_the_add_on_is_off(): void
    {
        config(['shop.features.offline_shop' => false]);
        $id = 'p0000000-0000-0000-0000-000000000001';
        $this->product($id, 'ER-0001', 5);

        $this->admin('GET', '/api/admin/features')->assertOk()->assertJson(['features' => ['offline_shop' => false]]);
        $this->admin('GET', '/api/admin/shop/lookup', ['q' => 'ER-0001'])->assertStatus(403)->assertJson(['feature' => 'offline_shop']);
        $this->admin('POST', '/api/admin/shop/sale', ['lines' => [['product_id' => $id, 'qty' => 1]], 'payment_method' => 'cash'])->assertStatus(403);
        $this->admin('POST', '/api/admin/units/create', ['product_id' => $id, 'count' => 2])->assertStatus(403);
        $this->assertSame(0, DB::table('orders')->count());
        $this->assertSame(5, (int) DB::table('products')->where('id', $id)->value('stock_quantity'));
        // The reports show no online/shop split.
        $this->assertSame([], $this->admin('GET', '/api/admin/reports', ['channel' => 'shop'])->json('channels'));

        config(['shop.features.offline_shop' => true]);
        $this->admin('GET', '/api/admin/features')->assertJson(['features' => ['offline_shop' => true]]);
        $this->admin('GET', '/api/admin/shop/lookup', ['q' => 'ER-0001'])->assertOk();
    }
}
