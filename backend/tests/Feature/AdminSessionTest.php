<?php

namespace Tests\Feature;

use App\Support\AdminAuth;
use App\Support\DeviceLabel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The main administrator can see every signed-in device and sign any of them out. */
class AdminSessionTest extends TestCase
{
    use RefreshDatabase;

    private const SUPER = '91000000-0000-0000-0000-000000000001';
    private const STAFF = '91000000-0000-0000-0000-000000000002';
    private const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    private const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

    protected function setUp(): void
    {
        parent::setUp();
        $now = now()->format('Y-m-d H:i:s');
        DB::table('admin_users')->insert([
            ['id' => self::SUPER, 'email' => 'owner@example.com', 'password_hash' => AdminAuth::hashPassword('x-super-password'), 'role' => 'super', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::STAFF, 'email' => 'staff@example.com', 'password_hash' => AdminAuth::hashPassword('x-staff-password'), 'role' => 'admin', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $exp = now()->addDay()->format('Y-m-d H:i:s');
        DB::table('admin_sessions')->insert([
            ['id' => '92000000-0000-0000-0000-000000000001', 'admin_id' => self::SUPER, 'token_hash' => hash('sha256', 'boss'), 'expires_at' => $exp, 'ip' => '1.1.1.1', 'user_agent' => self::CHROME_WIN, 'last_active_at' => $now],
            ['id' => '92000000-0000-0000-0000-000000000002', 'admin_id' => self::SUPER, 'token_hash' => hash('sha256', 'boss-phone'), 'expires_at' => $exp, 'ip' => '2.2.2.2', 'user_agent' => self::SAFARI_IPHONE, 'last_active_at' => $now],
            ['id' => '92000000-0000-0000-0000-000000000003', 'admin_id' => self::STAFF, 'token_hash' => hash('sha256', 'staff'), 'expires_at' => $exp, 'ip' => '3.3.3.3', 'user_agent' => self::CHROME_WIN, 'last_active_at' => $now],
            ['id' => '92000000-0000-0000-0000-000000000004', 'admin_id' => self::STAFF, 'token_hash' => hash('sha256', 'staff-old'), 'expires_at' => $exp, 'ip' => null, 'user_agent' => null, 'last_active_at' => null],   // signed in before details were recorded
            ['id' => '92000000-0000-0000-0000-000000000005', 'admin_id' => self::STAFF, 'token_hash' => hash('sha256', 'expired'), 'expires_at' => now()->subDay()->format('Y-m-d H:i:s'), 'ip' => null, 'user_agent' => null, 'last_active_at' => null],
        ]);
    }

    private function as(string $token, string $method, string $uri, array $params = [])
    {
        return $this->call($method, $uri, $params, [config('shop.session_cookie') => $token], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'HTTP_USER_AGENT' => self::CHROME_WIN]);
    }

    public function test_devices_are_named_in_plain_words(): void
    {
        $this->assertSame(['device' => 'Chrome on Windows', 'mobile' => false], DeviceLabel::describe(self::CHROME_WIN));
        $this->assertSame(['device' => 'Safari on iPhone', 'mobile' => true], DeviceLabel::describe(self::SAFARI_IPHONE));
        $this->assertSame('Edge on Windows', DeviceLabel::describe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')['device']);
        $this->assertSame('Firefox on Linux', DeviceLabel::describe('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')['device']);
        $this->assertSame('Unknown device', DeviceLabel::describe(null)['device']);
    }

    public function test_only_the_main_admin_can_see_or_end_sessions(): void
    {
        foreach ([['GET', '/api/admin/sessions'], ['POST', '/api/admin/sessions/92000000-0000-0000-0000-000000000001/revoke'], ['POST', '/api/admin/sessions/revoke-others'], ['POST', '/api/admin/sessions/revoke-user']] as [$m, $u]) {
            $this->as('staff', $m, $u, ['admin_id' => self::SUPER])->assertStatus(403);
        }
        $this->assertSame(5, DB::table('admin_sessions')->count());   // nothing was removed
    }

    public function test_the_list_shows_every_active_device_with_who_where_and_this_one(): void
    {
        $list = $this->as('boss', 'GET', '/api/admin/sessions')->assertOk()->json('sessions');
        $this->assertCount(4, $list);   // the expired one is not shown
        $by = collect($list)->keyBy('id');

        $this->assertTrue($by['92000000-0000-0000-0000-000000000001']['current']);
        $this->assertFalse($by['92000000-0000-0000-0000-000000000002']['current']);
        $this->assertSame('Chrome on Windows', $by['92000000-0000-0000-0000-000000000001']['device']);
        $this->assertSame('Safari on iPhone', $by['92000000-0000-0000-0000-000000000002']['device']);
        $this->assertTrue($by['92000000-0000-0000-0000-000000000002']['mobile']);
        $this->assertSame('staff@example.com', $by['92000000-0000-0000-0000-000000000003']['email']);
        $this->assertSame('3.3.3.3', $by['92000000-0000-0000-0000-000000000003']['ip']);
        $this->assertFalse($by['92000000-0000-0000-0000-000000000004']['known']);   // an older sign-in with no details
        $this->assertSame('super', $by['92000000-0000-0000-0000-000000000001']['role']);
        // Nothing secret is sent: no token in the list.
        $this->assertStringNotContainsString('token', json_encode($list));
    }

    public function test_ending_a_session_signs_that_browser_out_at_once(): void
    {
        $this->as('staff', 'GET', '/api/auth/session')->assertJsonPath('email', 'staff@example.com');

        $this->as('boss', 'POST', '/api/admin/sessions/92000000-0000-0000-0000-000000000003/revoke')->assertOk()->assertJsonPath('self', false);
        $this->as('staff', 'GET', '/api/admin/dashboard')->assertStatus(401);
        $this->as('staff', 'GET', '/api/auth/session')->assertJsonPath('email', null);
        $this->as('boss', 'POST', '/api/admin/sessions/92000000-0000-0000-0000-000000000003/revoke')->assertStatus(404);   // already gone

        // The log records who ended which device.
        $this->assertStringContainsString('staff@example.com on Chrome on Windows', DB::table('admin_activity')->where('action', 'session_revoke')->value('summary'));
    }

    public function test_sign_out_of_one_person_or_of_everyone_else(): void
    {
        $this->as('boss', 'POST', '/api/admin/sessions/revoke-user', ['admin_id' => self::STAFF])->assertOk()->assertJsonPath('signedOut', 3);   // including the expired row
        $this->assertSame(0, DB::table('admin_sessions')->where('admin_id', self::STAFF)->count());
        $this->as('staff', 'GET', '/api/admin/dashboard')->assertStatus(401);

        // "Everyone else" keeps the device the main administrator is using.
        $this->as('boss', 'POST', '/api/admin/sessions/revoke-others')->assertOk()->assertJsonPath('signedOut', 1);
        $left = DB::table('admin_sessions')->pluck('id')->all();
        $this->assertSame(['92000000-0000-0000-0000-000000000001'], $left);
        $this->as('boss', 'GET', '/api/auth/session')->assertJsonPath('email', 'owner@example.com');
    }

    public function test_signing_in_records_the_device_and_use_updates_last_active(): void
    {
        $res = $this->withHeader('User-Agent', self::SAFARI_IPHONE)->postJson('/api/auth/sign-in', ['email' => 'staff@example.com', 'password' => 'x-staff-password'], ['X-Requested-With' => 'XMLHttpRequest'])->assertJsonPath('ok', true);
        $row = DB::table('admin_sessions')->where('admin_id', self::STAFF)->where('id', 'not like', '92000000-%')->first(['ip', 'user_agent', 'last_active_at', 'id']);
        $this->assertSame(self::SAFARI_IPHONE, $row->user_agent);
        $this->assertNotEmpty($row->ip);
        $this->assertNotNull($row->last_active_at);

        // Use after a while is noted (at most once a minute).
        DB::table('admin_sessions')->where('id', '92000000-0000-0000-0000-000000000003')->update(['last_active_at' => now()->subMinutes(10)->format('Y-m-d H:i:s')]);
        $this->as('staff', 'GET', '/api/auth/session')->assertOk();
        $this->assertGreaterThan(now()->subMinute()->format('Y-m-d H:i:s'), DB::table('admin_sessions')->where('id', '92000000-0000-0000-0000-000000000003')->value('last_active_at'));
    }
}
