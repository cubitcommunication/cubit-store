<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Shiprocket (courier booking and tracking):
 *  - orders remember their Shiprocket order, shipment, courier, tracking number and latest status;
 *  - products can carry a packed weight and size (Shiprocket needs them to price and book a shipment);
 *  - the non-secret settings live in site_settings (group "integrations", so only the main administrator can change them).
 * The Shiprocket login itself is stored encrypted in secure_settings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->string('shiprocket_order_id', 40)->nullable();
            $t->string('shiprocket_shipment_id', 40)->nullable();
            $t->string('awb_code', 60)->nullable();
            $t->string('courier_name', 120)->nullable();
            $t->string('tracking_url', 500)->nullable();
            $t->string('shipping_status', 80)->nullable();
            $t->string('label_url', 500)->nullable();
            $t->string('pickup_info', 120)->nullable();
            $t->index('awb_code', 'orders_awb_idx');
        });

        Schema::table('products', function (Blueprint $t) {
            $t->unsignedInteger('weight_grams')->nullable();
            $t->decimal('length_cm', 6, 1)->nullable();
            $t->decimal('breadth_cm', 6, 1)->nullable();
            $t->decimal('height_cm', 6, 1)->nullable();
        });

        $now = now()->utc()->format('Y-m-d H:i:s');
        $rows = [
            ['shiprocket_enabled', 'Shiprocket shipping', '0', '1 = book couriers and show delivery checks through Shiprocket.', 500],
            ['shiprocket_pickup_location', 'Shiprocket pickup location', '', 'The pickup address name from Shiprocket (Settings → Pickup addresses).', 510],
            ['shiprocket_default_weight_g', 'Default parcel weight (grams)', '300', 'Used for a product that has no weight of its own.', 520],
            ['shiprocket_default_length_cm', 'Default parcel length (cm)', '15', 'Used when products have no size of their own.', 530],
            ['shiprocket_default_breadth_cm', 'Default parcel breadth (cm)', '12', '', 540],
            ['shiprocket_default_height_cm', 'Default parcel height (cm)', '5', '', 550],
        ];
        foreach ($rows as [$key, $label, $value, $help, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => 'integrations', 'label' => $label, 'help' => $help,
                'multiline' => 0, 'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'like', 'shiprocket_%')->delete();
        Schema::table('products', function (Blueprint $t) {
            $t->dropColumn(['weight_grams', 'length_cm', 'breadth_cm', 'height_cm']);
        });
        Schema::table('orders', function (Blueprint $t) {
            $t->dropIndex('orders_awb_idx');
            $t->dropColumn(['shiprocket_order_id', 'shiprocket_shipment_id', 'awb_code', 'courier_name', 'tracking_url', 'shipping_status', 'label_url', 'pickup_info']);
        });
    }
};
