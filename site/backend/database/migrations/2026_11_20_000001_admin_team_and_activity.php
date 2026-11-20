<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Admin team: extra details on each admin account (name, active switch, last sign-in, who added them), the
 * "super admin" role, and an activity log that records what every signed-in admin does.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admin_users', function (Blueprint $t) {
            $t->string('name', 120)->nullable()->after('email');
            $t->boolean('active')->default(true)->after('role');
            $t->dateTime('last_login_at')->nullable()->after('active');
            $t->char('created_by', 36)->nullable()->after('last_login_at');
        });

        // The main administrator. (The code also protects this address even if the role were changed by hand.)
        DB::table('admin_users')->whereRaw('LOWER(email) = ?', ['owner@example.com'])->update(['role' => 'super']);

        Schema::create('admin_activity', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('admin_id', 36)->nullable();
            $t->string('admin_email', 191);
            $t->string('action', 40);
            $t->string('area', 60)->default('');
            $t->string('subject_type', 60)->nullable();
            $t->string('subject_id', 64)->nullable();
            $t->string('summary', 500);
            $t->text('details')->nullable();
            $t->string('ip', 64)->nullable();
            $t->string('user_agent', 255)->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->index('created_at', 'admin_activity_created_idx');
            $t->index(['admin_id', 'created_at'], 'admin_activity_admin_idx');
            $t->index(['action', 'created_at'], 'admin_activity_action_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_activity');
        Schema::table('admin_users', function (Blueprint $t) {
            $t->dropColumn(['name', 'active', 'last_login_at', 'created_by']);
        });
    }
};
