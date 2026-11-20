<?php

namespace Tests\Feature;

use App\Support\Data\QueryEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The seasonal parts of the site (menu tags, sub-menus, banner, lists, collections by occasion) are data, not code. */
class HomeContentTest extends TestCase
{
    use RefreshDatabase;

    private function read(string $table, string $fields = '*', bool $admin = false): array
    {
        $d = ['table' => $table, 'action' => 'select', 'fields' => $fields, 'filters' => [], 'orders' => [], 'returning' => true, 'count' => false, 'head' => false];

        return (new QueryEngine($admin))->execute($d)['data'] ?? [];
    }

    public function test_menu_items_can_carry_a_tag_a_new_tab_flag_and_sit_under_another_item(): void
    {
        $admin = new QueryEngine(true);
        $insert = fn (array $v) => $admin->execute(['table' => 'site_nav', 'action' => 'insert', 'values' => $v, 'fields' => '*', 'filters' => [], 'orders' => [], 'returning' => false, 'count' => false, 'head' => false]);
        $parent = '70000000-0000-0000-0000-000000000001';
        $this->assertNull($insert(['id' => $parent, 'label' => 'Wedding Season', 'path' => '/collection/wedding-season', 'sort_order' => 35, 'visible' => true, 'system' => false, 'badge' => 'NEW'])['error']);
        $this->assertNull($insert(['label' => 'Bridal sets', 'path' => 'https://example.com/bridal', 'sort_order' => 10, 'visible' => true, 'system' => false, 'parent_id' => $parent, 'new_tab' => true])['error']);

        $nav = collect($this->read('site_nav', 'label,path,badge,parent_id,new_tab,visible'));
        $this->assertSame('NEW', $nav->firstWhere('label', 'Wedding Season')['badge']);
        $child = $nav->firstWhere('label', 'Bridal sets');
        $this->assertSame($parent, $child['parent_id']);
        $this->assertTrue($child['new_tab']);
        // The template ships without the seasonal campaign pages, so its menu has no link to them.
        $this->assertSame(0, DB::table('site_nav')->where('path', 'like', '/diwali-2026%')->orWhere('path', '/navratri-2026')->count());
    }

    public function test_the_seasonal_texts_and_lists_are_public_settings_the_admin_can_change(): void
    {
        $settings = collect($this->read('site_settings', 'key,value,group_name'))->keyBy('key');
        foreach (['season_heading', 'season_cta_url', 'hero_secondary_url', 'announcement_2', 'occasions_json', 'bands_json'] as $key) {
            $this->assertArrayHasKey($key, $settings->all(), $key);
        }
        $this->assertCount(4, json_decode($settings['occasions_json']['value'], true));
        $this->assertCount(0, json_decode($settings['bands_json']['value'], true)); // the template starts with no sample stories
        $this->assertArrayNotHasKey('navratri_heading', $settings->all());            // the old Navratri-only text is gone

        $write = (new QueryEngine(false))->execute(['table' => 'site_settings', 'action' => 'update', 'values' => ['value' => 'x'], 'filters' => [['op' => 'eq', 'col' => 'key', 'value' => 'season_heading']], 'fields' => '*', 'orders' => [], 'returning' => false, 'count' => false, 'head' => false]);
        $this->assertSame('Not authorised', $write['error']['message']);
        $this->assertSame('', DB::table('site_settings')->where('key', 'season_heading')->value('value')); // empty until the owner fills it
    }

    public function test_a_collection_can_be_defined_by_occasion_and_by_hand(): void
    {
        $row = ['id' => (string) \Illuminate\Support\Str::uuid(), 'name' => 'Wedding Season', 'slug' => 'wedding-season', 'published' => 1, 'sort_order' => 1,
            'occasion_filter' => 'Bridal', 'product_ids' => json_encode(['abc', 'def'])];
        $admin = new QueryEngine(true);
        $this->assertNull($admin->execute(['table' => 'collections', 'action' => 'insert', 'values' => $row, 'fields' => '*', 'filters' => [], 'orders' => [], 'returning' => false, 'count' => false, 'head' => false])['error']);

        $saved = collect($this->read('collections', 'slug,occasion_filter,product_ids'))->firstWhere('slug', 'wedding-season');
        $this->assertSame('Bridal', $saved['occasion_filter']);
        $this->assertSame(['abc', 'def'], $saved['product_ids']);
    }

    public function test_the_occasion_tabs_ship_with_collections_and_a_product_count_setting(): void
    {
        $settings = collect($this->read('site_settings', 'key,value'))->keyBy('key');
        $tabs = json_decode($settings['occasions_json']['value'], true);
        $this->assertSame(['Everyday', 'Bridal', 'Reception', 'Party'], array_column($tabs, 'label'));
        $this->assertSame('8', $settings['occasion_product_count']['value']);
        $this->assertSame('View more', $settings['occasion_view_more_label']['value']);

        // Every tab has a published collection of its own.
        $collections = collect($this->read('collections', 'slug,occasion_filter,diwali_only,published'))->keyBy('slug');
        foreach (['everyday' => 'Everyday', 'bridal' => 'Bridal', 'reception' => 'Reception', 'party' => 'Party'] as $slug => $occasion) {
            $this->assertSame($occasion, $collections[$slug]['occasion_filter'], $slug);
        }
        $this->assertArrayNotHasKey('diwali-edit', $collections->all()); // the seasonal collection is not part of the template
    }
}
