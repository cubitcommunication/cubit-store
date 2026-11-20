<?php

namespace Tests\Feature;

use App\Support\AdminAuth;
use App\Support\Mail\SmtpAccounts;
use App\Support\Secrets;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Razorpay keys and mail servers are entered in the admin by the main administrator only, and are stored encrypted. */
class SecretsAndSmtpTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $now = now()->format('Y-m-d H:i:s');
        DB::table('admin_users')->insert([
            ['id' => '70000000-0000-0000-0000-000000000001', 'email' => 'owner@example.com', 'password_hash' => AdminAuth::hashPassword('x-super-password'), 'role' => 'super', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['id' => '70000000-0000-0000-0000-000000000002', 'email' => 'staff@example.com', 'password_hash' => AdminAuth::hashPassword('x-staff-password'), 'role' => 'admin', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
        ]);
        DB::table('admin_sessions')->insert([
            ['id' => '71000000-0000-0000-0000-000000000001', 'admin_id' => '70000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'boss'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')],
            ['id' => '71000000-0000-0000-0000-000000000002', 'admin_id' => '70000000-0000-0000-0000-000000000002', 'token_hash' => hash('sha256', 'staff'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')],
        ]);
        Secrets::forget();
    }

    private function as(string $token, string $method, string $uri, array $params = [])
    {
        return $this->call($method, $uri, $params, [config('shop.session_cookie') => $token], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json']);
    }

    private function query(string $token, array $d)
    {
        return $this->call('POST', '/api/query', [], [config('shop.session_cookie') => $token], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], json_encode($d));
    }

    public function test_other_admins_cannot_reach_integrations_payment_keys_or_mail_servers(): void
    {
        foreach ([['GET', '/api/admin/integrations/status'], ['POST', '/api/admin/integrations/test-razorpay'], ['POST', '/api/admin/integrations/secrets'], ['GET', '/api/admin/smtp'], ['POST', '/api/admin/smtp'], ['POST', '/api/admin/smtp/assign']] as [$m, $u]) {
            $this->as('staff', $m, $u)->assertStatus(403);
        }
        $this->as('boss', 'GET', '/api/admin/smtp')->assertOk();
    }

    public function test_razorpay_keys_are_saved_encrypted_used_for_payments_and_never_sent_back(): void
    {
        $this->as('boss', 'POST', '/api/admin/integrations/secrets', ['razorpay_key_id' => 'not-a-key'])->assertStatus(422);
        $this->as('boss', 'POST', '/api/admin/integrations/secrets', [
            'razorpay_key_id' => 'rzp_test_AbCdEf123456', 'razorpay_key_secret' => 'my-razorpay-secret-1', 'razorpay_webhook_secret' => 'my-webhook-secret-1',
        ])->assertOk();

        // Stored as cipher text, not as the typed value.
        $stored = DB::table('secure_settings')->pluck('value', 'key');
        $this->assertNotSame('my-razorpay-secret-1', $stored['razorpay_key_secret']);
        $this->assertStringNotContainsString('my-razorpay-secret-1', json_encode($stored));
        $this->assertSame('my-razorpay-secret-1', Secrets::razorpay()['key_secret']);

        // The status shows that keys exist (and the public key ID), never a secret.
        $res = $this->as('boss', 'GET', '/api/admin/integrations/status')->assertOk();
        $res->assertJsonPath('razorpay.keyIdValue', 'rzp_test_AbCdEf123456')->assertJsonPath('razorpay.secret', true)->assertJsonPath('razorpay.webhookSecret', true)->assertJsonPath('razorpay.secretSource', 'admin');
        $this->assertStringNotContainsString('my-razorpay-secret-1', $res->getContent());
        $this->assertStringNotContainsString('my-webhook-secret-1', $res->getContent());

        // The saved keys are what payments use.
        Http::fake(['api.razorpay.com/*' => Http::response(['items' => []], 200)]);
        $this->as('boss', 'POST', '/api/admin/integrations/test-razorpay')->assertOk()->assertJsonPath('ok', true);
        Http::assertSent(fn ($r) => str_contains($r->header('Authorization')[0] ?? '', base64_encode('rzp_test_AbCdEf123456:my-razorpay-secret-1')));

        // An empty field leaves a saved value alone; "clear" removes it.
        $this->as('boss', 'POST', '/api/admin/integrations/secrets', ['razorpay_key_secret' => ''])->assertOk();
        $this->assertSame('my-razorpay-secret-1', Secrets::razorpay()['key_secret']);
        $this->as('boss', 'POST', '/api/admin/integrations/secrets', ['clear' => ['razorpay_key_secret']])->assertOk();
        $this->assertSame('', Secrets::razorpay()['key_secret']);

        // The activity log shows the change but never a secret.
        $logged = DB::table('admin_activity')->where('area', 'integrations')->pluck('details')->implode(' ');
        $this->assertStringNotContainsString('my-razorpay-secret-1', $logged);
        $this->assertStringNotContainsString('my-webhook-secret-1', $logged);
    }

    public function test_mail_accounts_are_managed_by_the_main_admin_and_passwords_stay_encrypted(): void
    {
        $bad = ['name' => 'Orders', 'host' => 'smtp hostinger', 'port' => 465, 'security' => 'ssl', 'from_email' => 'orders@example.com'];
        $this->as('boss', 'POST', '/api/admin/smtp', $bad)->assertStatus(422);

        $id = $this->as('boss', 'POST', '/api/admin/smtp', [
            'name' => 'Orders', 'host' => 'smtp.hostinger.com', 'port' => 465, 'security' => 'ssl', 'username' => 'orders@example.com',
            'password' => 'mailbox-password-1', 'from_email' => 'Orders@Example.com', 'from_name' => 'Your Store Orders',
        ])->assertOk()->json('id');
        $second = $this->as('boss', 'POST', '/api/admin/smtp', ['name' => 'Support', 'host' => 'smtp.hostinger.com', 'port' => 587, 'security' => 'tls', 'password' => 'support-password-1', 'from_email' => 'support@example.com'])->assertOk()->json('id');

        $row = DB::table('smtp_accounts')->where('id', $id)->first();
        $this->assertSame('orders@example.com', $row->from_email);
        $this->assertNotSame('mailbox-password-1', $row->password);
        $this->assertSame('mailbox-password-1', SmtpAccounts::password($row));
        $this->assertSame($id, SmtpAccounts::default()->id);   // the first one is the default

        $list = $this->as('boss', 'GET', '/api/admin/smtp')->assertOk();
        $this->assertStringNotContainsString('mailbox-password-1', $list->getContent());
        $this->assertStringNotContainsString('support-password-1', $list->getContent());
        $list->assertJsonPath('accounts.0.hasPassword', true);

        // Leaving the password empty keeps it; one email can use a different account; the default can move.
        $this->as('boss', 'POST', '/api/admin/smtp/'.$id, ['name' => 'Orders mailbox', 'host' => 'smtp.hostinger.com', 'port' => 465, 'security' => 'ssl', 'from_email' => 'orders@example.com'])->assertOk();
        $this->assertSame('mailbox-password-1', SmtpAccounts::password(SmtpAccounts::find($id)));
        $this->as('boss', 'POST', '/api/admin/smtp/assign', ['template' => 'order_placed', 'account' => $second])->assertOk();
        \App\Support\Mail\MailSettings::forget();
        $this->assertSame($second, SmtpAccounts::forTemplate('order_placed')->id);
        $this->assertSame($id, SmtpAccounts::forTemplate('order_shipped')->id);
        $this->as('boss', 'POST', '/api/admin/smtp/'.$second.'/default')->assertOk();
        $this->assertSame($second, SmtpAccounts::default()->id);

        // Deleting the default hands the role on, and e-mails that used it fall back to the default.
        $this->as('boss', 'POST', '/api/admin/smtp/'.$second.'/delete')->assertOk();
        \App\Support\Mail\MailSettings::forget();
        $this->assertSame($id, SmtpAccounts::default()->id);
        $this->assertSame($id, SmtpAccounts::forTemplate('order_placed')->id);
    }

    public function test_only_the_main_admin_can_change_integration_settings_through_the_data_api(): void
    {
        $change = fn (string $key, string $value) => ['table' => 'site_settings', 'action' => 'update', 'fields' => '*', 'filters' => [['op' => 'eq', 'col' => 'key', 'value' => $key]], 'orders' => [], 'returning' => false, 'count' => false, 'head' => false, 'values' => ['value' => $value]];

        $this->query('staff', $change('ga4_measurement_id', 'G-HACKED0001'))->assertJsonPath('error.message', 'Only the main administrator can change integrations.');
        $this->assertNotSame('G-HACKED0001', DB::table('site_settings')->where('key', 'ga4_measurement_id')->value('value'));

        $this->query('boss', $change('ga4_measurement_id', 'G-MAINADMIN1'))->assertJsonPath('error', null);
        $this->assertSame('G-MAINADMIN1', DB::table('site_settings')->where('key', 'ga4_measurement_id')->value('value'));

        // Everything else stays open to every admin.
        $this->query('staff', $change('phone_e164', '919999999999'))->assertJsonPath('error', null);
    }

    public function test_the_env_values_still_work_until_something_is_saved_in_the_admin(): void
    {
        config(['services.razorpay.key_id' => 'rzp_live_FromEnv123456', 'services.razorpay.key_secret' => 'env-secret-value']);
        Secrets::forget();
        $this->assertSame('rzp_live_FromEnv123456', Secrets::razorpay()['key_id']);
        $this->assertSame('env', Secrets::source(Secrets::RAZORPAY_KEY_ID));

        Secrets::set(Secrets::RAZORPAY_KEY_ID, 'rzp_live_FromAdmin1234');
        $this->assertSame('rzp_live_FromAdmin1234', Secrets::razorpay()['key_id']);
        $this->assertSame('admin', Secrets::source(Secrets::RAZORPAY_KEY_ID));
        Secrets::clear(Secrets::RAZORPAY_KEY_ID);
        $this->assertSame('rzp_live_FromEnv123456', Secrets::razorpay()['key_id']);
    }
}
