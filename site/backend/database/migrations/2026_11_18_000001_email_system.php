<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Store e-mail, managed from the admin panel:
 *  - mail_settings: company e-mail addresses (who orders come from, where alerts go, reply-to...) and the abandoned-cart
 *    settings. Admin-only on purpose (the generic query endpoint cannot read it).
 *  - email_templates: edited wording of each automatic e-mail (a template with no row uses the built-in default).
 *  - email_log: what was sent, to whom, and whether it worked.
 *  - abandoned_carts: baskets left behind by shoppers who gave their e-mail, and their reminder state.
 * The public contact e-mail changes from hello@ to support@ (and in the policy pages written earlier).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mail_settings', function (Blueprint $t) {
            $t->string('key', 80)->primary();
            $t->text('value')->nullable();
            $t->timestamp('updated_at')->nullable();
        });

        Schema::create('email_templates', function (Blueprint $t) {
            $t->string('key', 60)->primary();
            $t->string('subject', 200);
            $t->text('body');
            $t->boolean('enabled')->default(true);
            $t->timestamp('updated_at')->nullable();
        });

        Schema::create('email_log', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('template', 60);
            $t->string('to_email', 200);
            $t->string('subject', 250);
            $t->string('status', 12);
            $t->string('error', 400)->nullable();
            $t->char('order_id', 36)->nullable();
            $t->timestamp('created_at')->nullable();
            $t->index('created_at');
        });

        Schema::create('abandoned_carts', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('token', 48)->unique();
            $t->char('customer_id', 36)->nullable();
            $t->string('email', 160);
            $t->string('name', 120)->nullable();
            $t->string('phone', 30)->nullable();
            $t->json('items');
            $t->decimal('subtotal', 12, 2)->default(0);
            // active -> reminded -> recovered | expired | unsubscribed
            $t->string('status', 14)->default('active');
            $t->unsignedSmallInteger('reminders_sent')->default(0);
            $t->dateTime('last_activity_at');
            $t->dateTime('last_reminder_at')->nullable();
            $t->dateTime('admin_notified_at')->nullable();
            $t->dateTime('clicked_at')->nullable();
            $t->dateTime('recovered_at')->nullable();
            $t->char('recovered_order_id', 36)->nullable();
            $t->decimal('recovered_total', 12, 2)->nullable();
            $t->timestamps();
            $t->index(['status', 'last_activity_at']);
            $t->index('email');
        });

        // The public contact address is now support@ (orders@ is kept for order mail, set in Admin -> Emails).
        DB::table('site_settings')->where('key', 'email')->where('value', 'hello@example.com')->update(['value' => 'support@example.com']);

        // Policy pages written earlier carry the old address in their text.
        foreach (DB::table('pages')->where('kind', 'policy')->get(['id', 'blocks']) as $page) {
            $blocks = (string) $page->blocks;
            if (str_contains($blocks, 'hello@example.com')) {
                DB::table('pages')->where('id', $page->id)->update(['blocks' => str_replace('hello@example.com', 'support@example.com', $blocks)]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('abandoned_carts');
        Schema::dropIfExists('email_log');
        Schema::dropIfExists('email_templates');
        Schema::dropIfExists('mail_settings');
    }
};
