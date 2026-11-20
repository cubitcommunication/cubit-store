<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per physical piece that has its own barcode (ER-0001.01, ER-0001.02...). Scanning a piece that is already
 * marked sold warns "already sold". The stock number stays the truth for how many are left; this only adds the
 * piece-by-piece check for the offline shop.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_units', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('product_id', 36);
            $t->char('variant_id', 36)->nullable();
            $t->string('code', 60)->unique();
            $t->string('status', 10)->default('in_stock');   // in_stock | sold
            $t->char('order_id', 36)->nullable();
            $t->dateTime('sold_at')->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->index(['product_id', 'variant_id', 'status']);
            $t->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_units');
    }
};
