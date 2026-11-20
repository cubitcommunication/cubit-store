<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customers made in the offline shop: "source" says where a customer came from (online or shop), the e-mail may be empty
 * (a walk-in may only give a mobile number), and a free-text address is kept. A shop customer has no password until
 * they register online with the same e-mail.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $t) {
            $t->string('email', 191)->nullable()->change();
        });
        Schema::table('customers', function (Blueprint $t) {
            $t->string('source', 10)->default('online')->after('accepts_marketing')->index();
            $t->text('address')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $t) {
            $t->dropIndex(['source']);
            $t->dropColumn(['source', 'address']);
        });
    }
};
