<?php

namespace Tests\Feature;

use App\Support\AdminAuth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** "Send e-mail again" on the admin order page: only e-mails that fit the order's status, written to the timeline. */
class OrderEmailResendTest extends TestCase
{
    use RefreshDatabase;

    private const ORDER = '94000000-0000-0000-0000-000000000001';

    protected function setUp(): void
    {
        parent::setUp();
        $now = now()->format('Y-m-d H:i:s');
        DB::table('admin_users')->insert(['id' => '94000000-0000-0000-0000-0000000000a1', 'email' => 'owner@example.com', 'password_hash' => AdminAuth::hashPassword('x-super-password'), 'role' => 'super', 'active' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('admin_sessions')->insert(['id' => '94000000-0000-0000-0000-0000000000a2', 'admin_id' => '94000000-0000-0000-0000-0000000000a1', 'token_hash' => hash('sha256', 'boss'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);
        DB::table('orders')->insert([
            'id' => self::ORDER, 'number' => 1700, 'access_token' => 'tok', 'name' => 'Asha', 'email' => 'asha@example.com', 'phone' => '9876543210',
            'status' => 'open', 'payment_status' => 'pending', 'payment_method' => 'cod', 'fulfillment_status' => 'unfulfilled', 'subtotal' => 1500, 'total' => 1500, 'shipping_address' => '{}',
        ]);
    }

    private function resend(string $template)
    {
        return $this->call('POST', '/api/admin/orders/'.self::ORDER, ['action' => 'resend_email', 'template' => $template], [config('shop.session_cookie') => 'boss'], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json']);
    }

    public function test_an_email_can_be_sent_again_only_when_it_fits_the_status(): void
    {
        $this->resend('order_placed')->assertOk();
        $this->assertTrue(DB::table('order_events')->where('order_id', self::ORDER)->where('message', 'E-mail sent again to the customer: Order confirmation')->exists());

        $this->resend('payment_received')->assertStatus(422);
        $this->resend('order_shipped')->assertStatus(422);
        $this->resend('order_refunded')->assertStatus(422);

        DB::table('orders')->where('id', self::ORDER)->update(['payment_status' => 'paid', 'fulfillment_status' => 'fulfilled']);
        $this->resend('payment_received')->assertOk();
        $this->resend('order_shipped')->assertOk();

        DB::table('orders')->where('id', self::ORDER)->update(['payment_status' => 'refunded']);
        DB::table('order_events')->insert(['id' => '94000000-0000-0000-0000-0000000000b1', 'order_id' => self::ORDER, 'message' => 'Refund recorded by the store (Rs 1,200.00)']);
        $this->resend('order_refunded')->assertOk();

        DB::table('orders')->where('id', self::ORDER)->update(['status' => 'cancelled']);
        $this->resend('order_cancelled')->assertOk();
        $this->resend('order_shipped')->assertStatus(422);   // a cancelled order was not shipped
    }
}
