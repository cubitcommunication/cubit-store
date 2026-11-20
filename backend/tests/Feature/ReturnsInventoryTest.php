<?php

namespace Tests\Feature;

use App\Support\AdminAuth;
use App\Support\Commerce;
use App\Support\CustomerAuth;
use App\Support\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Customer returns, the stock history and inventory screen, the sales report and the product feed. */
class ReturnsInventoryTest extends TestCase
{
    use RefreshDatabase;

    private const PRODUCT = '91000000-0000-0000-0000-000000000001';
    private const ORDER = '91000000-0000-0000-0000-000000000002';
    private array $h = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];
    private string $cookie = '';
    private string $customerId = '';

    protected function setUp(): void
    {
        parent::setUp();
        $now = now()->format('Y-m-d H:i:s');
        DB::table('admin_users')->insert(['id' => '92000000-0000-0000-0000-000000000001', 'email' => 'owner@example.com', 'password_hash' => AdminAuth::hashPassword('x-super-password'), 'role' => 'super', 'active' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('admin_sessions')->insert(['id' => '93000000-0000-0000-0000-000000000001', 'admin_id' => '92000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'boss'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);
        DB::table('products')->insert([
            'id' => self::PRODUCT, 'name' => 'Jhumka', 'slug' => 'jhumka', 'sku' => 'JH1', 'price' => 1000, 'category' => 'Earrings', 'material' => 'Brass',
            'stock_quantity' => 5, 'occasion' => '[]', 'specifications' => '{}', 'published' => 1, 'description' => '<p>Pretty</p>',
        ]);
        DB::table('product_images')->insert(['id' => (string) Str::uuid(), 'product_id' => self::PRODUCT, 'image_url' => '/api/public/img/jhumka.jpg', 'sort_order' => 0]);
        foreach (['cart', 'checkout', 'accounts'] as $k) {
            DB::table('site_settings')->where('key', "commerce_{$k}_enabled")->update(['value' => '1']);
        }
        Commerce::forget();

        $reg = $this->postJson('/api/account/register', ['name' => 'Asha', 'email' => 'asha@example.com', 'password' => 'password123'], $this->h)->assertOk();
        $this->cookie = collect($reg->headers->getCookies())->first(fn ($c) => $c->getName() === CustomerAuth::COOKIE)->getValue();
        $this->customerId = (string) DB::table('customers')->value('id');
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

    private function admin(string $method, string $uri, array $params = [])
    {
        return $this->call($method, $uri, $params, [config('shop.session_cookie') => 'boss'], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json']);
    }

    private function customer(string $method, string $uri, array $json = [])
    {
        return $this->call($method, $uri, [], [CustomerAuth::COOKIE => $this->cookie], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], $json ? json_encode($json) : null);
    }

    /** A shipped, paid order of 2 jhumkas. */
    private function shippedOrder(?string $fulfilledAt = null): string
    {
        DB::table('orders')->insert([
            'id' => self::ORDER, 'number' => 1501, 'customer_id' => $this->customerId, 'access_token' => 'tok', 'name' => 'Asha', 'email' => 'asha@example.com', 'phone' => '9876543210',
            'status' => 'open', 'payment_status' => 'paid', 'payment_method' => 'razorpay', 'fulfillment_status' => 'fulfilled', 'fulfilled_at' => $fulfilledAt ?? now()->format('Y-m-d H:i:s'),
            'subtotal' => 2000, 'total' => 2000, 'shipping_address' => json_encode(['state' => 'Kerala']),
        ]);
        $itemId = (string) Str::uuid();
        DB::table('order_items')->insert(['id' => $itemId, 'order_id' => self::ORDER, 'product_id' => self::PRODUCT, 'name' => 'Jhumka', 'sku' => 'JH1', 'price' => 1000, 'quantity' => 2, 'line_total' => 2000]);

        return $itemId;
    }

    public function test_a_customer_can_return_within_the_window_and_the_store_restocks_and_refunds(): void
    {
        $this->setting('commerce_returns_enabled', '1');
        $item = $this->shippedOrder();

        $view = $this->customer('GET', '/api/account/orders/1501')->assertOk();
        $this->assertTrue($view->json('returns.canRequest'));

        // Too many pieces, then a valid request for one.
        $this->customer('POST', '/api/account/orders/1501/return', ['items' => [['id' => $item, 'qty' => 3]], 'reason' => 'damaged'])->assertStatus(422);
        $this->customer('POST', '/api/account/orders/1501/return', ['items' => [['id' => $item, 'qty' => 1]], 'reason' => 'damaged', 'details' => 'Broken hook'])->assertCreated();
        // Only one piece is left to claim.
        $this->customer('POST', '/api/account/orders/1501/return', ['items' => [['id' => $item, 'qty' => 2]], 'reason' => 'other'])->assertStatus(422);
        $this->assertSame('return_requested', DB::table('admin_notifications')->value('event'));

        $return = DB::table('return_requests')->first();
        $this->admin('POST', "/api/admin/returns/{$return->id}", ['action' => 'refund'])->assertStatus(422);   // approve first
        $this->admin('POST', "/api/admin/returns/{$return->id}", ['action' => 'approve', 'note' => 'Send it back to us'])->assertOk();
        $this->admin('POST', "/api/admin/returns/{$return->id}", ['action' => 'received', 'restock' => true])->assertOk();
        $this->assertSame(6, (int) DB::table('products')->where('id', self::PRODUCT)->value('stock_quantity'));
        $this->assertSame('return', DB::table('stock_adjustments')->value('reason'));

        $this->admin('POST', "/api/admin/returns/{$return->id}", ['action' => 'refund', 'amount' => 1000])->assertOk();
        $this->assertSame('refunded', DB::table('orders')->where('id', self::ORDER)->value('payment_status'));
        $this->assertEquals(1000, DB::table('return_requests')->value('refund_amount'));
        $this->assertSame('refunded', DB::table('return_requests')->value('status'));
        $this->assertTrue(DB::table('order_events')->where('order_id', self::ORDER)->where('message', 'like', 'Returned parcel received%')->exists());
    }

    public function test_returns_are_off_by_default_and_the_window_and_shipping_status_are_enforced(): void
    {
        $item = $this->shippedOrder();
        $body = ['items' => [['id' => $item, 'qty' => 1]], 'reason' => 'damaged'];

        $this->customer('POST', '/api/account/orders/1501/return', $body)->assertStatus(422);   // switched off
        $this->setting('commerce_returns_enabled', '1');
        $this->customer('POST', '/api/account/orders/1501/return', $body)->assertCreated();

        DB::table('return_requests')->delete();
        DB::table('orders')->where('id', self::ORDER)->update(['fulfilled_at' => now()->subDays(10)->format('Y-m-d H:i:s')]);
        $this->customer('POST', '/api/account/orders/1501/return', $body)->assertStatus(422);   // 7 days have passed
        $this->setting('commerce_return_days', '30');
        $this->customer('POST', '/api/account/orders/1501/return', $body)->assertCreated();

        DB::table('return_requests')->delete();
        DB::table('orders')->where('id', self::ORDER)->update(['fulfillment_status' => 'unfulfilled']);
        $this->customer('POST', '/api/account/orders/1501/return', $body)->assertStatus(422);   // not shipped yet
    }

    public function test_stock_changes_are_logged_and_adjustments_follow_the_rules(): void
    {
        $this->admin('POST', '/api/admin/inventory/adjust', ['product_id' => self::PRODUCT, 'mode' => 'add', 'quantity' => 10, 'reason' => 'received', 'note' => 'New batch'])->assertOk()->assertJsonPath('stock', 15);
        $this->admin('POST', '/api/admin/inventory/adjust', ['product_id' => self::PRODUCT, 'mode' => 'add', 'quantity' => -20, 'reason' => 'damaged'])->assertStatus(422);
        $this->admin('POST', '/api/admin/inventory/adjust', ['product_id' => self::PRODUCT, 'mode' => 'set', 'quantity' => 4, 'reason' => 'count'])->assertOk()->assertJsonPath('stock', 4);

        $hist = $this->admin('GET', '/api/admin/inventory/history', ['product_id' => self::PRODUCT])->assertOk()->json('items');
        $this->assertSame([-11, 10], [$hist[0]['change'], $hist[1]['change']]);
        $this->assertSame('owner@example.com', $hist[0]['by']);

        // Selling and cancelling are written to the same history.
        $res = OrderService::place([['id' => self::PRODUCT, 'qty' => 2]], ['name' => 'A', 'email' => 'a@example.com', 'phone' => '9876543210'], ['state' => 'Goa', 'line1' => 'x', 'city' => 'y', 'pincode' => '403001', 'name' => 'A', 'phone' => '9876543210'], 'cod', null, null);
        $this->assertNotNull($res['order']);
        $this->assertSame(2, (int) DB::table('products')->where('id', self::PRODUCT)->value('stock_quantity'));
        OrderService::cancel($res['order']->id, 'test', false);
        $this->assertSame(4, (int) DB::table('products')->where('id', self::PRODUCT)->value('stock_quantity'));
        $this->assertEqualsCanonicalizing(['count', 'order', 'cancel', 'received'], DB::table('stock_adjustments')->pluck('reason')->all());

        $rows = $this->admin('GET', '/api/admin/inventory', ['filter' => 'low'])->assertOk()->json('rows');
        $this->assertSame('ok', $this->admin('GET', '/api/admin/inventory')->json('rows.0.state'));
        $this->assertCount(0, $rows);
    }

    public function test_the_report_counts_sales_and_leaves_out_cancelled_orders_and_the_feed_lists_the_product(): void
    {
        $this->shippedOrder();
        DB::table('orders')->insert([
            'id' => '91000000-0000-0000-0000-000000000009', 'number' => 1502, 'access_token' => 't2', 'name' => 'B', 'email' => 'b@example.com', 'phone' => '9876543210',
            'status' => 'cancelled', 'payment_status' => 'pending', 'payment_method' => 'cod', 'fulfillment_status' => 'unfulfilled', 'subtotal' => 999, 'total' => 999, 'shipping_address' => '{}',
        ]);

        $r = $this->admin('GET', '/api/admin/reports')->assertOk();
        $r->assertJsonPath('summary.orders', 1)->assertJsonPath('summary.revenue', 2000)->assertJsonPath('summary.units', 2)->assertJsonPath('summary.cancelled', 1);
        $r->assertJsonPath('products.0.name', 'Jhumka')->assertJsonPath('categories.0.name', 'Earrings')->assertJsonPath('states.0.name', 'Kerala');
        $this->assertCount(30, $r->json('days'));

        $feed = $this->get('/api/feeds/products.xml');
        $feed->assertOk();
        $this->assertStringContainsString('<g:id>JH1</g:id>', $feed->getContent());
        $this->assertStringContainsString('1000.00 INR', $feed->getContent());
        $this->assertStringContainsString('in stock', $feed->getContent());

        $this->getJson('/api/admin/reports', $this->h)->assertStatus(401);
    }
}
