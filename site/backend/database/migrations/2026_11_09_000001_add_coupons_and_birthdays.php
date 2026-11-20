<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Discount codes (Shopify-style), their redemptions, the discount on orders, and customer birthdays. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coupons', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('code', 60)->unique();
            $t->string('title', 160)->nullable();             // internal name, e.g. "Diwali offer"
            $t->string('description', 300)->nullable();       // shown to customers when the code is promoted
            $t->string('discount_type', 20)->default('percentage'); // percentage | fixed | free_shipping
            $t->decimal('value', 10, 2)->default(0);
            $t->string('applies_to', 20)->default('all');      // all | products | categories | materials
            $t->json('applies_ids')->nullable();
            $t->decimal('min_subtotal', 10, 2)->nullable();    // minimum purchase amount (of the eligible items)
            $t->unsignedInteger('min_quantity')->nullable();   // minimum number of eligible items
            $t->decimal('max_discount', 10, 2)->nullable();    // cap for percentage codes
            $t->unsignedInteger('usage_limit')->nullable();    // total uses allowed
            $t->boolean('one_per_customer')->default(false);
            $t->boolean('first_order_only')->default(false);
            $t->boolean('exclude_sale_items')->default(false);
            $t->dateTime('starts_at')->nullable();
            $t->dateTime('ends_at')->nullable();
            $t->boolean('active')->default(true);
            $t->boolean('show_on_site')->default(false);       // promote the offer to shoppers
            $t->unsignedInteger('times_used')->default(0);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->index(['active', 'show_on_site']);
        });

        Schema::create('coupon_redemptions', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('coupon_id', 36);
            $t->char('order_id', 36)->unique();
            $t->char('customer_id', 36)->nullable();
            $t->string('email', 191);
            $t->decimal('amount', 10, 2)->default(0);
            $t->dateTime('created_at')->useCurrent();
            $t->foreign('coupon_id')->references('id')->on('coupons')->cascadeOnDelete();
            $t->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
            $t->index(['coupon_id', 'email']);
        });

        Schema::table('orders', function (Blueprint $t) {
            $t->decimal('discount_total', 10, 2)->default(0)->after('subtotal');
            $t->string('coupon_code', 60)->nullable()->after('discount_total');
        });

        Schema::table('customers', function (Blueprint $t) {
            $t->date('date_of_birth')->nullable();
            $t->string('gift_note', 500)->nullable();            // "tell us what you love" for birthday gifting
            $t->unsignedSmallInteger('birthday_gift_year')->nullable(); // year the store last sent a birthday gift
        });
    }

    public function down(): void
    {
        Schema::table('customers', fn (Blueprint $t) => $t->dropColumn(['date_of_birth', 'gift_note', 'birthday_gift_year']));
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['discount_total', 'coupon_code']));
        Schema::dropIfExists('coupon_redemptions');
        Schema::dropIfExists('coupons');
    }
};
