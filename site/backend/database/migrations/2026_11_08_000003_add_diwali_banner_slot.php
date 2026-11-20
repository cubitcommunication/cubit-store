<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Editable full-width background photo for the home page "The Festive Edit" section. */
return new class extends Migration
{
    public function up(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('site_media')->insertOrIgnore([
            'id' => (string) Str::uuid(), 'key' => 'diwali_banner', 'title' => 'Festive Edit background',
            'description' => 'Full-width background of "The Festive Edit" section on the home page. Use a wide landscape photo with the pieces on the right; the text sits on the left. Add a portrait photo as the mobile image if you like.',
            'image_url' => '/diwali/IMG_8196.jpg', 'mobile_image_url' => null,
            'alt_text' => 'Your Store necklace and earrings photographed on a pieces display', 'active' => 1, 'sort_order' => 25,
            'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        DB::table('site_media')->where('key', 'diwali_banner')->delete();
    }
};
