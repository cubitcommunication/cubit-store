<?php

namespace Tests\Feature;

use App\Support\Commerce;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** reCAPTCHA protection, the Meta Pixel / verification tags, "Analytics through Tag Manager" and the admin status. */
class IntegrationsTest extends TestCase
{
    use RefreshDatabase;

    private array $h = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];
    private const KEY = '6LcABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab';

    private function set(string $key, string $value): void
    {
        DB::table('site_settings')->where('key', $key)->update(['value' => $value]);
        Commerce::forget();
    }

    private function page(): string
    {
        $html = '';
        $this->withAppShell(function () use (&$html) {
            $html = $this->get('https://example.com/')->getContent();
        });

        return $html;
    }

    /** A brand-new fake each time: Laravel keeps the first matching fake, so old ones must be dropped. */
    private function fake(string $host, array $body, int $status = 200): void
    {
        Http::clearResolvedInstance(\Illuminate\Http\Client\Factory::class);
        app()->forgetInstance(\Illuminate\Http\Client\Factory::class);
        Http::fake([$host => Http::response($body, $status)]);
    }

    private function adminCookie(): string
    {
        if (DB::table('admin_users')->exists()) {
            return 'tok';
        }
        DB::table('admin_users')->insert(['id' => '50000000-0000-0000-0000-000000000001', 'email' => 'owner@example.com', 'password_hash' => 'x', 'role' => 'super']);
        DB::table('admin_sessions')->insert(['id' => '50000000-0000-0000-0000-000000000002', 'admin_id' => '50000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'tok'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);

        return 'tok';
    }

    private function asAdmin(string $method, string $uri)
    {
        return $this->call($method, $uri, [], [config('shop.session_cookie') => $this->adminCookie()], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json']);
    }

    /* ------------------------------------------------------------------ tags */

    public function test_the_meta_pixel_and_search_console_codes_are_added_only_when_valid(): void
    {
        $this->set('meta_pixel_id', '123456789012345');
        $this->set('google_site_verification', 'abcdEFGH1234abcdEFGH1234abcdEFGH1234abc');
        $this->set('bing_site_verification', 'ABCDEF0123456789ABCDEF0123456789');
        $html = $this->page();
        $this->assertStringContainsString("fbq('init','123456789012345')", $html);
        $this->assertStringContainsString('facebook.com/tr?id=123456789012345', $html);
        $this->assertStringContainsString('<meta name="google-site-verification" content="abcdEFGH1234abcdEFGH1234abcdEFGH1234abc">', $html);
        $this->assertStringContainsString('<meta name="msvalidate.01" content="ABCDEF0123456789ABCDEF0123456789">', $html);

        $this->set('meta_pixel_id', "1');alert(1);//");
        $this->set('google_site_verification', '"><script>alert(2)</script>');
        $html = $this->page();
        $this->assertStringNotContainsString('alert(', $html);
        $this->assertStringNotContainsString('fbq', $html);
        $this->assertStringNotContainsString('google-site-verification', $html);
    }

    public function test_analytics_can_run_through_tag_manager_so_visits_are_never_counted_twice(): void
    {
        $this->set('ga4_mode', 'gtm');
        $html = $this->page();
        $this->assertStringContainsString("'dataLayer','GTM-NM967FPR'", $html);         // the container loads
        $this->assertStringNotContainsString('gtag/js', $html);                          // but no second, direct Analytics
        $this->assertStringContainsString('window.dataLayer=window.dataLayer||[]', $html); // the shop's events still have a dataLayer

        $this->set('ga4_mode', 'direct');
        $this->assertStringContainsString('gtag/js?id=G-4CE5N44PGB', $this->page());
    }

    /* ------------------------------------------------------------- reCAPTCHA */

    private function turnOnRecaptcha(): void
    {
        config(['services.recaptcha.secret' => 'test-secret']);
        $this->set('recaptcha_site_key', self::KEY);
    }

    public function test_nothing_is_checked_until_both_keys_exist(): void
    {
        $this->post('/api/newsletter', ['email' => 'a@b.co'], $this->h)->assertOk();            // no keys at all

        $this->set('recaptcha_site_key', self::KEY);                                              // site key only
        $this->post('/api/newsletter', ['email' => 'b@b.co'], $this->h)->assertOk();

        config(['services.recaptcha.secret' => 'test-secret']);                                   // secret only
        $this->set('recaptcha_site_key', '');
        $this->post('/api/newsletter', ['email' => 'c@b.co'], $this->h)->assertOk();
    }

    public function test_a_missing_token_a_low_score_and_a_wrong_action_are_refused(): void
    {
        $this->turnOnRecaptcha();
        $this->postJson('/api/newsletter', ['email' => 'a@b.co'], $this->h)->assertStatus(422);   // no token

        $this->fake('www.google.com/*', ['success' => true, 'score' => 0.1, 'action' => 'newsletter']);
        $this->postJson('/api/newsletter', ['email' => 'a@b.co'], $this->h + ['X-Recaptcha-Token' => 't'])->assertStatus(422);

        $this->fake('www.google.com/*', ['success' => true, 'score' => 0.9, 'action' => 'register']);
        $this->postJson('/api/newsletter', ['email' => 'a@b.co'], $this->h + ['X-Recaptcha-Token' => 't'])->assertStatus(422);

        $this->fake('www.google.com/*', ['success' => false]);
        $this->postJson('/api/newsletter', ['email' => 'a@b.co'], $this->h + ['X-Recaptcha-Token' => 't'])->assertStatus(422);
        $this->assertSame(0, DB::table('newsletter_subscribers')->count());
    }

    public function test_a_good_score_passes_and_checkout_is_more_lenient_than_sign_up(): void
    {
        $this->turnOnRecaptcha();
        $this->fake('www.google.com/*', ['success' => true, 'score' => 0.9, 'action' => 'newsletter']);
        $this->postJson('/api/newsletter', ['email' => 'a@b.co'], $this->h + ['X-Recaptcha-Token' => 'good'])->assertOk();
        Http::assertSent(fn ($r) => $r['secret'] === 'test-secret' && $r['response'] === 'good');

        // Score 0.4: below the sign-up bar (0.5), above the checkout bar (0.3).
        $this->fake('www.google.com/*', ['success' => true, 'score' => 0.4, 'action' => 'register']);
        $this->postJson('/api/account/register', ['name' => 'A', 'email' => 'a@b.co', 'password' => 'password123'], $this->h + ['X-Recaptcha-Token' => 't'])->assertStatus(422);
        $this->fake('www.google.com/*', ['success' => true, 'score' => 0.4, 'action' => 'checkout']);
        $res = $this->postJson('/api/checkout', [], $this->h + ['X-Recaptcha-Token' => 't']);
        $this->assertStringNotContainsString('real person', (string) $res->getContent());   // not stopped by reCAPTCHA (it fails later, on the empty order)
    }

    public function test_a_google_outage_never_blocks_a_customer(): void
    {
        $this->turnOnRecaptcha();
        $this->fake('www.google.com/*', [], 503);
        $this->postJson('/api/newsletter', ['email' => 'a@b.co'], $this->h + ['X-Recaptcha-Token' => 't'])->assertOk();
    }

    /* ----------------------------------------------------------- admin status */

    public function test_the_status_page_is_admin_only_and_never_shows_a_secret(): void
    {
        $this->getJson('/api/admin/integrations/status', $this->h)->assertStatus(401);

        config(['services.razorpay.key_id' => 'rzp_test_abc123', 'services.razorpay.key_secret' => 'super-secret-value', 'services.recaptcha.secret' => 'recaptcha-secret']);
        $res = $this->asAdmin('GET', '/api/admin/integrations/status')->assertOk();
        $res->assertJsonPath('razorpay.keyId', true)->assertJsonPath('razorpay.secret', true)->assertJsonPath('razorpay.mode', 'test')
            ->assertJsonPath('tracking.ga4', 'G-4CE5N44PGB')->assertJsonPath('tracking.gtm', 'GTM-NM967FPR')->assertJsonPath('recaptcha.secret', true);
        $this->assertStringNotContainsString('super-secret-value', $res->getContent());
        $this->assertStringNotContainsString('recaptcha-secret', $res->getContent());
        // The key ID is public (the browser receives it at checkout), so it may be shown; the secrets never are.
        $res->assertJsonPath('razorpay.keyIdValue', 'rzp_test_abc123');
    }

    public function test_the_razorpay_connection_test_tells_good_keys_from_bad_ones(): void
    {
        $this->asAdmin('POST', '/api/admin/integrations/test-razorpay')->assertOk()->assertJsonPath('ok', false);   // no keys yet

        config(['services.razorpay.key_id' => 'rzp_test_abc123', 'services.razorpay.key_secret' => 'secret']);
        $this->fake('api.razorpay.com/*', ['entity' => 'collection', 'items' => []]);
        $this->asAdmin('POST', '/api/admin/integrations/test-razorpay')->assertJsonPath('ok', true);

        $this->fake('api.razorpay.com/*', ['error' => ['description' => 'Authentication failed']], 401);
        $this->asAdmin('POST', '/api/admin/integrations/test-razorpay')->assertJsonPath('ok', false);
    }

    /* ---------------------------------------------------------------- webhook */

    private function webhookOrder(array $over = []): string
    {
        $id = (string) \Illuminate\Support\Str::uuid();
        DB::table('orders')->insert(array_merge([
            'id' => $id, 'number' => 1001, 'access_token' => 'tok', 'name' => 'A', 'email' => 'a@example.com', 'phone' => '9999999999',
            'payment_method' => 'razorpay', 'payment_status' => 'pending', 'total' => 1500.50, 'shipping_address' => '{}',
            'razorpay_order_id' => 'order_ABC',
        ], $over));

        return $id;
    }

    private function hook(array $event, ?string $sign = null)
    {
        $body = json_encode($event);
        $sig = $sign ?? hash_hmac('sha256', $body, 'whsec');

        return $this->call('POST', '/api/webhooks/razorpay', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_RAZORPAY_SIGNATURE' => $sig], $body);
    }

    private function paymentEvent(string $event, array $payment = []): array
    {
        return ['event' => $event, 'payload' => ['payment' => ['entity' => array_merge(['id' => 'pay_1', 'order_id' => 'order_ABC', 'amount' => 150050], $payment)]]];
    }

    public function test_the_webhook_refuses_calls_that_are_not_signed_by_razorpay(): void
    {
        $id = $this->webhookOrder();
        $this->hook($this->paymentEvent('payment.captured'))->assertStatus(503);   // no secret on the server yet

        config(['services.razorpay.webhook_secret' => 'whsec']);
        $this->hook($this->paymentEvent('payment.captured'), 'forged')->assertStatus(400);
        $this->call('POST', '/api/webhooks/razorpay', [], [], [], ['CONTENT_TYPE' => 'application/json'], '{}')->assertStatus(400);
        $this->assertSame('pending', DB::table('orders')->where('id', $id)->value('payment_status'));
    }

    public function test_a_captured_payment_marks_the_order_paid_once(): void
    {
        config(['services.razorpay.webhook_secret' => 'whsec']);
        $id = $this->webhookOrder();

        $this->hook($this->paymentEvent('payment.captured'))->assertOk()->assertJsonPath('result', 'marked paid');
        $this->assertSame('paid', DB::table('orders')->where('id', $id)->value('payment_status'));
        $this->assertSame('pay_1', DB::table('orders')->where('id', $id)->value('razorpay_payment_id'));

        $this->hook($this->paymentEvent('payment.captured'))->assertOk()->assertJsonPath('result', 'already paid');
        $this->assertSame(1, DB::table('order_events')->where('order_id', $id)->count());
    }

    public function test_a_wrong_amount_a_cancelled_order_and_an_unknown_order_never_become_paid(): void
    {
        config(['services.razorpay.webhook_secret' => 'whsec']);
        $a = $this->webhookOrder();
        $this->hook($this->paymentEvent('payment.captured', ['amount' => 100]))->assertJsonPath('result', 'amount mismatch');
        $this->assertSame('pending', DB::table('orders')->where('id', $a)->value('payment_status'));

        DB::table('orders')->where('id', $a)->update(['status' => 'cancelled']);
        $this->hook($this->paymentEvent('payment.captured'))->assertJsonPath('result', 'cancelled order');
        $this->assertSame('pending', DB::table('orders')->where('id', $a)->value('payment_status'));

        $this->hook($this->paymentEvent('payment.captured', ['order_id' => 'order_NOPE']))->assertOk()->assertJsonPath('result', 'ignored: no matching order');
    }

    public function test_a_failed_payment_never_undoes_a_paid_order_and_a_refund_is_recorded(): void
    {
        config(['services.razorpay.webhook_secret' => 'whsec']);
        $id = $this->webhookOrder();

        $this->hook($this->paymentEvent('payment.failed', ['error_description' => 'Card declined']))->assertJsonPath('result', 'marked failed');
        $this->assertSame('failed', DB::table('orders')->where('id', $id)->value('payment_status'));

        $this->hook($this->paymentEvent('payment.captured'))->assertJsonPath('result', 'marked paid');   // customer retried
        $this->hook($this->paymentEvent('payment.failed'))->assertJsonPath('result', 'ignored: already settled');
        $this->assertSame('paid', DB::table('orders')->where('id', $id)->value('payment_status'));

        $this->hook($this->paymentEvent('refund.processed', ['amount_refunded' => 50000]))->assertJsonPath('result', 'partial refund noted');
        $this->assertSame('paid', DB::table('orders')->where('id', $id)->value('payment_status'));
        $this->hook($this->paymentEvent('refund.processed', ['amount_refunded' => 150050]))->assertJsonPath('result', 'marked refunded');
        $this->assertSame('refunded', DB::table('orders')->where('id', $id)->value('payment_status'));
    }

    public function test_the_status_page_reports_the_webhook_without_revealing_its_secret(): void
    {
        config(['services.razorpay.webhook_secret' => 'whsec-private']);
        $res = $this->asAdmin('GET', '/api/admin/integrations/status')->assertOk()->assertJsonPath('razorpay.webhookSecret', true);
        $this->assertStringNotContainsString('whsec-private', $res->getContent());
        $this->assertStringContainsString('/api/webhooks/razorpay', (string) $res->json('razorpay.webhookUrl'));
    }
}
