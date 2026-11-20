<?php

namespace Tests\Feature;

use App\Support\Commerce;
use App\Support\CustomerAuth;
use App\Support\Data\QueryEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Cart, checkout and customer accounts: the rules that protect the shop's money and stock.
 */
class CommerceTest extends TestCase
{
    use RefreshDatabase;

    private array $h = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];
    private const P1 = '00000000-0000-0000-0000-000000000001';
    private const P2 = '00000000-0000-0000-0000-000000000002';

    protected function setUp(): void
    {
        parent::setUp();
        Commerce::forget();
        $this->product(self::P1, 'ring', 1000, 5);
        $this->product(self::P2, 'chain', 500, null);
    }

    private function product(string $id, string $slug, float $price, ?int $stock): void
    {
        DB::table('products')->insert([
            'id' => $id, 'name' => ucfirst($slug), 'slug' => $slug, 'sku' => strtoupper($slug), 'price' => $price,
            'stock_quantity' => $stock, 'occasion' => '[]', 'specifications' => '{}', 'published' => 1,
        ]);
    }

    private function enable(array $keys = ['cart', 'checkout']): void
    {
        foreach ($keys as $k) {
            DB::table('site_settings')->where('key', "commerce_{$k}_enabled")->update(['value' => '1']);
        }
        Commerce::forget();
    }

    /** Sends a JSON request carrying the shopper's session cookie. */
    private function asCustomer(string $cookie, string $method, string $uri, array $json = [])
    {
        return $this->call($method, $uri, [], [CustomerAuth::COOKIE => $cookie], [], [
            'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json',
        ], $json ? json_encode($json) : null);
    }

    private function order(array $over = []): array
    {
        return $over + [
            'items' => [['id' => self::P1, 'qty' => 2]],
            'paymentMethod' => 'cod',
            'customer' => ['name' => 'Asha', 'email' => 'asha@example.com', 'phone' => '9876543210'],
            'address' => ['name' => 'Asha', 'phone' => '9876543210', 'line1' => '1 MG Road', 'city' => 'Pune', 'state' => 'Maharashtra', 'pincode' => '411001'],
        ];
    }

    public function test_everything_is_off_by_default(): void
    {
        $this->postJson('/api/cart/quote', ['items' => [['id' => self::P1, 'qty' => 1]]], $this->h)->assertStatus(403);
        $this->postJson('/api/checkout', $this->order(), $this->h)->assertStatus(403);
        $this->postJson('/api/account/register', ['name' => 'A', 'email' => 'a@b.co', 'password' => 'password123'], $this->h)->assertStatus(403);
        $this->assertSame(0, DB::table('orders')->count());
    }

    public function test_checkout_needs_the_cart_too(): void
    {
        $this->enable(['checkout']);
        $this->postJson('/api/checkout', $this->order(), $this->h)->assertStatus(403);
    }

    public function test_prices_always_come_from_the_database(): void
    {
        $this->enable();
        $res = $this->postJson('/api/cart/quote', ['items' => [['id' => self::P1, 'qty' => 2, 'price' => 1, 'name' => 'hacked']]], $this->h)->assertOk();
        $this->assertSame(1000.0, (float) $res->json('lines.0.price'));
        $this->assertSame(2000.0, (float) $res->json('subtotal'));
        $this->assertSame(0.0, (float) $res->json('shipping'));   // free over 1999
        $this->assertSame(2000.0, (float) $res->json('total'));
    }

    public function test_shipping_is_added_below_the_free_threshold_and_quantities_are_clamped(): void
    {
        $this->enable();
        $res = $this->postJson('/api/cart/quote', ['items' => [['id' => self::P2, 'qty' => 1]]], $this->h)->assertOk();
        $this->assertSame(599.0, (float) $res->json('total'));    // 500 + 99 shipping

        $res = $this->postJson('/api/cart/quote', ['items' => [['id' => self::P2, 'qty' => 9999]]], $this->h)->assertOk();
        $this->assertSame(10, $res->json('lines.0.qty'));          // max per item
    }

    public function test_an_order_decreases_stock_and_cancelling_returns_it(): void
    {
        $this->enable();
        $res = $this->postJson('/api/checkout', $this->order(), $this->h)->assertStatus(201);
        $this->assertSame(1001, $res->json('number'));
        $this->assertSame(3, (int) DB::table('products')->where('id', self::P1)->value('stock_quantity'));

        $second = $this->postJson('/api/checkout', $this->order(['items' => [['id' => self::P1, 'qty' => 1]]]), $this->h)->assertStatus(201);
        $this->assertSame(1002, $second->json('number'));

        $order = DB::table('orders')->where('number', 1001)->first();
        $this->assertSame('cod', $order->payment_method);
        $this->assertSame('pending', $order->payment_status);
        $this->assertSame(2000.0, (float) $order->total);
        $this->assertSame(1, DB::table('order_events')->where('order_id', $order->id)->count());

        \App\Support\OrderService::cancel($order->id);
        \App\Support\OrderService::cancel($order->id); // idempotent
        $this->assertSame(4, (int) DB::table('products')->where('id', self::P1)->value('stock_quantity'));
    }

    public function test_you_cannot_oversell(): void
    {
        $this->enable();
        $this->postJson('/api/checkout', $this->order(['items' => [['id' => self::P1, 'qty' => 5]]]), $this->h)->assertStatus(201);
        $this->postJson('/api/checkout', $this->order(['items' => [['id' => self::P1, 'qty' => 1]]]), $this->h)
            ->assertStatus(422)->assertJsonPath('message', 'Ring: Sold out');
        $this->assertSame(1, DB::table('orders')->count());
    }

    public function test_bad_details_are_rejected(): void
    {
        $this->enable();
        $bad = $this->order();
        $bad['address']['pincode'] = '12';
        $this->postJson('/api/checkout', $bad, $this->h)->assertStatus(422)->assertJsonValidationErrors(['address.pincode']);
        $this->postJson('/api/checkout', $this->order(['items' => []]), $this->h)->assertStatus(422);
        $this->postJson('/api/checkout', $this->order(['paymentMethod' => 'razorpay']), $this->h)->assertStatus(422); // no keys configured
        $this->assertSame(0, DB::table('orders')->count());
    }

    public function test_a_guest_needs_the_private_token_to_open_an_order(): void
    {
        $this->enable();
        $res = $this->postJson('/api/checkout', $this->order(), $this->h)->assertStatus(201);
        $number = $res->json('number');

        $this->getJson("/api/orders/{$number}", $this->h)->assertStatus(404);
        $this->getJson("/api/orders/{$number}?token=wrong", $this->h)->assertStatus(404);
        $this->getJson("/api/orders/{$number}?token=".$res->json('token'), $this->h)->assertOk()->assertJsonPath('total', 2000)
            ->assertJsonMissingPath('access_token');
    }

    public function test_razorpay_signature_is_checked(): void
    {
        config(['services.razorpay.key_id' => 'rzp_test_x', 'services.razorpay.key_secret' => 'secret']);
        $this->enable();
        $res = $this->postJson('/api/checkout', $this->order(), $this->h)->assertStatus(201);
        $order = DB::table('orders')->where('number', $res->json('number'))->first();
        DB::table('orders')->where('id', $order->id)->update(['razorpay_order_id' => 'order_abc', 'payment_method' => 'razorpay']);

        $payload = ['number' => $order->number, 'token' => $order->access_token, 'razorpay_order_id' => 'order_abc', 'razorpay_payment_id' => 'pay_1'];
        $this->postJson('/api/checkout/verify-payment', $payload + ['razorpay_signature' => 'forged'], $this->h)->assertStatus(422);
        $this->assertSame('failed', DB::table('orders')->where('id', $order->id)->value('payment_status'));

        $good = hash_hmac('sha256', 'order_abc|pay_1', 'secret');
        $this->postJson('/api/checkout/verify-payment', $payload + ['razorpay_signature' => $good], $this->h)->assertOk();
        $this->assertSame('paid', DB::table('orders')->where('id', $order->id)->value('payment_status'));
    }

    public function test_customer_accounts_only_see_their_own_orders(): void
    {
        $this->enable(['cart', 'checkout', 'accounts']);

        $reg = $this->postJson('/api/account/register', ['name' => 'Asha', 'email' => 'Asha@Example.com', 'password' => 'password123'], $this->h)->assertOk();
        $cookie = collect($reg->headers->getCookies())->first(fn ($c) => $c->getName() === CustomerAuth::COOKIE);
        $this->assertNotNull($cookie);
        $this->assertTrue($cookie->isHttpOnly());

        // A duplicate e-mail is refused, and the same address in another case counts as the same account.
        $this->postJson('/api/account/register', ['name' => 'X', 'email' => 'asha@example.com', 'password' => 'password123'], $this->h)->assertJsonPath('ok', false);

        // A second shopper's order.
        $this->postJson('/api/checkout', $this->order(['customer' => ['name' => 'Ravi', 'email' => 'ravi@example.com', 'phone' => '9876543211']]), $this->h)->assertStatus(201);

        $this->asCustomer($cookie->getValue(), 'POST', '/api/checkout', $this->order(['items' => [['id' => self::P2, 'qty' => 1]]]))->assertStatus(201);

        $mine = $this->asCustomer($cookie->getValue(), 'GET', '/api/account/orders')->assertOk();
        $this->assertCount(1, $mine->json('orders'));
        $this->asCustomer($cookie->getValue(), 'GET', '/api/account/orders/1001')->assertStatus(404); // Ravi's
        $this->getJson('/api/account/orders', $this->h)->assertStatus(401);
    }

    public function test_wishlist_merge_and_toggle(): void
    {
        $this->enable(['accounts']);
        $reg = $this->postJson('/api/account/register', ['name' => 'Asha', 'email' => 'a@example.com', 'password' => 'password123'], $this->h);
        $cookie = collect($reg->headers->getCookies())->first(fn ($c) => $c->getName() === CustomerAuth::COOKIE)->getValue();

        $merged = $this->asCustomer($cookie, 'POST', '/api/account/wishlist/merge', ['ids' => [self::P1, 'not-a-product']])->assertOk();
        $this->assertSame([self::P1], $merged->json('ids'));
        $toggled = $this->asCustomer($cookie, 'POST', '/api/account/wishlist/toggle', ['productId' => self::P1]);
        $this->assertSame([], $toggled->json('ids'));
    }

    public function test_orders_and_customers_are_private_and_read_only(): void
    {
        DB::table('customers')->insert(['id' => '30000000-0000-0000-0000-000000000001', 'name' => 'A', 'email' => 'a@b.co', 'password_hash' => 'x']);
        $d = fn (array $x) => $x + ['fields' => '*', 'count' => false, 'head' => false, 'filters' => [], 'orders' => [], 'returning' => true];

        foreach (['orders', 'customers', 'order_items', 'customer_addresses'] as $table) {
            $r = (new QueryEngine(false))->execute($d(['table' => $table, 'action' => 'select']));
            $this->assertSame('Not authorised', $r['error']['message'], $table);
            $w = (new QueryEngine(true))->execute($d(['table' => $table, 'action' => 'delete', 'filters' => [['op' => 'eq', 'col' => 'id', 'value' => 'x']]]));
            $this->assertSame('Not authorised', $w['error']['message'], "$table write");
        }

        $admin = (new QueryEngine(true))->execute($d(['table' => 'customers', 'action' => 'select']));
        $this->assertArrayNotHasKey('password_hash', $admin['data'][0]);
        $this->assertStringContainsString('Unknown column', (new QueryEngine(true))->execute($d(['table' => 'customers', 'action' => 'select', 'fields' => 'password_hash']))['error']['message']);
    }

    public function test_only_an_admin_can_change_orders(): void
    {
        $this->postJson('/api/admin/orders/x', ['action' => 'cancel'], $this->h)->assertStatus(401);
        $this->getJson('/api/admin/dashboard', $this->h)->assertStatus(401);
    }

    public function test_shop_and_account_pages_exist_but_are_never_indexed(): void
    {
        $this->withAppShell(function () {
            foreach (['/cart', '/checkout', '/checkout/thank-you/1001', '/wishlist', '/account', '/account/orders/1001', '/login', '/register', '/forgot-password', '/reset-password'] as $path) {
                $this->get($path)->assertOk()->assertSee('noindex', false);
            }
        });
    }

    /* ------------------------------------------------------------- variants */

    private function withVariants(): array
    {
        DB::table('products')->where('id', self::P1)->update(['options' => json_encode([['name' => 'Size', 'values' => ['6', '7']]])]);
        $small = '40000000-0000-0000-0000-000000000001';
        $large = '40000000-0000-0000-0000-000000000002';
        DB::table('product_variants')->insert([
            ['id' => $small, 'product_id' => self::P1, 'title' => '6', 'options' => '{"Size":"6"}', 'sku' => 'RING-6', 'price' => null, 'stock_quantity' => 2, 'sort_order' => 0],
            ['id' => $large, 'product_id' => self::P1, 'title' => '7', 'options' => '{"Size":"7"}', 'sku' => 'RING-7', 'price' => 1200, 'stock_quantity' => null, 'sort_order' => 1],
        ]);

        return [$small, $large];
    }

    public function test_a_product_with_options_needs_a_choice_and_uses_the_variant_price(): void
    {
        $this->enable();
        [$small, $large] = $this->withVariants();

        $none = $this->postJson('/api/cart/quote', ['items' => [['id' => self::P1, 'qty' => 1]]], $this->h)->assertOk();
        $this->assertSame('Please choose an option', $none->json('lines.0.issue'));
        $this->assertSame(0.0, (float) $none->json('subtotal'));

        $bad = $this->postJson('/api/cart/quote', ['items' => [['id' => self::P1, 'variant' => 'nope', 'qty' => 1]]], $this->h)->assertOk();
        $this->assertSame('This option is no longer available', $bad->json('lines.0.issue'));

        $ok = $this->postJson('/api/cart/quote', ['items' => [['id' => self::P1, 'variant' => $large, 'qty' => 2]]], $this->h)->assertOk();
        $this->assertSame(1200.0, (float) $ok->json('lines.0.price'));    // variant price, not the 1000 product price
        $this->assertSame('7', $ok->json('lines.0.variantTitle'));
        $this->assertSame('RING-7', $ok->json('lines.0.sku'));
        $this->assertSame(2400.0, (float) $ok->json('subtotal'));

        $inherit = $this->postJson('/api/cart/quote', ['items' => [['id' => self::P1, 'variant' => $small, 'qty' => 1]]], $this->h)->assertOk();
        $this->assertSame(1000.0, (float) $inherit->json('lines.0.price')); // blank variant price = product price
    }

    public function test_each_variant_has_its_own_stock_and_orders_remember_the_choice(): void
    {
        $this->enable();
        [$small, $large] = $this->withVariants();
        DB::table('products')->where('id', self::P1)->update(['stock_quantity' => 99]); // product stock is ignored for variant products

        $this->postJson('/api/checkout', $this->order(['items' => [['id' => self::P1, 'variant' => $small, 'qty' => 3]]]), $this->h)
            ->assertStatus(422)->assertJsonPath('message', 'Ring (6): Only 2 left');

        $res = $this->postJson('/api/checkout', $this->order(['items' => [['id' => self::P1, 'variant' => $small, 'qty' => 2]]]), $this->h)->assertStatus(201);
        $this->assertSame(0, (int) DB::table('product_variants')->where('id', $small)->value('stock_quantity'));
        $this->assertSame(99, (int) DB::table('products')->where('id', self::P1)->value('stock_quantity'));

        $order = DB::table('orders')->where('number', $res->json('number'))->first();
        $item = DB::table('order_items')->where('order_id', $order->id)->first();
        $this->assertSame($small, $item->variant_id);
        $this->assertSame('6', $item->variant_title);

        $this->postJson('/api/checkout', $this->order(['items' => [['id' => self::P1, 'variant' => $small, 'qty' => 1]]]), $this->h)
            ->assertStatus(422)->assertJsonPath('message', 'Ring (6): Sold out');

        // The other size has untracked stock and is unaffected.
        $this->postJson('/api/checkout', $this->order(['items' => [['id' => self::P1, 'variant' => $large, 'qty' => 5]]]), $this->h)->assertStatus(201);

        \App\Support\OrderService::cancel($order->id);
        $this->assertSame(2, (int) DB::table('product_variants')->where('id', $small)->value('stock_quantity'));
    }

    private function adminCookie(): string
    {
        $adminId = '50000000-0000-0000-0000-000000000001';
        DB::table('admin_users')->insert(['id' => $adminId, 'email' => 'a@b.co', 'password_hash' => 'x']);
        $token = 'test-admin-token';
        DB::table('admin_sessions')->insert([
            'id' => '50000000-0000-0000-0000-000000000002', 'admin_id' => $adminId, 'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDay()->format('Y-m-d H:i:s'),
        ]);

        return $token;
    }

    private function save(string $cookie, array $payload)
    {
        return $this->call('POST', '/api/admin/products/save', [], [config('shop.session_cookie') => $cookie], [], [
            'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json',
        ], json_encode($payload));
    }

    public function test_the_admin_saves_options_and_variants_and_bad_combinations_are_refused(): void
    {
        $cookie = $this->adminCookie();
        $base = ['name' => 'Anklet', 'slug' => 'anklet', 'sku' => 'ANK', 'price' => 500, 'category' => 'Rings', 'material' => 'Brass', 'occasion' => []];
        $options = [['name' => 'Size', 'values' => ['S', 'M']], ['name' => 'Colour', 'values' => ['Gold']]];
        $variant = fn (string $size, array $over = []) => $over + ['options' => ['Size' => $size, 'Colour' => 'Gold'], 'price' => null, 'stock_quantity' => 4];

        $res = $this->save($cookie, ['payload' => $base + ['options' => $options], 'images' => [], 'removedImages' => [], 'variants' => [$variant('S'), $variant('M', ['price' => 650, 'sku' => 'ANK-M'])]])->assertOk();
        $id = $res->json('id');
        $rows = DB::table('product_variants')->where('product_id', $id)->orderBy('sort_order')->get();
        $this->assertCount(2, $rows);
        $this->assertSame('S / Gold', $rows[0]->title);
        $this->assertSame(650.0, (float) $rows[1]->price);
        $this->assertSame(2, count(json_decode(DB::table('products')->where('id', $id)->value('options'), true)));

        // Editing keeps the variant ids; removing a variant deletes only that row.
        $keepId = $rows[1]->id;
        $this->save($cookie, ['id' => $id, 'payload' => $base + ['options' => $options], 'images' => [], 'removedImages' => [], 'variants' => [$variant('M', ['id' => $keepId, 'price' => 700])]])->assertOk();
        $after = DB::table('product_variants')->where('product_id', $id)->get();
        $this->assertCount(1, $after);
        $this->assertSame($keepId, $after[0]->id);
        $this->assertSame(700.0, (float) $after[0]->price);

        // Duplicate combination, unknown value and missing variants are rejected.
        $this->save($cookie, ['id' => $id, 'payload' => $base + ['options' => $options], 'images' => [], 'removedImages' => [], 'variants' => [$variant('S'), $variant('S')]])->assertStatus(422);
        $this->save($cookie, ['id' => $id, 'payload' => $base + ['options' => $options], 'images' => [], 'removedImages' => [], 'variants' => [$variant('XL')]])->assertStatus(422);
        $this->save($cookie, ['id' => $id, 'payload' => $base + ['options' => $options], 'images' => [], 'removedImages' => [], 'variants' => []])->assertStatus(422);

        // Removing the options removes every variant.
        $this->save($cookie, ['id' => $id, 'payload' => $base, 'images' => [], 'removedImages' => [], 'variants' => []])->assertOk();
        $this->assertSame(0, DB::table('product_variants')->where('product_id', $id)->count());
    }

    public function test_variants_are_publicly_readable_only_for_published_products(): void
    {
        [$small] = $this->withVariants();
        $d = ['table' => 'products', 'action' => 'select', 'fields' => 'id,options,product_variants(id,title,price)', 'count' => false, 'head' => false, 'filters' => [], 'orders' => [], 'returning' => true];
        $r = (new QueryEngine(false))->execute($d);
        $row = collect($r['data'])->firstWhere('id', self::P1);
        $this->assertCount(2, $row['product_variants']);

        DB::table('products')->where('id', self::P1)->update(['published' => 0]);
        $this->assertNull(collect((new QueryEngine(false))->execute($d)['data'])->firstWhere('id', self::P1));
        $direct = (new QueryEngine(false))->execute(['table' => 'product_variants', 'action' => 'select', 'fields' => '*', 'filters' => [], 'orders' => [], 'returning' => true, 'count' => false, 'head' => false]);
        $this->assertSame([], $direct['data']);
        $write = (new QueryEngine(true))->execute(['table' => 'product_variants', 'action' => 'delete', 'filters' => [['op' => 'eq', 'col' => 'id', 'value' => $small]], 'fields' => '*', 'orders' => [], 'returning' => false, 'count' => false, 'head' => false]);
        $this->assertSame('Not authorised', $write['error']['message']);
    }
}
