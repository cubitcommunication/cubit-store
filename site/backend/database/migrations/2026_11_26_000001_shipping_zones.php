<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Shipping zones (Shopify-style): a group of states with its own shipping fee and optional free-shipping amount. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipping_zones', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('name', 120);
            $t->json('states');                                // list of state names this zone covers
            $t->decimal('rate', 10, 2)->default(0);            // shipping fee for orders to these states
            $t->decimal('free_over', 10, 2)->nullable();       // null = store default, 0 = never free, else free from this amount
            $t->boolean('active')->default(true);
            $t->unsignedInteger('sort_order')->default(0);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipping_zones');
    }
};
