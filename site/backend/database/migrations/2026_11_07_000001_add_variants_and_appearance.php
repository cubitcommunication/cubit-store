<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Product variants (Size, Colour, ...) and the storefront "appearance" settings
 * (product-card design, hover actions, grid columns).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) {
            // JSON: [{"name":"Size","values":["6","7"]},{"name":"Colour","values":["Gold","Silver"]}] or NULL.
            $t->text('options')->nullable();
        });

        Schema::create('product_variants', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('product_id', 36);
            $t->string('title');                              // "Gold / 7"
            $t->text('options');                              // JSON: {"Colour":"Gold","Size":"7"}
            $t->string('sku', 100)->nullable();
            $t->decimal('price', 12, 2)->nullable();          // NULL = use the product price
            $t->decimal('compare_at_price', 12, 2)->nullable();
            $t->integer('stock_quantity')->nullable();        // NULL = not tracked
            $t->string('image_url', 500)->nullable();
            $t->integer('sort_order')->default(0);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $t->index(['product_id', 'sort_order'], 'product_variants_product_idx');
        });

        Schema::table('order_items', function (Blueprint $t) {
            $t->char('variant_id', 36)->nullable()->after('product_id');
            $t->string('variant_title')->nullable()->after('name');
        });

        $now = now()->utc()->format('Y-m-d H:i:s');
        $rows = [
            ['ui_card_style', 'classic', 'Product card design', 'classic | overlay | minimal | elegant | quick', 10],
            ['ui_card_ratio', '4/5', 'Image shape', '4/5 (portrait) | 1/1 (square) | 3/4', 20],
            ['ui_grid_columns', '4', 'Products per row (desktop)', '3 | 4 | 5', 30],
            ['ui_card_hover_image', '1', 'Show the second photo on hover', '1 = yes, 0 = no', 40],
            ['ui_card_show_cart', '1', 'Show "Add to cart" on cards', '1 = yes, 0 = no (only when the cart is on)', 50],
            ['ui_card_show_enquiry', '1', 'Show WhatsApp enquiry on cards', '1 = yes, 0 = no', 60],
            ['ui_card_show_wishlist', '1', 'Show the wishlist heart on cards', '1 = yes, 0 = no (only when the wishlist is on)', 70],
            ['ui_card_show_quickview', '1', 'Show "Quick view" on cards', '1 = yes, 0 = no', 80],
            ['ui_card_show_variants', '1', 'Show variant options on cards', '1 = yes, 0 = no', 90],
            ['ui_card_show_material', '1', 'Show material and category label', '1 = yes, 0 = no', 100],
        ];
        foreach ($rows as [$key, $value, $label, $help, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => 'appearance',
                'label' => $label, 'help' => $help, 'multiline' => 0, 'sort_order' => $sort,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->where('group_name', 'appearance')->delete();
        Schema::table('order_items', function (Blueprint $t) {
            $t->dropColumn(['variant_id', 'variant_title']);
        });
        Schema::dropIfExists('product_variants');
        Schema::table('products', function (Blueprint $t) {
            $t->dropColumn('options');
        });
    }
};
