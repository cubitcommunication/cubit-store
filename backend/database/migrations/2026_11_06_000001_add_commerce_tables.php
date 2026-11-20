<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Online-selling tables. Everything here stays dormant until the owner turns
 * the matching switch on in Admin → Settings → Store features.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) {
            // NULL stock = not tracked (always available). A number is decreased by every order.
            $t->integer('stock_quantity')->nullable()->after('price');
            // "Was" price shown struck through when higher than the price.
            $t->decimal('compare_at_price', 12, 2)->nullable()->after('stock_quantity');
        });

        Schema::create('customers', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('name');
            $t->string('email', 191)->unique();
            $t->string('phone', 30)->nullable();
            $t->string('password_hash');
            $t->boolean('accepts_marketing')->default(false);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
        });

        Schema::create('customer_sessions', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('customer_id', 36);
            $t->char('token_hash', 64)->unique();
            $t->dateTime('expires_at');
            $t->dateTime('created_at')->useCurrent();
            $t->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('customer_password_resets', function (Blueprint $t) {
            $t->string('email', 191)->primary();
            $t->char('token_hash', 64);
            $t->dateTime('created_at')->useCurrent();
        });

        Schema::create('customer_addresses', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('customer_id', 36);
            $t->string('name');
            $t->string('phone', 30);
            $t->string('line1');
            $t->string('line2')->nullable();
            $t->string('city', 120);
            $t->string('state', 120);
            $t->string('pincode', 12);
            $t->string('country', 80)->default('India');
            $t->boolean('is_default')->default(false);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('wishlist_items', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('customer_id', 36);
            $t->char('product_id', 36);
            $t->dateTime('created_at')->useCurrent();
            $t->unique(['customer_id', 'product_id']);
            $t->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $t->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
        });

        Schema::create('orders', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->unsignedInteger('number')->unique();           // 1001, 1002, ... shown to customers as #1001
            $t->char('customer_id', 36)->nullable();
            $t->string('access_token', 64);                    // lets a guest open their own thank-you page
            $t->string('name');
            $t->string('email', 191);
            $t->string('phone', 30);
            $t->string('status', 20)->default('open');         // open | cancelled
            $t->string('payment_status', 20)->default('pending'); // pending | paid | failed | refunded
            $t->string('payment_method', 20)->default('cod');  // cod | razorpay
            $t->string('fulfillment_status', 20)->default('unfulfilled'); // unfulfilled | fulfilled
            $t->decimal('subtotal', 12, 2)->default(0);
            $t->decimal('shipping_total', 12, 2)->default(0);
            $t->decimal('cod_fee', 12, 2)->default(0);
            $t->decimal('total', 12, 2)->default(0);
            $t->text('shipping_address');                      // JSON
            $t->text('notes')->nullable();
            $t->string('razorpay_order_id', 80)->nullable();
            $t->string('razorpay_payment_id', 80)->nullable();
            $t->dateTime('cancelled_at')->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->index(['status', 'created_at']);
            $t->index('customer_id');
            $t->index('email');
        });

        Schema::create('order_items', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('order_id', 36);
            $t->char('product_id', 36)->nullable();
            $t->string('name');
            $t->string('sku', 100);
            $t->decimal('price', 12, 2);
            $t->unsignedInteger('quantity');
            $t->decimal('line_total', 12, 2);
            $t->string('image_url', 500)->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
            $t->index('product_id');
        });

        // The order timeline shown in the admin ("Order placed", "Marked as paid", ...).
        Schema::create('order_events', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('order_id', 36);
            $t->string('message', 500);
            $t->dateTime('created_at')->useCurrent();
            $t->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
            $t->index(['order_id', 'created_at']);
        });

        // Store switches. All OFF: the site stays an enquiry catalogue until the owner enables them.
        $now = now()->utc()->format('Y-m-d H:i:s');
        $rows = [
            ['commerce_cart_enabled', '0', 'Cart', 'Turn on the shopping cart and mini-cart. "Add to cart" replaces the single enquiry button.', 10],
            ['commerce_checkout_enabled', '0', 'Checkout', 'Let customers place orders. Needs the cart to be on.', 20],
            ['commerce_wishlist_enabled', '0', 'Wishlist', 'Show the heart icon so customers can save pieces.', 30],
            ['commerce_accounts_enabled', '0', 'Customer accounts', 'Let customers register and see their orders, addresses and wishlist.', 40],
            ['commerce_guest_checkout', '1', 'Guest checkout', 'Allow ordering without creating an account.', 50],
            ['commerce_cod_enabled', '1', 'Cash on Delivery', 'Offer Cash on Delivery at checkout.', 60],
            ['commerce_online_enabled', '0', 'Online payment (Razorpay)', 'Offer UPI / cards / net banking. Needs the Razorpay keys in the server .env file.', 70],
            ['commerce_shipping_flat', '99', 'Shipping fee (₹)', 'Flat shipping fee per order.', 80],
            ['commerce_free_shipping_over', '1999', 'Free shipping over (₹)', 'Orders at or above this amount ship free. Use 0 to always charge shipping.', 90],
            ['commerce_cod_fee', '0', 'Cash on Delivery fee (₹)', 'Extra fee added to Cash on Delivery orders.', 100],
            ['commerce_max_qty', '10', 'Max quantity per item', 'Most of one piece a customer can order at once.', 110],
        ];
        foreach ($rows as [$key, $value, $label, $help, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => 'commerce',
                'label' => $label, 'help' => $help, 'multiline' => 0, 'sort_order' => $sort,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        foreach (['order_events', 'order_items', 'orders', 'wishlist_items', 'customer_addresses', 'customer_password_resets', 'customer_sessions', 'customers'] as $table) {
            Schema::dropIfExists($table);
        }
        DB::table('site_settings')->where('group_name', 'commerce')->delete();
        Schema::table('products', function (Blueprint $t) {
            $t->dropColumn(['stock_quantity', 'compare_at_price']);
        });
    }
};
