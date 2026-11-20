<?php

namespace Tests\Feature;

use App\Support\Data\QueryEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The access rules of the public JSON API. These are the guarantees the admin
 * panel and the public catalogue rely on, so they are pinned by tests.
 */
class ApiSecurityTest extends TestCase
{
    use RefreshDatabase;

    private array $ajax = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];

    private function descriptor(array $d): array
    {
        return $d + ['fields' => '*', 'count' => false, 'head' => false, 'filters' => [], 'orders' => [], 'returning' => true];
    }

    private function product(string $id, string $slug, array $over = []): void
    {
        DB::table('products')->insert($over + [
            'id' => $id, 'name' => $slug, 'slug' => $slug, 'sku' => strtoupper($slug), 'price' => 100,
            'occasion' => '[]', 'specifications' => '{}', 'published' => 1,
        ]);
    }

    public function test_visitors_only_see_published_products(): void
    {
        $this->product('00000000-0000-0000-0000-000000000001', 'live');
        $this->product('00000000-0000-0000-0000-000000000002', 'draft', ['published' => 0]);
        $this->product('00000000-0000-0000-0000-000000000003', 'archived', ['archived_at' => '2026-01-01 00:00:00']);

        $result = (new QueryEngine(false))->execute($this->descriptor(['table' => 'products', 'action' => 'select', 'fields' => 'slug']));

        $this->assertNull($result['error']);
        $this->assertSame(['live'], array_column($result['data'], 'slug'));
    }

    public function test_admins_see_everything(): void
    {
        $this->product('00000000-0000-0000-0000-000000000001', 'live');
        $this->product('00000000-0000-0000-0000-000000000002', 'draft', ['published' => 0]);

        $result = (new QueryEngine(true))->execute($this->descriptor(['table' => 'products', 'action' => 'select', 'fields' => 'slug']));

        $this->assertCount(2, $result['data']);
    }

    public function test_visitors_cannot_write(): void
    {
        $this->product('00000000-0000-0000-0000-000000000001', 'live');
        foreach (['insert', 'update', 'delete', 'upsert'] as $action) {
            $result = (new QueryEngine(false))->execute($this->descriptor([
                'table' => 'products', 'action' => $action, 'values' => ['name' => 'x'],
                'filters' => [['op' => 'eq', 'col' => 'slug', 'value' => 'live']],
            ]));
            $this->assertSame('Not authorised', $result['error']['message'], $action);
        }
        $this->assertSame(1, DB::table('products')->count());
    }

    public function test_private_tables_are_not_readable_by_visitors(): void
    {
        $result = (new QueryEngine(false))->execute($this->descriptor(['table' => 'site_media_versions', 'action' => 'select']));
        $this->assertSame('Not authorised', $result['error']['message']);

        $result = (new QueryEngine(false))->execute($this->descriptor(['table' => 'admin_users', 'action' => 'select']));
        $this->assertStringContainsString('Unknown table', $result['error']['message']);
    }

    public function test_identifiers_are_whitelisted_so_sql_cannot_be_injected(): void
    {
        $this->product('00000000-0000-0000-0000-000000000001', 'live');
        $engine = new QueryEngine(true);

        $bad = $engine->execute($this->descriptor([
            'table' => 'products', 'action' => 'select',
            'filters' => [['op' => 'eq', 'col' => 'id; DROP TABLE products', 'value' => 'x']],
        ]));
        $this->assertNotNull($bad['error']);

        $unknown = $engine->execute($this->descriptor(['table' => 'products', 'action' => 'select', 'fields' => 'password_hash']));
        $this->assertStringContainsString('Unknown column', $unknown['error']['message']);

        // A hostile *value* is only ever a bound parameter.
        $value = $engine->execute($this->descriptor([
            'table' => 'products', 'action' => 'select',
            'filters' => [['op' => 'eq', 'col' => 'slug', 'value' => "' OR 1=1 --"]],
        ]));
        $this->assertSame([], $value['data']);
        $this->assertSame(1, DB::table('products')->count());
    }

    public function test_update_and_delete_without_a_filter_are_refused(): void
    {
        $engine = new QueryEngine(true);
        $this->assertSame('Refusing to update every row', $engine->execute($this->descriptor(['table' => 'products', 'action' => 'update', 'values' => ['name' => 'x']]))['error']['message']);
        $this->assertSame('Refusing to delete every row', $engine->execute($this->descriptor(['table' => 'products', 'action' => 'delete']))['error']['message']);
    }

    public function test_embedded_images_come_back_in_order(): void
    {
        $this->product('00000000-0000-0000-0000-000000000001', 'live');
        foreach ([[2, '/b.jpg'], [1, '/a.jpg']] as [$order, $url]) {
            DB::table('product_images')->insert(['id' => "10000000-0000-0000-0000-00000000000{$order}", 'product_id' => '00000000-0000-0000-0000-000000000001', 'image_url' => $url, 'sort_order' => $order]);
        }

        $result = (new QueryEngine(false))->execute($this->descriptor(['table' => 'products', 'action' => 'select', 'fields' => 'slug,product_images(image_url,sort_order)']));

        $this->assertSame(['/a.jpg', '/b.jpg'], array_column($result['data'][0]['product_images'], 'image_url'));
    }

    public function test_the_api_rejects_cross_site_writes(): void
    {
        $this->postJson('/api/query', $this->descriptor(['table' => 'products', 'action' => 'select']))->assertStatus(403);
        $this->postJson('/api/query', $this->descriptor(['table' => 'products', 'action' => 'select']), $this->ajax + ['Origin' => 'https://evil.example'])->assertStatus(403);
        $this->postJson('/api/query', $this->descriptor(['table' => 'products', 'action' => 'select']), $this->ajax)->assertOk();
    }

    public function test_admin_endpoints_need_a_session(): void
    {
        $this->getJson('/api/admin/export-catalogue', $this->ajax)->assertStatus(401);
        $this->postJson('/api/admin/products/save', [], $this->ajax)->assertStatus(401);
        $this->postJson('/api/admin/images', ['path' => 'products/a.png', 'data' => 'AAAA'], $this->ajax)->assertStatus(401);
        $this->postJson('/api/admin/bulk/commit', ['csv' => 'x'], $this->ajax)->assertStatus(401);
    }

    public function test_an_unknown_product_returns_a_real_404_and_a_renamed_one_redirects(): void
    {
        $this->withAppShell(function () {
            $this->get('/product/nope')->assertStatus(404);

            DB::table('slug_redirects')->insert([
                'id' => '20000000-0000-0000-0000-000000000001', 'entity_type' => 'product', 'source_slug' => 'old', 'target_slug' => 'new',
                'source_path' => '/product/old', 'target_path' => '/product/new',
            ]);
            $this->get('/product/old')->assertRedirect('/product/new')->assertStatus(301);
        });
    }
}
