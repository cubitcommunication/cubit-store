<?php

namespace Tests\Feature;

use App\Support\Mail\Mailer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The brand logo set in Store details replaces the store-name text at the top of e-mails. */
class EmailLogoTest extends TestCase
{
    use RefreshDatabase;

    private function html(): string
    {
        return Mailer::render(['subject' => 'Hello', 'body' => 'Thanks for your order.'], [])['html'];
    }

    private function setLogo(string $value): void
    {
        DB::table('site_settings')->updateOrInsert(['key' => 'brand_logo_url'], ['id' => '81000000-0000-0000-0000-000000000001', 'value' => $value, 'group_name' => 'brand', 'label' => 'Brand logo', 'help' => '', 'multiline' => 0, 'sort_order' => 300]);
    }

    public function test_the_store_name_is_shown_until_a_logo_is_set(): void
    {
        $this->assertStringContainsString('>'.\App\Support\Brand::name().'</span>', $this->html());
        $this->assertStringNotContainsString('<img', $this->html());
    }

    public function test_an_uploaded_logo_is_used_with_a_full_web_address(): void
    {
        $this->setLogo('/api/public/img/library/logo-abc123.png');
        $html = $this->html();
        $this->assertStringContainsString('<img src="'.config('shop.site_url').'/api/public/img/library/logo-abc123.png"', $html);
        $this->assertStringNotContainsString('>'.\App\Support\Brand::name().'</span>', $html);
    }

    public function test_a_setting_cleared_in_the_admin_is_saved_as_empty_text(): void
    {
        $adminId = '50000000-0000-0000-0000-000000000041';
        DB::table('admin_users')->insert(['id' => $adminId, 'email' => 'c@b.co', 'password_hash' => 'x']);
        DB::table('admin_sessions')->insert(['id' => '50000000-0000-0000-0000-000000000042', 'admin_id' => $adminId, 'token_hash' => hash('sha256', 'clear-token'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);
        $this->setLogo('/api/public/img/library/logo-abc123.png');

        $update = ['table' => 'site_settings', 'action' => 'update', 'fields' => '*', 'filters' => [['op' => 'eq', 'col' => 'key', 'value' => 'brand_logo_url']], 'orders' => [], 'returning' => false, 'count' => false, 'head' => false, 'values' => ['value' => '']];
        $res = $this->call('POST', '/api/query', [], [config('shop.session_cookie') => 'clear-token'], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], json_encode($update));

        $res->assertOk()->assertJsonPath('error', null);
        $this->assertSame('', DB::table('site_settings')->where('key', 'brand_logo_url')->value('value'));
        $this->assertStringNotContainsString('<img', $this->html());
    }

    public function test_svg_or_odd_values_fall_back_to_the_store_name(): void
    {
        foreach (['/api/public/img/library/logo.svg', 'javascript:alert(1)', '/elsewhere/logo.png" onerror="x'] as $bad) {
            $this->setLogo($bad);
            $this->assertStringNotContainsString('<img', $this->html(), $bad);
        }
    }
}
