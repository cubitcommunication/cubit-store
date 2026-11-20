<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/** Footer newsletter sign-ups, an editable footer photo, and Pinterest / YouTube links. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('newsletter_subscribers', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('email', 191)->unique();
            $t->dateTime('created_at')->useCurrent();
        });

        $now = now()->utc()->format('Y-m-d H:i:s');

        // Footer photo slot: replaceable in Admin -> Online store -> Banners & images.
        DB::table('site_media')->insertOrIgnore([
            'id' => (string) Str::uuid(), 'key' => 'footer_image', 'title' => 'Footer image',
            'description' => 'Photo on the left of the website footer (desktop). Portrait photos of earrings or a necklace work best.',
            'image_url' => '/images/p-ox-earrings.jpg', 'mobile_image_url' => null,
            'alt_text' => 'Your Store oxidised pieces', 'active' => 1, 'sort_order' => 160,
            'created_at' => $now, 'updated_at' => $now,
        ]);

        foreach ([['pinterest_url', 'Pinterest link', 1000], ['youtube_url', 'YouTube link', 1010]] as [$key, $label, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => '', 'group_name' => 'contact', 'label' => $label,
                'help' => 'Leave empty to hide the icon in the footer. Must start with https://', 'multiline' => 0,
                'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('site_media')->where('key', 'footer_image')->delete();
        DB::table('site_settings')->whereIn('key', ['pinterest_url', 'youtube_url'])->delete();
        Schema::dropIfExists('newsletter_subscribers');
    }
};
