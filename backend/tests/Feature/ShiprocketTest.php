<?php

namespace Tests\Feature;

use App\Support\AdminAuth;
use App\Support\Secrets;
use App\Support\Shiprocket;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Shiprocket: connection is the main administrator's; order staff create shipments, book couriers and track parcels. */
class ShiprocketTest extends TestCase
{
    use RefreshDatabase;

    private const ORDER = '80000000-0000-0000-0000-000000000001';
    private const PRODUCT = '80000000-0000-0000-0000-000000000002';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Secrets::forget();
        $now = now()->format('Y-m-d H:i:s');
        DB::table('admin_users')->insert([
            ['id' => '81000000-0000-0000-0000-000000000001', 'email' => 'owner@example.com', 'password_hash' => AdminAuth::hashPassword('x-super-password'), 'role' => 'super', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['id' => '81000000-0000-0000-0000-000000000002', 'email' => 'staff@example.com', 'password_hash' => AdminAuth::hashPassword('x-staff-password'), 'role' => 'admin', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
        ]);
        DB::table('admin_sessions')->insert([
            ['id' => '82000000-0000-0000-0000-000000000001', 'admin_id' => '81000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'boss'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')],
            ['id' => '82000000-0000-0000-0000-000000000002', 'admin_id' => '81000000-0000-0000-0000-000000000002', 'token_hash' => hash('sha256', 'staff'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')],
        ]);
        DB::table('products')->insert([
            'id' => self::PRODUCT, 'name' => 'Ring', 'slug' => 'ring', 'sku' => 'RING', 'price' => 1000, 'category' => 'Rings', 'material' => 'Brass',
            'stock_quantity' => null, 'occasion' => '[]', 'specifications' => '{}', 'published' => 1, 'weight_grams' => 120, 'length_cm' => 8, 'breadth_cm' => 6, 'height_cm' => 3,
        ]);
    }

    private function as(string $token, string $method, string $uri, array $params = [])
    {
        return $this->call($method, $uri, $params, [config('shop.session_cookie') => $token], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json']);
    }

    private function connect(bool $on = true): void
    {
        Secrets::set(Secrets::SHIPROCKET_EMAIL, 'api@example.com');
        Secrets::set(Secrets::SHIPROCKET_PASSWORD, 'api-password-1');
        DB::table('site_settings')->where('key', 'shiprocket_enabled')->update(['value' => $on ? '1' : '0']);
        DB::table('site_settings')->where('key', 'shiprocket_pickup_location')->update(['value' => 'Warehouse']);
    }

    private function order(string $method = 'cod', string $payment = 'pending'): void
    {
        DB::table('orders')->insert([
            'id' => self::ORDER, 'number' => 1234, 'access_token' => 'tok', 'name' => 'Asha Rao', 'email' => 'asha@example.com', 'phone' => '9876543210',
            'status' => 'open', 'payment_status' => $payment, 'payment_method' => $method, 'fulfillment_status' => 'unfulfilled',
            'subtotal' => 2000, 'discount_total' => 200, 'shipping_total' => 100, 'cod_fee' => 50, 'total' => 1950,
            'shipping_address' => json_encode(['name' => 'Asha Rao', 'phone' => '+91 98765 43210', 'line1' => '1 MG Road', 'city' => 'Pune', 'state' => 'Maharashtra', 'pincode' => '411001']),
        ]);
        DB::table('order_items')->insert(['id' => '83000000-0000-0000-0000-000000000001', 'order_id' => self::ORDER, 'product_id' => self::PRODUCT, 'name' => 'Ring', 'sku' => 'RING', 'price' => 1000, 'quantity' => 2, 'line_total' => 2000]);
    }

    private function fakeShiprocket(array $override = []): void
    {
        Http::clearResolvedInstance(\Illuminate\Http\Client\Factory::class);
        app()->forgetInstance(\Illuminate\Http\Client\Factory::class);
        Http::fake(function ($request) use ($override) {
            $url = $request->url();
            foreach ($override as $needle => $response) {
                if (str_contains($url, $needle)) {
                    return $response;
                }
            }

            return match (true) {
                str_contains($url, '/auth/login') => Http::response(['token' => 'sr-token']),
                str_contains($url, '/settings/company/pickup') => Http::response(['data' => ['shipping_address' => [['pickup_location' => 'Warehouse', 'pin_code' => '395007', 'city' => 'Surat']]]]),
                str_contains($url, '/courier/serviceability') => Http::response(['data' => ['recommended_courier_company_id' => 10, 'available_courier_companies' => [
                    ['courier_company_id' => 10, 'courier_name' => 'Delhivery', 'rate' => 62.5, 'etd' => 'Nov 25, 2026', 'estimated_delivery_days' => 3, 'rating' => 4.4],
                    ['courier_company_id' => 11, 'courier_name' => 'Xpressbees', 'rate' => 55, 'estimated_delivery_days' => 5],
                ]]]),
                str_contains($url, '/orders/create/adhoc') => Http::response(['order_id' => 5551, 'shipment_id' => 7771, 'status' => 'NEW']),
                str_contains($url, '/courier/assign/awb') => Http::response(['awb_assign_status' => 1, 'response' => ['data' => ['awb_code' => 'AWB123456', 'courier_name' => 'Delhivery', 'courier_company_id' => 10]]]),
                str_contains($url, '/courier/generate/pickup') => Http::response(['pickup_status' => 1, 'response' => ['pickup_scheduled_date' => '2026-11-24 10:00:00']]),
                str_contains($url, '/courier/generate/label') => Http::response(['label_created' => 1, 'label_url' => 'https://kr-shipmultichannel.s3.amazonaws.com/label.pdf']),
                str_contains($url, '/courier/track/awb') => Http::response(['tracking_data' => ['track_status' => 1, 'track_url' => 'https://shiprocket.co/tracking/AWB123456', 'shipment_track' => [['current_status' => 'In Transit']]]]),
                str_contains($url, '/orders/cancel') => Http::response(['message' => 'Order cancelled']),
                default => Http::response([], 404),
            };
        });
    }

    public function test_only_the_main_admin_can_connect_shiprocket(): void
    {
        $this->fakeShiprocket();
        $this->as('staff', 'POST', '/api/admin/integrations/secrets', ['shiprocket_email' => 'a@b.co'])->assertStatus(403);
        $this->as('staff', 'POST', '/api/admin/integrations/test-shiprocket')->assertStatus(403);

        $this->as('boss', 'POST', '/api/admin/integrations/secrets', ['shiprocket_email' => 'api@example.com', 'shiprocket_password' => 'api-password-1', 'shiprocket_webhook_token' => 'my-webhook-token'])->assertOk();
        $this->assertSame('api-password-1', Secrets::get(Secrets::SHIPROCKET_PASSWORD));
        $this->assertStringNotContainsString('api-password-1', json_encode(DB::table('secure_settings')->pluck('value', 'key')));

        $res = $this->as('boss', 'POST', '/api/admin/integrations/test-shiprocket')->assertOk()->assertJsonPath('ok', true)->assertJsonPath('locations.0.name', 'Warehouse');
        $this->assertSame('395007', $res->json('locations.0.pincode'));

        $status = $this->as('boss', 'GET', '/api/admin/integrations/status')->assertOk();
        $status->assertJsonPath('shiprocket.email', 'api@example.com')->assertJsonPath('shiprocket.password', true);
        $this->assertStringNotContainsString('api-password-1', $status->getContent());

        // The pickup address and switch are integration settings: other admins cannot change them through the data API.
        $set = ['table' => 'site_settings', 'action' => 'update', 'fields' => '*', 'filters' => [['op' => 'eq', 'col' => 'key', 'value' => 'shiprocket_enabled']], 'orders' => [], 'returning' => false, 'count' => false, 'head' => false, 'values' => ['value' => '1']];
        $this->call('POST', '/api/query', [], [config('shop.session_cookie') => 'staff'], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], json_encode($set))
            ->assertJsonPath('error.message', 'Only the main administrator can change integrations.');
    }

    public function test_a_cod_order_goes_to_shiprocket_with_the_right_amounts_weight_and_address(): void
    {
        $this->connect();
        $this->order('cod');
        $this->fakeShiprocket();

        $this->as('staff', 'POST', '/api/admin/orders/'.self::ORDER.'/shipping/create')->assertOk()
            ->assertJsonPath('shipment.orderId', '5551')->assertJsonPath('shipment.shipmentId', '7771');

        Http::assertSent(function ($r) {
            if (! str_contains($r->url(), '/orders/create/adhoc')) {
                return false;
            }
            $b = $r->data();

            return $b['order_id'] === '1234' && $b['payment_method'] === 'COD' && $b['pickup_location'] === 'Warehouse'
                && $b['sub_total'] == 2000 && $b['shipping_charges'] == 150 && $b['total_discount'] == 200
                && $b['billing_phone'] === '9876543210' && $b['billing_pincode'] === '411001' && $b['billing_customer_name'] === 'Asha' && $b['billing_last_name'] === 'Rao'
                && $b['weight'] == 0.24 && $b['length'] == 8 && $b['breadth'] == 6 && $b['height'] == 6
                && $b['order_items'][0]['units'] === 2 && $b['order_items'][0]['sku'] === 'RING';
        });
        $this->assertSame('5551', DB::table('orders')->where('id', self::ORDER)->value('shiprocket_order_id'));

        // Cannot be sent twice.
        $this->as('staff', 'POST', '/api/admin/orders/'.self::ORDER.'/shipping/create')->assertStatus(422);
    }

    public function test_booking_a_courier_marks_the_order_shipped_and_the_rest_of_the_flow_works(): void
    {
        $this->connect();
        $this->order('cod');
        $this->fakeShiprocket();
        $base = '/api/admin/orders/'.self::ORDER.'/shipping';

        $this->as('staff', 'GET', $base.'/couriers')->assertOk()->assertJsonPath('recommended', 10)->assertJsonPath('couriers.0.name', 'Delhivery')->assertJsonPath('couriers.1.days', 5);
        $this->as('staff', 'POST', $base.'/assign')->assertStatus(422);   // not sent to Shiprocket yet
        $this->as('staff', 'POST', $base.'/create')->assertOk();

        $this->as('staff', 'POST', $base.'/assign', ['courier_id' => 10])->assertOk()->assertJsonPath('shipment.awb', 'AWB123456')->assertJsonPath('shipment.courier', 'Delhivery');
        $o = DB::table('orders')->where('id', self::ORDER)->first();
        $this->assertSame('fulfilled', $o->fulfillment_status);
        $this->assertSame('https://shiprocket.co/tracking/AWB123456', $o->tracking_url);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/courier/assign/awb') && $r->data()['courier_id'] === 10 && $r->data()['shipment_id'] === 7771);

        $this->as('staff', 'POST', $base.'/pickup')->assertOk();
        $this->assertSame('2026-11-24 10:00:00', DB::table('orders')->where('id', self::ORDER)->value('pickup_info'));
        $this->as('staff', 'POST', $base.'/label')->assertOk()->assertJsonPath('shipment.labelUrl', 'https://kr-shipmultichannel.s3.amazonaws.com/label.pdf');
        $this->as('staff', 'POST', $base.'/track')->assertOk()->assertJsonPath('shipment.status', 'In Transit');

        $events = DB::table('order_events')->where('order_id', self::ORDER)->pluck('message')->implode(' | ');
        $this->assertStringContainsString('Courier booked: Delhivery', $events);
        $this->assertStringContainsString('Courier status: In Transit', $events);

        $this->as('staff', 'POST', $base.'/cancel')->assertOk()->assertJsonPath('shipment.awb', null);
        $this->assertNull(DB::table('orders')->where('id', self::ORDER)->value('shiprocket_order_id'));
    }

    public function test_an_unpaid_online_order_or_a_switched_off_connection_cannot_ship(): void
    {
        $this->order('razorpay', 'pending');
        $this->fakeShiprocket();
        $this->as('staff', 'POST', '/api/admin/orders/'.self::ORDER.'/shipping/create')->assertStatus(422);   // not connected

        $this->connect();
        $this->as('staff', 'POST', '/api/admin/orders/'.self::ORDER.'/shipping/create')->assertStatus(422)->assertJsonPath('message', 'The online payment has not been received yet, so this order should not be shipped.');

        DB::table('orders')->where('id', self::ORDER)->update(['payment_status' => 'paid']);
        $this->as('staff', 'POST', '/api/admin/orders/'.self::ORDER.'/shipping/create')->assertOk();
        Http::assertSent(fn ($r) => str_contains($r->url(), '/orders/create/adhoc') && $r->data()['payment_method'] === 'Prepaid');
    }

    public function test_shiprocket_errors_are_shown_in_plain_words(): void
    {
        $this->connect();
        $this->order('cod');
        $this->fakeShiprocket(['/orders/create/adhoc' => Http::response(['message' => 'Wrong pickup location.', 'errors' => ['pickup_location' => ['The pickup location is invalid.']]], 422)]);

        $this->as('staff', 'POST', '/api/admin/orders/'.self::ORDER.'/shipping/create')->assertStatus(422)
            ->assertJsonPath('message', 'Shiprocket: Wrong pickup location. pickup_location: The pickup location is invalid.');
        $this->assertNull(DB::table('orders')->where('id', self::ORDER)->value('shiprocket_order_id'));

        // A wrong login is explained, and does not leak the password.
        $this->fakeShiprocket(['/auth/login' => Http::response(['message' => 'Invalid'], 403)]);
        Cache::flush();
        $res = $this->as('boss', 'POST', '/api/admin/integrations/test-shiprocket')->assertOk()->assertJsonPath('ok', false);
        $this->assertStringContainsString('rejected the login', $res->json('message'));
        $this->assertStringNotContainsString('api-password-1', $res->getContent());
    }

    public function test_the_webhook_needs_its_token_and_updates_the_order_status(): void
    {
        DB::table('orders')->insert([
            'id' => self::ORDER, 'number' => 1234, 'access_token' => 'tok', 'name' => 'A', 'email' => 'a@b.co', 'phone' => '9876543210', 'shipping_address' => '{}', 'awb_code' => 'AWB123456', 'shipping_status' => 'Picked Up',
        ]);
        $this->postJson('/api/webhooks/shiprocket', ['awb' => 'AWB123456', 'current_status' => 'Delivered'])->assertStatus(503);   // no token saved yet

        Secrets::set(Secrets::SHIPROCKET_WEBHOOK_TOKEN, 'my-webhook-token');
        $this->postJson('/api/webhooks/shiprocket', ['awb' => 'AWB123456', 'current_status' => 'Delivered'])->assertStatus(401);
        $this->postJson('/api/webhooks/shiprocket', ['awb' => 'AWB123456', 'current_status' => 'Delivered'], ['x-api-key' => 'wrong'])->assertStatus(401);
        $this->assertSame('Picked Up', DB::table('orders')->where('id', self::ORDER)->value('shipping_status'));

        $this->postJson('/api/webhooks/shiprocket', ['awb' => 'AWB123456', 'current_status' => 'Delivered'], ['x-api-key' => 'my-webhook-token'])->assertOk();
        $this->assertSame('Delivered', DB::table('orders')->where('id', self::ORDER)->value('shipping_status'));
        $this->assertStringContainsString('Courier status: Delivered', DB::table('order_events')->where('order_id', self::ORDER)->value('message'));
    }

    public function test_the_product_page_delivery_check_uses_shiprocket_and_is_cached(): void
    {
        $this->getJson('/api/delivery-check?pincode=12', ['X-Requested-With' => 'XMLHttpRequest'])->assertStatus(422);
        $this->getJson('/api/delivery-check?pincode=411001', ['X-Requested-With' => 'XMLHttpRequest'])->assertOk()->assertJsonPath('enabled', false);

        $this->connect();
        $this->fakeShiprocket();
        $first = $this->getJson('/api/delivery-check?pincode=411001', ['X-Requested-With' => 'XMLHttpRequest'])->assertOk();
        $first->assertJsonPath('serviceable', true)->assertJsonPath('days', 3)->assertJsonPath('daysMax', 5);
        $this->assertStringNotContainsString('rate', $first->getContent());   // prices are never shown to shoppers

        $calls = count(Http::recorded(fn ($r) => str_contains($r->url(), '/courier/serviceability')));
        $this->getJson('/api/delivery-check?pincode=411001', ['X-Requested-With' => 'XMLHttpRequest'])->assertOk();
        $this->assertSame($calls, count(Http::recorded(fn ($r) => str_contains($r->url(), '/courier/serviceability'))));

        $this->assertTrue(Shiprocket::enabled());
    }

    public function test_tracking_typed_in_by_hand_goes_on_the_order_the_email_and_the_customers_page(): void
    {
        $this->order('cod');
        $mail = [];
        \Illuminate\Support\Facades\Mail::fake();
        $url = '/api/admin/orders/'.self::ORDER;

        // A bad link is refused.
        $this->as('staff', 'POST', $url, ['action' => 'fulfil', 'tracking_url' => 'javascript:alert(1)'])->assertStatus(422);
        $this->assertSame('unfulfilled', DB::table('orders')->where('id', self::ORDER)->value('fulfillment_status'));

        $this->as('staff', 'POST', $url, ['action' => 'fulfil', 'tracking_id' => 'EE123456789IN', 'tracking_url' => 'https://www.indiapost.gov.in/track?id=EE123456789IN', 'courier' => 'India Post'])->assertOk();
        $o = DB::table('orders')->where('id', self::ORDER)->first();
        $this->assertSame('fulfilled', $o->fulfillment_status);
        $this->assertSame('EE123456789IN', $o->awb_code);
        $this->assertSame('India Post', $o->courier_name);
        $this->assertStringContainsString('tracking ID EE123456789IN', DB::table('order_events')->where('order_id', self::ORDER)->pluck('message')->implode(' | '));

        // The shipped e-mail carries the ID and the link, and the customer's order view shows them.
        $html = \App\Support\Mail\Mailer::render(\App\Support\Mail\EmailTemplates::find('order_shipped'), \App\Support\Mail\MailVars::order($o))['html'];
        $this->assertStringContainsString('EE123456789IN', $html);
        $this->assertStringContainsString('https://www.indiapost.gov.in/track?id=EE123456789IN', $html);
        $view = \App\Support\OrderService::present($o);
        $this->assertSame('EE123456789IN', $view['delivery']['awb']);
        $this->assertSame('India Post', $view['delivery']['courier']);

        // It can be corrected later, and with only a link (no ID).
        $this->as('staff', 'POST', $url, ['action' => 'set_tracking'])->assertStatus(422);
        $this->as('staff', 'POST', $url, ['action' => 'set_tracking', 'tracking_id' => '', 'tracking_url' => 'https://track.example.com/abc', 'courier' => 'Local courier'])->assertOk();
        $o = DB::table('orders')->where('id', self::ORDER)->first();
        $this->assertNull($o->awb_code);
        $this->assertSame('https://track.example.com/abc', \App\Support\OrderService::present($o)['delivery']['trackingUrl']);
        $html = \App\Support\Mail\Mailer::render(\App\Support\Mail\EmailTemplates::find('order_shipped'), \App\Support\Mail\MailVars::order($o))['html'];
        $this->assertStringContainsString('Track your parcel', $html);
        $this->assertStringNotContainsString('Tracking ID', $html);
    }

    public function test_the_shipped_email_carries_the_courier_and_tracking_number(): void
    {
        $this->order('cod');
        DB::table('orders')->where('id', self::ORDER)->update(['courier_name' => 'Delhivery', 'awb_code' => 'AWB123456', 'tracking_url' => 'https://shiprocket.co/tracking/AWB123456']);
        $order = DB::table('orders')->where('id', self::ORDER)->first();
        $r = \App\Support\Mail\Mailer::render(\App\Support\Mail\EmailTemplates::find('order_shipped'), \App\Support\Mail\MailVars::order($order));
        $this->assertStringContainsString('AWB123456', $r['html']);
        $this->assertStringContainsString('Track your parcel', $r['html']);

        // The customer's own view of the order carries the tracking details, and the shipping charge stays a number.
        $view = \App\Support\OrderService::present($order);
        $this->assertSame('AWB123456', $view['delivery']['awb']);
        $this->assertSame(150.0, (float) ($view['shipping'] + $view['codFee']));

        // Before a courier is booked the line simply is not there.
        DB::table('orders')->where('id', self::ORDER)->update(['awb_code' => null, 'tracking_url' => null]);
        $plain = \App\Support\Mail\Mailer::render(\App\Support\Mail\EmailTemplates::find('order_shipped'), \App\Support\Mail\MailVars::order(DB::table('orders')->where('id', self::ORDER)->first()));
        $this->assertStringNotContainsString('Track your parcel', $plain['html']);
    }
}
