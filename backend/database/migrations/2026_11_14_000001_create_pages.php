<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Pages made in the admin page builder (Admin -> Pages): a list of blocks stored as JSON, shown at /pages/<slug>. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pages', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('title', 160);
            $t->string('slug', 120)->unique();
            $t->boolean('published')->default(false);
            $t->json('blocks')->nullable();
            $t->string('seo_title', 160)->nullable();
            $t->string('seo_description', 320)->nullable();
            $t->string('seo_image_url', 500)->nullable();
            $t->timestamps();
            $t->index('published');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pages');
    }
};
