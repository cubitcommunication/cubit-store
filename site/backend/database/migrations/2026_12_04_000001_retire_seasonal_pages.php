<?php

use Illuminate\Database\Migrations\Migration;
use App\Support\Brand;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * The template ships without the Diwali and Navratri campaign pages. The earlier migrations still seed their menu items,
 * home-page banner texts and collections (they are part of the history), so this one tidies the result: a new site starts
 * with a neutral menu and an empty seasonal banner, ready to be filled in the admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_nav')->where('path', 'like', '/diwali-2026%')->orWhere('path', '/navratri-2026')->delete();

        $set = fn (string $key, string $value) => DB::table('site_settings')->where('key', $key)->update(['value' => $value]);
        foreach (['season_eyebrow', 'season_heading', 'season_description', 'season_cta_label', 'season_cta_url', 'announcement_2', 'announcement_2_url'] as $key) {
            $set($key, '');
        }
        $set('season_enabled', '0');
        $set('hero_secondary_cta', 'ABOUT US');
        $set('hero_secondary_url', '/about');

        // "Shop by occasion" tabs and buttons: drop the two seasonal entries.
        foreach (['occasions_json'] as $key) {
            $raw = (string) DB::table('site_settings')->where('key', $key)->value('value');
            $list = json_decode($raw, true);
            if (is_array($list)) {
                $kept = array_values(array_filter($list, fn ($item) => ! preg_match('/diwali|navratri/i', (string) json_encode($item))));
                $set($key, (string) json_encode($kept, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            }
        }

        DB::table('collections')->whereIn('slug', ['diwali-edit', 'navratri-2026'])->delete();

        // The sample material pages and the sample home-page stories belonged to a jewellery shop: the menu loses their
        // links and the stories list starts empty, ready for the owner's own.
        DB::table('site_nav')->where('path', 'like', '/material/%')->delete();
        DB::table('site_nav')->whereIn('path', ['/collections/earrings', '/collections/necklaces', '/collections/rings', '/collections/bracelets-kada'])->delete();
        $set('bands_json', '[]');
        DB::table('site_media')->where('key', 'diwali_banner')->update(['image_url' => null, 'mobile_image_url' => null]);

        // The template ships no pictures and no named people: clear the addresses of the shipped sample pictures, the
        // founder slots and any name left in picture descriptions.
        DB::table('site_media')->where('key', 'like', 'founder\_%')->delete();
        DB::table('site_media')->where('alt_text', 'like', '%PRIHIKA%')->update(['alt_text' => Brand::name()]);
        foreach ([['site_media', 'image_url'], ['site_media', 'mobile_image_url'], ['collections', 'image'], ['collections', 'seo_image_url'], ['categories', 'image']] as [$table, $column]) {
            if (Schema::hasColumn($table, $column)) {
                DB::table($table)->where($column, 'like', '/images/%')->orWhere($column, 'like', '/diwali/%')->update([$column => null]);
            }
        }
        foreach (DB::table('site_settings')->where('value', 'like', '%images%')->orWhere('value', 'like', '%diwali%')->get(['id', 'value']) as $row) {
            $clean = preg_replace('#\\\\?/(images|diwali)\\\\?/[A-Za-z0-9_.\-]+#', '', (string) $row->value);
            DB::table('site_settings')->where('id', $row->id)->update(['value' => $clean]);
        }
    }

    public function down(): void
    {
        // Nothing to restore: the seasonal pages no longer exist in the template.
    }
};
