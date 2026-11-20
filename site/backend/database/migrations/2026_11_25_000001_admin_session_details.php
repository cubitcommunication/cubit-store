<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** What the main administrator needs to see (and end) every signed-in device: where it came from and when it was last used. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admin_sessions', function (Blueprint $t) {
            $t->string('ip', 64)->nullable();
            $t->string('user_agent', 255)->nullable();
            $t->dateTime('last_active_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('admin_sessions', function (Blueprint $t) {
            $t->dropColumn(['ip', 'user_agent', 'last_active_at']);
        });
    }
};
