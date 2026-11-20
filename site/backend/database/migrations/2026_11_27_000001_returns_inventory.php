<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Customer return requests, the stock history, and the date an order was fulfilled (the return window starts there). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('return_requests', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('order_id', 36)->index();
            $t->unsignedInteger('order_number');
            $t->char('customer_id', 36)->nullable();
            $t->string('name', 120);
            $t->string('email', 191);
            $t->string('status', 20)->default('requested');   // requested | approved | rejected | received | refunded | closed
            $t->string('reason', 60);
            $t->text('details')->nullable();
            $t->json('items');                                // [{order_item_id, name, qty}]
            $t->text('admin_note')->nullable();               // shown to the customer
            $t->decimal('refund_amount', 10, 2)->nullable();
            $t->boolean('restocked')->default(false);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->index(['status', 'created_at']);
        });

        Schema::create('stock_adjustments', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('product_id', 36)->index();
            $t->char('variant_id', 36)->nullable();
            $t->integer('change');                            // +5, -2
            $t->integer('stock_after')->nullable();
            $t->string('reason', 40);                         // order | cancel | return | received | correction | damaged | count | other
            $t->string('note', 200)->nullable();
            $t->string('admin_email', 191)->nullable();
            $t->char('order_id', 36)->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->index(['product_id', 'created_at']);
        });

        Schema::table('orders', function (Blueprint $t) {
            $t->dateTime('fulfilled_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn('fulfilled_at'));
        Schema::dropIfExists('stock_adjustments');
        Schema::dropIfExists('return_requests');
    }
};
