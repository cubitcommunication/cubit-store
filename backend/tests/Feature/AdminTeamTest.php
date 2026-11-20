<?php

namespace Tests\Feature;

use App\Support\AdminAuth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Several admins, one main administrator who cannot be removed, and a log of everything done. */
class AdminTeamTest extends TestCase
{
    use RefreshDatabase;

    private const SUPER = '60000000-0000-0000-0000-000000000001';
    private const STAFF = '60000000-0000-0000-0000-000000000002';

    protected function setUp(): void
    {
        parent::setUp();
        $now = now()->format('Y-m-d H:i:s');
        DB::table('admin_users')->insert([
            ['id' => self::SUPER, 'email' => 'owner@example.com', 'name' => 'Owner', 'password_hash' => AdminAuth::hashPassword('super-password-1'), 'role' => 'admin', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::STAFF, 'email' => 'staff@example.com', 'name' => 'Staff', 'password_hash' => AdminAuth::hashPassword('staff-password-1'), 'role' => 'admin', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
        ]);
        DB::table('admin_sessions')->insert([
            ['id' => '61000000-0000-0000-0000-000000000001', 'admin_id' => self::SUPER, 'token_hash' => hash('sha256', 'super-token'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')],
            ['id' => '61000000-0000-0000-0000-000000000002', 'admin_id' => self::STAFF, 'token_hash' => hash('sha256', 'staff-token'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')],
        ]);
    }

    private function as(string $token, string $method, string $uri, array $params = [])
    {
        return $this->call($method, $uri, $params, [config('shop.session_cookie') => $token], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json']);
    }

    public function test_priyam_is_the_super_admin_even_if_the_stored_role_says_admin(): void
    {
        $this->as('super-token', 'GET', '/api/auth/session')->assertJsonPath('role', 'super')->assertJsonPath('email', 'owner@example.com');
        $this->as('staff-token', 'GET', '/api/auth/session')->assertJsonPath('role', 'admin');
    }

    public function test_only_the_super_admin_can_see_or_manage_the_team_and_the_log(): void
    {
        $this->as('staff-token', 'GET', '/api/admin/users')->assertStatus(403);
        $this->as('staff-token', 'GET', '/api/admin/activity')->assertStatus(403);
        $this->as('staff-token', 'POST', '/api/admin/users', ['name' => 'X', 'email' => 'x@y.co', 'password' => 'long-enough-pass'])->assertStatus(403);
        $this->as('staff-token', 'POST', '/api/admin/users/'.self::SUPER.'/delete')->assertStatus(403);
        $this->getJson('/api/admin/users', ['X-Requested-With' => 'XMLHttpRequest'])->assertStatus(401);

        $list = $this->as('super-token', 'GET', '/api/admin/users')->assertOk()->json('users');
        $this->assertSame('owner@example.com', $list[0]['email']);
        $this->assertSame('super', $list[0]['role']);
    }

    public function test_an_admin_can_be_added_edited_switched_off_and_deleted(): void
    {
        $id = $this->as('super-token', 'POST', '/api/admin/users', ['name' => 'Asha', 'email' => 'Asha@Example.com', 'password' => 'asha-password-1'])->assertOk()->json('id');
        $this->assertSame('asha@example.com', DB::table('admin_users')->where('id', $id)->value('email'));
        $this->assertSame('admin', DB::table('admin_users')->where('id', $id)->value('role'));

        // Weak passwords and duplicate e-mails are refused.
        $this->as('super-token', 'POST', '/api/admin/users', ['name' => 'B', 'email' => 'b@example.com', 'password' => 'short'])->assertStatus(422);
        $this->as('super-token', 'POST', '/api/admin/users', ['name' => 'Asha 2', 'email' => 'asha@example.com', 'password' => 'asha-password-2'])->assertStatus(422);

        // She can sign in, and is signed out the moment she is switched off.
        $this->postJson('/api/auth/sign-in', ['email' => 'asha@example.com', 'password' => 'asha-password-1'], ['X-Requested-With' => 'XMLHttpRequest'])->assertJsonPath('ok', true);
        $this->assertNotNull(DB::table('admin_users')->where('id', $id)->value('last_login_at'));
        $this->as('super-token', 'POST', '/api/admin/users/'.$id, ['name' => 'Asha K', 'active' => false])->assertOk()->assertJsonPath('changed', true);
        $this->postJson('/api/auth/sign-in', ['email' => 'asha@example.com', 'password' => 'asha-password-1'], ['X-Requested-With' => 'XMLHttpRequest'])->assertJsonPath('ok', false);
        $this->assertSame(0, DB::table('admin_sessions')->where('admin_id', $id)->count());

        $this->as('super-token', 'POST', '/api/admin/users/'.$id.'/delete')->assertOk();
        $this->assertSame(0, DB::table('admin_users')->where('id', $id)->count());
    }

    public function test_the_main_administrator_can_never_be_deleted_switched_off_or_renamed_by_email(): void
    {
        $this->as('super-token', 'POST', '/api/admin/users/'.self::SUPER.'/delete')->assertStatus(422)->assertJsonPath('message', 'The main administrator cannot be deleted.');
        $this->as('super-token', 'POST', '/api/admin/users/'.self::SUPER, ['active' => false])->assertStatus(422);
        $this->as('super-token', 'POST', '/api/admin/users/'.self::SUPER, ['email' => 'someone@else.com'])->assertStatus(422);
        $this->assertSame(1, DB::table('admin_users')->where('email', 'owner@example.com')->where('active', 1)->count());
        // The display name may be changed.
        $this->as('super-token', 'POST', '/api/admin/users/'.self::SUPER, ['name' => 'Owner S'])->assertOk();
    }

    public function test_everything_an_admin_does_is_written_to_the_activity_log(): void
    {
        // A failed and a successful sign-in.
        $this->postJson('/api/auth/sign-in', ['email' => 'staff@example.com', 'password' => 'wrong-password'], ['X-Requested-With' => 'XMLHttpRequest'])->assertJsonPath('ok', false);
        $this->postJson('/api/auth/sign-in', ['email' => 'staff@example.com', 'password' => 'staff-password-1'], ['X-Requested-With' => 'XMLHttpRequest'])->assertJsonPath('ok', true);

        // A change made through the data API records the values before and after.
        DB::table('coupons')->insert(['id' => '90000000-0000-0000-0000-000000000009', 'code' => 'LOG10', 'discount_type' => 'percentage', 'value' => 10, 'applies_to' => 'all', 'active' => 1, 'show_on_site' => 0, 'times_used' => 0]);
        $update = ['table' => 'coupons', 'action' => 'update', 'fields' => '*', 'filters' => [['op' => 'eq', 'col' => 'id', 'value' => '90000000-0000-0000-0000-000000000009']], 'orders' => [], 'returning' => false, 'count' => false, 'head' => false, 'values' => ['value' => 25]];
        $this->call('POST', '/api/query', [], [config('shop.session_cookie') => 'staff-token'], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], json_encode($update))->assertOk();

        // A dedicated endpoint (tags).
        $this->as('staff-token', 'POST', '/api/admin/tags/delete', ['tag' => 'nothing'])->assertOk();

        $log = $this->as('super-token', 'GET', '/api/admin/activity')->assertOk()->json();
        $byAction = collect($log['items'])->groupBy('action');
        $this->assertTrue($byAction->has('login_failed'));
        $this->assertTrue($byAction->has('login'));
        $edit = collect($log['items'])->firstWhere('area', 'coupons');
        $this->assertSame('staff@example.com', $edit['email']);
        $this->assertStringContainsString('LOG10', $edit['summary']);
        $this->assertEquals(10, $edit['details']['changes']['value']['from']);
        $this->assertEquals(25, $edit['details']['changes']['value']['to']);
        $this->assertNotEmpty($edit['ip']);
        $this->assertTrue(collect($log['items'])->contains(fn ($i) => $i['area'] === 'tags'));

        // Filters narrow it down, and passwords are never stored.
        $this->assertSame(1, $this->as('super-token', 'GET', '/api/admin/activity', ['action' => 'login_failed'])->json('total'));
        $this->assertSame(0, DB::table('admin_activity')->where('details', 'like', '%wrong-password%')->count());
        $this->assertContains('staff@example.com', $log['filters']['users']);
    }
}
