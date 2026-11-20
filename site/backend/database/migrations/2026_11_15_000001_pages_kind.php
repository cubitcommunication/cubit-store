<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pages get a "kind": ordinary pages are "page"; the editable designs of the built-in pages (home, about, contact,
 * product, collection) are stored as pages with that kind and the slug "system-<kind>". They are never shown at /pages/....
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pages', function (Blueprint $t) {
            $t->string('kind', 20)->default('page')->after('slug');
            $t->index('kind');
        });
    }

    public function down(): void
    {
        Schema::table('pages', function (Blueprint $t) {
            $t->dropIndex(['kind']);
            $t->dropColumn('kind');
        });
    }
};
