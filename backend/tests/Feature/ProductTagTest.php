<?php

namespace Tests\Feature;

use App\Support\Commerce;
use App\Support\Tags;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Product tags: cleaning, the admin tag endpoints, and discount codes that apply to a tag. */
class ProductTagTest extends TestCase
{
    use RefreshDatabase;

    private array $h = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];
    private const RING = '00000000-0000-0000-0000-000000000001';
    private const CHAIN = '00000000-0000-0000-0000-000000000002';

    protected function setUp(): void
    {
        parent::setUp();
        Commerce::forget();
        foreach ([[self::RING, 'ring', 1000, '["Sale","new"]'], [self::CHAIN, 'chain', 500, '[]']] as [$id, $slug, $price, $tags]) {
            DB::table('products')->insert([
                'id' => $id, 'name' => ucfirst($slug), 'slug' => $slug, 'sku' => strtoupper($slug), 'price' => $price, 'category' => 'Rings', 'material' => 'Brass',
                'stock_quantity' => null, 'occasion' => '[]', 'specifications' => '{}', 'published' => 1, 'tags' => $tags,
            ]);
        }
        foreach (['cart', 'checkout'] as $k) {
            DB::table('site_settings')->where('key', "commerce_{$k}_enabled")->update(['value' => '1']);
        }
        Commerce::forget();
    }

    private function cookies(): array
    {
        $adminId = '50000000-0000-0000-0000-000000000021';
        if (! DB::table('admin_users')->where('id', $adminId)->exists()) {
            DB::table('admin_users')->insert(['id' => $adminId, 'email' => 'tag@b.co', 'password_hash' => 'x']);
            DB::table('admin_sessions')->insert([
                'id' => '50000000-0000-0000-0000-000000000022', 'admin_id' => $adminId, 'token_hash' => hash('sha256', 'tag-token'),
                'expires_at' => now()->addDay()->format('Y-m-d H:i:s'),
            ]);
        }

        return [config('shop.session_cookie') => 'tag-token'];
    }

    private function admin(string $method, string $uri, array $params = [])
    {
        return $this->call($method, $uri, $params, $this->cookies(), [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json']);
    }

    public function test_tags_are_cleaned_and_deduplicated(): void
    {
        $this->assertSame(['Sale', 'New arrival'], Tags::clean(['  Sale ', 'sale', 'New   arrival', '']));
        $this->assertSame(['a b'], Tags::clean(['a,b']));
        $this->assertSame(30, mb_strlen(Tags::clean([str_repeat('x', 80)])[0]));
        $this->assertSame([], Tags::decode(null));
        $this->assertSame(['Sale', 'new'], Tags::decode('["Sale","new"]'));
    }

    public function test_the_tag_list_counts_products_and_tags_can_be_assigned_renamed_and_deleted(): void
    {
        $list = $this->admin('GET', '/api/admin/tags')->assertOk()->json('tags');
        $this->assertSame([['tag' => 'new', 'count' => 1], ['tag' => 'Sale', 'count' => 1]], $list);

        $this->admin('POST', '/api/admin/tags/assign', ['tag' => 'sale', 'mode' => 'add', 'ids' => [self::CHAIN, self::RING]])->assertOk()->assertJsonPath('changed', 1);
        $this->assertSame(['sale'], array_map('mb_strtolower', array_intersect(Tags::decode(DB::table('products')->where('id', self::CHAIN)->value('tags')), ['sale'])));

        $this->admin('POST', '/api/admin/tags/rename', ['from' => 'SALE', 'to' => 'Diwali offer'])->assertOk()->assertJsonPath('changed', 2);
        $this->assertContains('Diwali offer', Tags::decode(DB::table('products')->where('id', self::RING)->value('tags')));

        $this->admin('GET', '/api/admin/tags/products', ['tag' => 'diwali offer'])->assertOk()->assertJsonCount(2, 'ids');

        $this->admin('POST', '/api/admin/tags/assign', ['tag' => 'Diwali offer', 'mode' => 'remove', 'ids' => [self::CHAIN]])->assertOk()->assertJsonPath('changed', 1);
        $this->admin('POST', '/api/admin/tags/delete', ['tag' => 'diwali offer'])->assertOk()->assertJsonPath('changed', 1);
        $this->assertSame(['new'], Tags::decode(DB::table('products')->where('id', self::RING)->value('tags')));
    }

    public function test_tag_endpoints_are_admin_only(): void
    {
        $this->getJson('/api/admin/tags')->assertStatus(401);
        $this->postJson('/api/admin/tags/delete', ['tag' => 'new'], $this->h)->assertStatus(401);
    }

    public function test_a_discount_code_can_apply_to_a_tag_only(): void
    {
        // Ring (1000, tagged Sale) + chain (500, untagged). 10% off the tagged items only.
        DB::table('coupons')->insert([
            'id' => '90000000-0000-0000-0000-000000000001', 'code' => 'TAG10', 'discount_type' => 'percentage', 'value' => 10,
            'applies_to' => 'tags', 'applies_ids' => json_encode(['sale']), 'active' => 1, 'show_on_site' => 0, 'times_used' => 0,
        ]);
        $items = [['id' => self::RING, 'qty' => 1], ['id' => self::CHAIN, 'qty' => 1]];
        $this->postJson('/api/cart/quote', ['items' => $items, 'coupon' => 'TAG10'], $this->h)->assertOk()->assertJsonPath('discount', 100)->assertJsonPath('couponError', null);

        // A basket with no tagged item is refused with a clear message.
        $this->postJson('/api/cart/quote', ['items' => [['id' => self::CHAIN, 'qty' => 1]], 'coupon' => 'TAG10'], $this->h)
            ->assertOk()->assertJsonPath('couponError', "This code doesn't apply to the items in your cart.")->assertJsonPath('discount', 0);
    }
}
