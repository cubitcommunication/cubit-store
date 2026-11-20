<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// The footer no longer shows a photo, so its editable image slot is removed.
return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_media')->where('key', 'footer_image')->delete();
    }

    public function down(): void
    {
    }
};
