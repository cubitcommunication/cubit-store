<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Blog posts are pages of kind "post" (same page builder, same table). They get an excerpt, cover picture, author, tags
 * and a display date, and a slug only has to be unique within its kind (a page "offers" and a post "offers" can both exist).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pages', function (Blueprint $t) {
            $t->string('excerpt', 400)->nullable()->after('blocks');
            $t->string('cover_url', 500)->nullable()->after('excerpt');
            $t->string('author', 120)->nullable()->after('cover_url');
            $t->string('tags', 300)->nullable()->after('author');
            $t->dateTime('published_at')->nullable()->after('tags');
        });
        Schema::table('pages', function (Blueprint $t) {
            $t->dropUnique('pages_slug_unique');
            $t->unique(['kind', 'slug'], 'pages_kind_slug_unique');
        });
    }

    public function down(): void
    {
        Schema::table('pages', function (Blueprint $t) {
            $t->dropUnique('pages_kind_slug_unique');
            $t->unique('slug', 'pages_slug_unique');
        });
        Schema::table('pages', function (Blueprint $t) {
            $t->dropColumn(['excerpt', 'cover_url', 'author', 'tags', 'published_at']);
        });
    }
};
