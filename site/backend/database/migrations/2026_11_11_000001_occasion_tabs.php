<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * "Shop by occasion" becomes real tabs on the home page. Each tab shows the products of one collection,
 * so the shipped tabs get collections of their own (the owner can edit or replace them in the admin).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $t) {
            $t->boolean('diwali_only')->default(false)->after('navratri_only');   // every product marked "Diwali 2026"
        });

        $now = now()->utc()->format('Y-m-d H:i:s');
        $collections = [
            ['Everyday', 'everyday', 'Light, easy pieces for every day.', '/images/cat-earrings.jpg', ['occasion_filter' => 'Everyday']],
            ['Bridal', 'bridal', 'Statement pieces for the bride and the wedding day.', '/images/p-ad-necklace.jpg', ['occasion_filter' => 'Bridal']],
            ['Reception', 'reception', 'Sparkling pieces for receptions and evening events.', '/images/p-gs-necklace.jpg', ['occasion_filter' => 'Reception']],
            ['Party', 'party', 'Pieces made to be noticed at parties and celebrations.', '/images/p-ad-earrings.jpg', ['occasion_filter' => 'Party']],
            ['Diwali 2026 Edit', 'diwali-edit', 'Pieces that lights up every celebration.', '/images/p-ox-necklace.jpg', ['diwali_only' => 1]],
        ];
        foreach ($collections as $i => [$name, $slug, $description, $image, $rules]) {
            if (DB::table('collections')->where('slug', $slug)->exists()) {
                continue;
            }
            DB::table('collections')->insert([
                'id' => (string) Str::uuid(), 'name' => $name, 'slug' => $slug, 'description' => $description, 'image' => $image,
                'group_name' => 'Occasions', 'sort_order' => 200 + $i, 'published' => 1, 'created_at' => $now, 'updated_at' => $now,
            ] + $rules);
        }

        $tabs = [
            ['label' => 'Everyday', 'collection' => 'everyday'], ['label' => 'Bridal', 'collection' => 'bridal'],
            ['label' => 'Reception', 'collection' => 'reception'], ['label' => 'Navratri', 'collection' => 'navratri-2026'],
            ['label' => 'Party', 'collection' => 'party'], ['label' => 'Diwali', 'collection' => 'diwali-edit'],
        ];
        DB::table('site_settings')->where('key', 'occasions_json')->update(['value' => json_encode($tabs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'label' => 'Shop by occasion tabs']);

        foreach ([['occasion_product_count', 'Products shown in each occasion tab', '8', 620], ['occasion_view_more_label', 'Occasion tabs "View more" button text', 'View more', 630]] as [$key, $label, $value, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => 'lists', 'label' => $label, 'help' => null,
                'multiline' => 0, 'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('collections')->where('group_name', 'Occasions')->whereIn('slug', ['everyday', 'bridal', 'reception', 'party', 'diwali-edit'])->delete();
        DB::table('site_settings')->whereIn('key', ['occasion_product_count', 'occasion_view_more_label'])->delete();
        Schema::table('collections', fn (Blueprint $t) => $t->dropColumn('diwali_only'));
    }
};
