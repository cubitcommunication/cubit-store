<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** The data layer stores an empty form field as NULL, so a reel without a title must be allowed. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reels', function (Blueprint $t) {
            $t->string('title', 160)->nullable()->default(null)->change();
        });
    }

    public function down(): void
    {
    }
};
