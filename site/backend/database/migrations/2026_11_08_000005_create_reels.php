<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Reels shown in the home page "Follow the Your Store journey" section, each with a shop link. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reels', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('title', 160)->default('');
            $t->string('video_url', 500);
            $t->string('poster_url', 500)->nullable();
            $t->char('product_id', 36)->nullable();
            $t->string('link_url', 500)->nullable();
            $t->string('link_label', 60)->default('Shop this piece');
            $t->boolean('active')->default(true);
            $t->integer('sort_order')->default(100);
            $t->timestamps();
            $t->index(['active', 'sort_order']);
        });

        // The "Found something you love?" WhatsApp banner is gone from the website.
        DB::table('site_settings')->whereIn('key', ['enquiry_heading', 'enquiry_body', 'enquiry_cta'])->delete();
    }

    public function down(): void
    {
        Schema::dropIfExists('reels');
    }
};
