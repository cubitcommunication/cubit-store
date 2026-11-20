<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Makes the seasonal parts of the site editable from the admin, so changing from Diwali to a wedding
 * season needs no code: menu badges, sub-menus and custom links; the seasonal home banner, hero buttons
 * and announcement lines; the occasion buttons and material stories; and collections picked by occasion
 * or by hand.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_nav', function (Blueprint $t) {
            $t->string('badge', 20)->nullable();           // small tag next to the name, e.g. NEW
            $t->char('parent_id', 36)->nullable();         // sub-menu under another item
            $t->boolean('new_tab')->default(false);
        });
        Schema::table('collections', function (Blueprint $t) {
            $t->string('occasion_filter', 60)->nullable(); // e.g. Bridal: every product tagged with that occasion
            $t->json('product_ids')->nullable();           // products added by hand
        });

        $now = now()->utc()->format('Y-m-d H:i:s');

        /* ---------------------------------------------------------------- menu */
        DB::table('site_nav')->where('path', '/navratri-2026')->update(['badge' => 'ARCHIVE']);
        if (! DB::table('site_nav')->where('path', '/diwali-2026')->exists()) {
            DB::table('site_nav')->insert([
                'id' => (string) Str::uuid(), 'label' => 'Diwali 2026', 'path' => '/diwali-2026', 'sort_order' => 35, 'visible' => 1,
                'system' => 0, 'badge' => 'NEW', 'created_at' => $now, 'updated_at' => $now,
            ]);
        } else {
            DB::table('site_nav')->where('path', '/diwali-2026')->update(['badge' => 'NEW']);
        }
        $collections = DB::table('site_nav')->where('path', '/collections')->first();
        if ($collections && ! DB::table('site_nav')->where('parent_id', $collections->id)->exists()) {
            foreach ([['Earrings', '/collections/earrings'], ['Necklaces', '/collections/necklaces'], ['Rings', '/collections/rings'], ['Bracelets & Kada', '/collections/bracelets-kada']] as $i => [$label, $path]) {
                DB::table('site_nav')->insert([
                    'id' => (string) Str::uuid(), 'label' => $label, 'path' => $path, 'sort_order' => ($i + 1) * 10, 'visible' => 1,
                    'system' => 0, 'parent_id' => $collections->id, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }

        /* ------------------------------------------------------------ settings */
        $text = [
            // season: the banner band on the home page
            ['season_enabled', 'season', 'Show the seasonal banner', '1 = show, 0 = hide the big seasonal banner on the home page.', 0, '1', 10],
            ['season_eyebrow', 'season', 'Small label above the heading', null, 0, 'Your Store DIWALI 2026', 20],
            ['season_heading', 'season', 'Heading', null, 0, 'THE FESTIVE EDIT', 30],
            ['season_description', 'season', 'Description', null, 1, 'Pieces that lights up every celebration — from Dhanteras to Bhai Dooj.', 40],
            ['season_cta_label', 'season', 'Button text', null, 0, 'EXPLORE DIWALI COLLECTION', 50],
            ['season_cta_url', 'season', 'Button opens', 'A page on this site, or a full https:// address.', 0, '/diwali-2026', 60],
            // hero buttons
            ['hero_primary_url', 'season', 'Hero main button opens', 'Where the big red button goes.', 0, '/shop', 70],
            ['hero_secondary_url', 'season', 'Hero second button opens', 'Leave the text empty to hide the second button.', 0, '/diwali-2026', 80],
            // announcement bar
            ['announcement_url', 'season', 'Announcement line 1 opens', 'Optional. Leave empty for plain text.', 0, '', 90],
            ['announcement_2', 'season', 'Announcement line 2', 'The bar alternates between line 1 and line 2. Leave empty to show only line 1.', 0, 'DIWALI 2026 COLLECTION IS HERE — SHOP THE FESTIVE EDIT', 100],
            ['announcement_2_url', 'season', 'Announcement line 2 opens', 'Optional.', 0, '/diwali-2026', 110],
            // small home page labels
            ['category_link_label', 'homepage', 'Category section link text', null, 0, 'All collections', 500],
            ['featured_link_label', 'homepage', 'Featured section link text', null, 0, 'View all', 510],
            ['story_link_label', 'homepage', 'Brand story link text', null, 0, 'Read our story', 520],
            ['highlight_1', 'homepage', 'Brand highlight 1', 'The three short points under the brand story.', 0, 'PREMIUM QUALITY', 530],
            ['highlight_2', 'homepage', 'Brand highlight 2', null, 0, 'UNIQUE DESIGNS', 540],
            ['highlight_3', 'homepage', 'Brand highlight 3', null, 0, 'EVERYDAY TO OCCASION', 550],
        ];
        foreach ($text as [$key, $group, $label, $help, $multi, $value, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => $group, 'label' => $label, 'help' => $help,
                'multiline' => $multi, 'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
        // The hero's second button used to be fixed to Diwali whatever this said; make the stored text match what visitors saw.
        DB::table('site_settings')->where('key', 'hero_secondary_cta')->update(['value' => 'DIWALI 2026']);

        $occasions = [
            ['label' => 'Everyday', 'url' => '/shop?q=Everyday'], ['label' => 'Bridal', 'url' => '/shop?q=Bridal'],
            ['label' => 'Reception', 'url' => '/shop?q=Reception'], ['label' => 'Navratri', 'url' => '/shop?q=Navratri'],
            ['label' => 'Party', 'url' => '/shop?q=Party'], ['label' => 'Diwali', 'url' => '/diwali-2026'],
            ['label' => 'Gifting', 'url' => '/diwali-2026/gifting'],
        ];
        $bands = [
            ['eyebrow' => 'Anti-Tarnish', 'title' => 'EVERYDAY. ELEGANT. ANTI-TARNISH.', 'body' => 'Finished to hold its shine through daily wear — the pieces you never take off.', 'cta' => 'EXPLORE ANTI-TARNISH', 'url' => '/material/anti-tarnish', 'media' => 'anti_tarnish_section', 'visible' => true],
            ['eyebrow' => 'Oxidised', 'title' => 'BOLD. TIMELESS. OXIDISED.', 'body' => 'Tribal detailing, deep silver tone and silhouettes made to be noticed.', 'cta' => 'DISCOVER OXIDISED', 'url' => '/material/oxidised', 'media' => 'oxidised_section', 'visible' => true],
            ['eyebrow' => 'German Silver', 'title' => 'TRADITION WITH A MODERN EDGE', 'body' => 'Engraved german silver, cut clean — heritage craft in a contemporary line.', 'cta' => 'DISCOVER GERMAN SILVER', 'url' => '/material/german-silver', 'media' => 'german_silver_section', 'visible' => true],
            ['eyebrow' => 'American Diamond', 'title' => 'A LITTLE MORE SPARKLE', 'body' => 'Graded American Diamond stones set for occasions that deserve the light.', 'cta' => 'EXPLORE AD JEWELLERY', 'url' => '/material/american-diamond', 'media' => 'ad_section', 'visible' => true],
        ];
        foreach ([['occasions_json', 'Shop by occasion buttons', $occasions, 600], ['bands_json', 'Home page stories', $bands, 610]] as [$key, $label, $value, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'group_name' => 'lists',
                'label' => $label, 'help' => null, 'multiline' => 1, 'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        DB::table('site_media')->where('key', 'diwali_banner')->update([
            'title' => 'Seasonal banner background',
            'description' => 'Full-width background of the seasonal banner on the home page (Diwali now, wedding season later). Use a wide landscape photo with the pieces on the right; the text sits on the left.',
        ]);
    }

    public function down(): void
    {
        DB::table('site_nav')->whereNotNull('parent_id')->delete();
        DB::table('site_settings')->whereIn('group_name', ['season', 'lists'])->delete();
        Schema::table('collections', fn (Blueprint $t) => $t->dropColumn(['occasion_filter', 'product_ids']));
        Schema::table('site_nav', fn (Blueprint $t) => $t->dropColumn(['badge', 'parent_id', 'new_tab']));
    }
};
