<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Moves the seasonal texts onto the new "Seasonal campaign" admin page, removes the old Navratri-only
 * settings nothing reads any more, and adds spare photo slots for extra home page stories.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');

        DB::table('site_settings')->whereIn('key', ['navratri_eyebrow', 'navratri_heading', 'navratri_description', 'navratri_cta'])->delete();

        $moves = [
            'announcement' => ['Announcement line 1', 'The line above the header. Leave line 2 empty to show only this one.', 85],
            'hero_primary_cta' => ['Hero main button text', null, 65],
            'hero_secondary_cta' => ['Hero second button text', 'Leave empty to hide the second button.', 75],
        ];
        foreach ($moves as $key => [$label, $help, $sort]) {
            DB::table('site_settings')->where('key', $key)->update(['group_name' => 'season', 'label' => $label, 'help' => $help, 'sort_order' => $sort]);
        }

        foreach ([1, 2, 3] as $n) {
            DB::table('site_media')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => "story_extra_{$n}", 'title' => "Extra story photo {$n}",
                'description' => 'A spare photo for a home page story (Admin → Homepage text → Home page stories), for example a wedding season story.',
                'image_url' => '/images/brand-story.jpg', 'mobile_image_url' => null, 'alt_text' => 'Your Store pieces', 'active' => 1,
                'sort_order' => 180 + $n, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('site_media')->whereIn('key', ['story_extra_1', 'story_extra_2', 'story_extra_3'])->delete();
        DB::table('site_settings')->whereIn('key', ['announcement', 'hero_primary_cta', 'hero_secondary_cta'])->update(['group_name' => 'homepage']);
    }
};
