<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Admin notifications (new orders and other events):
 *  - admin_notifications: one shared feed that every admin sees in the bell;
 *  - push_subscriptions: the browsers/phones that allowed system notifications (web push), one row per device;
 *  - notification_settings: which events are switched on (main administrator only);
 *  - admin_users.notifications_seen_at: where each admin's "read" marker is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_notifications', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('event', 40);
            $t->string('title', 160);
            $t->string('body', 400)->default('');
            $t->string('url', 300)->nullable();
            $t->string('dedupe', 100)->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->index('created_at', 'admin_notifications_created_idx');
            $t->index('dedupe', 'admin_notifications_dedupe_idx');
        });

        Schema::create('push_subscriptions', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('admin_id', 36);
            $t->char('endpoint_hash', 64)->unique();
            $t->text('endpoint');
            $t->string('p256dh', 200);
            $t->string('auth', 100);
            $t->string('user_agent', 255)->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('last_sent_at')->nullable();
            $t->index('admin_id', 'push_subscriptions_admin_idx');
            $t->foreign('admin_id')->references('id')->on('admin_users')->cascadeOnDelete();
        });

        Schema::create('notification_settings', function (Blueprint $t) {
            $t->string('key', 60)->primary();
            $t->string('value', 100);
            $t->timestamp('updated_at')->nullable();
        });

        Schema::table('admin_users', function (Blueprint $t) {
            $t->dateTime('notifications_seen_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('admin_users', function (Blueprint $t) {
            $t->dropColumn('notifications_seen_at');
        });
        Schema::dropIfExists('notification_settings');
        Schema::dropIfExists('push_subscriptions');
        Schema::dropIfExists('admin_notifications');
    }
};
