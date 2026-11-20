<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** One video for a product and, optionally, one for each variation (for example each colour). Shown without sound. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) {
            $t->string('video_url', 500)->nullable();
        });
        Schema::table('product_variants', function (Blueprint $t) {
            $t->string('video_url', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('product_variants', function (Blueprint $t) {
            $t->dropColumn('video_url');
        });
        Schema::table('products', function (Blueprint $t) {
            $t->dropColumn('video_url');
        });
    }
};
