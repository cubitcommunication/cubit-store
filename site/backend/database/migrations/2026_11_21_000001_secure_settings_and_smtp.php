<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Secrets entered by the main administrator in the admin panel instead of the server .env:
 *  - secure_settings: Razorpay keys and the reCAPTCHA secret. Values are encrypted with the app key.
 *  - smtp_accounts: one row per mail account (host, port, login, From address). The password is encrypted too.
 * Neither table is reachable through the generic data API, and no endpoint ever sends a stored secret back to the browser.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('secure_settings', function (Blueprint $t) {
            $t->string('key', 80)->primary();
            $t->text('value');
            $t->timestamp('updated_at')->nullable();
        });

        Schema::create('smtp_accounts', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('name', 80);
            $t->string('host', 190);
            $t->unsignedSmallInteger('port')->default(465);
            $t->string('security', 10)->default('ssl'); // ssl = implicit TLS (port 465), tls = STARTTLS (port 587)
            $t->string('username', 190)->nullable();
            $t->text('password')->nullable();           // encrypted
            $t->string('from_email', 190);
            $t->string('from_name', 80)->nullable();
            $t->boolean('is_default')->default(false);
            $t->timestamp('created_at')->nullable();
            $t->timestamp('updated_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('smtp_accounts');
        Schema::dropIfExists('secure_settings');
    }
};
