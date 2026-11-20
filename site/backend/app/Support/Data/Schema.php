<?php

namespace App\Support\Data;

/**
 * Table metadata for the generic query endpoint.
 *
 * The browser never talks to the database directly. It describes what it wants,
 * the API validates that description against the rules below and runs the SQL.
 * Read rules decide what a signed-out visitor may see.
 *
 * Column types: text | int | bool | real | json | ts (UTC timestamp, sent to the
 * browser as an ISO 8601 string such as 2026-09-06T12:57:17Z).
 */
final class Schema
{
    private const TS = ['created_at' => 'ts', 'updated_at' => 'ts'];

    /** @return array<string, array{columns: array<string,string>, publicRead: ?string, writable: bool, publicReadable: bool}> */
    public static function tables(): array
    {
        return [
            'products' => [
                'columns' => [
                    'id' => 'text', 'name' => 'text', 'slug' => 'text', 'sku' => 'text', 'price' => 'real',
                    'stock_quantity' => 'int', 'compare_at_price' => 'real', 'options' => 'json',
                    'description' => 'text', 'material' => 'text', 'category' => 'text', 'subcategory' => 'text',
                    'occasion' => 'json', 'tags' => 'json', 'where_to_wear' => 'text', 'specifications' => 'json',
                    'featured' => 'bool', 'new_arrival' => 'bool', 'navratri_2026' => 'bool', 'diwali_2026' => 'bool',
                    'published' => 'bool', 'archived_at' => 'ts', 'seo_title' => 'text', 'seo_description' => 'text',
                    'seo_image_url' => 'text',
                    'weight_grams' => 'int', 'length_cm' => 'real', 'breadth_cm' => 'real', 'height_cm' => 'real', 'video_url' => 'text',
                ] + self::TS,
                'publicRead' => 'published = 1 AND archived_at IS NULL',
                'writable' => true,
                'publicReadable' => true,
            ],
            'product_images' => [
                'columns' => [
                    'id' => 'text', 'product_id' => 'text', 'image_url' => 'text', 'alt_text' => 'text',
                    'sort_order' => 'int', 'created_at' => 'ts',
                ],
                'publicRead' => 'product_id IN (SELECT id FROM products WHERE published = 1 AND archived_at IS NULL)',
                'writable' => true,
                'publicReadable' => true,
            ],
            'product_variants' => [
                'columns' => [
                    'id' => 'text', 'product_id' => 'text', 'title' => 'text', 'options' => 'json', 'sku' => 'text',
                    'price' => 'real', 'compare_at_price' => 'real', 'stock_quantity' => 'int', 'image_url' => 'text', 'video_url' => 'text',
                    'sort_order' => 'int',
                ] + self::TS,
                'publicRead' => 'product_id IN (SELECT id FROM products WHERE published = 1 AND archived_at IS NULL)',
                'writable' => false,   // changed only through the product save endpoint
                'publicReadable' => true,
            ],
            'categories' => [
                'columns' => [
                    'id' => 'text', 'name' => 'text', 'slug' => 'text', 'sku_code' => 'text', 'parent_id' => 'text', 'description' => 'text',
                    'image' => 'text', 'sort_order' => 'int', 'published' => 'bool', 'seo_title' => 'text',
                    'seo_description' => 'text', 'seo_image_url' => 'text',
                ] + self::TS,
                'publicRead' => 'published = 1',
                'writable' => true,
                'publicReadable' => true,
            ],
            'collections' => [
                'columns' => [
                    'id' => 'text', 'name' => 'text', 'slug' => 'text', 'description' => 'text', 'image' => 'text',
                    'group_name' => 'text', 'category_filter' => 'text', 'material_filter' => 'text',
                    'navratri_only' => 'bool', 'sort_order' => 'int', 'published' => 'bool', 'seo_title' => 'text',
                    'seo_description' => 'text', 'seo_image_url' => 'text', 'occasion_filter' => 'text', 'product_ids' => 'json', 'diwali_only' => 'bool',
                ] + self::TS,
                'publicRead' => 'published = 1',
                'writable' => true,
                'publicReadable' => true,
            ],
            'site_settings' => [
                'columns' => [
                    'id' => 'text', 'key' => 'text', 'value' => 'text', 'group_name' => 'text', 'label' => 'text',
                    'help' => 'text', 'multiline' => 'bool', 'sort_order' => 'int',
                ] + self::TS,
                'publicRead' => null,
                'writable' => true,
                'publicReadable' => true,
            ],
            'site_nav' => [
                'columns' => [
                    'id' => 'text', 'label' => 'text', 'path' => 'text', 'sort_order' => 'int', 'visible' => 'bool',
                    'system' => 'bool', 'badge' => 'text', 'parent_id' => 'text', 'new_tab' => 'bool',
                ] + self::TS,
                'publicRead' => null,
                'writable' => true,
                'publicReadable' => true,
            ],
            'site_media' => [
                'columns' => [
                    'id' => 'text', 'key' => 'text', 'title' => 'text', 'description' => 'text', 'image_url' => 'text',
                    'mobile_image_url' => 'text', 'alt_text' => 'text', 'active' => 'bool', 'sort_order' => 'int',
                ] + self::TS,
                'publicRead' => 'active = 1',
                'writable' => true,
                'publicReadable' => true,
            ],
            'site_media_versions' => [
                'columns' => [
                    'id' => 'text', 'media_id' => 'text', 'image_url' => 'text', 'mobile_image_url' => 'text',
                    'alt_text' => 'text', 'created_at' => 'ts',
                ],
                'publicRead' => null,
                'writable' => true,
                'publicReadable' => false,
            ],
            'slug_redirects' => [
                'columns' => [
                    'id' => 'text', 'entity_type' => 'text', 'source_slug' => 'text', 'target_slug' => 'text',
                    'source_path' => 'text', 'target_path' => 'text',
                ] + self::TS,
                'publicRead' => null,
                'writable' => true,
                'publicReadable' => true,
            ],

            // --- Online selling. Admin can read these; changes go through dedicated, logged endpoints
            // (never the generic writer), and visitors can read none of them.
            'orders' => [
                'columns' => [
                    'id' => 'text', 'number' => 'int', 'customer_id' => 'text', 'name' => 'text', 'email' => 'text',
                    'phone' => 'text', 'status' => 'text', 'payment_status' => 'text', 'payment_method' => 'text', 'channel' => 'text',
                    'fulfillment_status' => 'text', 'subtotal' => 'real', 'discount_total' => 'real', 'coupon_code' => 'text', 'shipping_total' => 'real', 'cod_fee' => 'real',
                    'total' => 'real', 'shipping_address' => 'json', 'notes' => 'text', 'razorpay_order_id' => 'text',
                    'razorpay_payment_id' => 'text', 'cancelled_at' => 'ts',
                    'shiprocket_order_id' => 'text', 'shiprocket_shipment_id' => 'text', 'awb_code' => 'text', 'courier_name' => 'text',
                    'tracking_url' => 'text', 'shipping_status' => 'text', 'label_url' => 'text', 'pickup_info' => 'text',
                ] + self::TS,
                'publicRead' => null,
                'writable' => false,
                'publicReadable' => false,
            ],
            'order_items' => [
                'columns' => [
                    'id' => 'text', 'order_id' => 'text', 'product_id' => 'text', 'variant_id' => 'text', 'variant_title' => 'text', 'name' => 'text', 'sku' => 'text',
                    'price' => 'real', 'quantity' => 'int', 'line_total' => 'real', 'image_url' => 'text', 'created_at' => 'ts',
                ],
                'publicRead' => null,
                'writable' => false,
                'publicReadable' => false,
            ],
            'order_events' => [
                'columns' => ['id' => 'text', 'order_id' => 'text', 'message' => 'text', 'created_at' => 'ts'],
                'publicRead' => null,
                'writable' => false,
                'publicReadable' => false,
            ],
            // password_hash is deliberately not listed, so it can never be selected.
            'customers' => [
                'columns' => [
                    'id' => 'text', 'name' => 'text', 'email' => 'text', 'phone' => 'text', 'address' => 'text', 'source' => 'text', 'accepts_marketing' => 'bool',
                    'date_of_birth' => 'text', 'gift_note' => 'text', 'birthday_gift_year' => 'int',
                ] + self::TS,
                'publicRead' => null,
                'writable' => false,
                'publicReadable' => false,
            ],
            'coupons' => [
                'columns' => [
                    'id' => 'text', 'code' => 'text', 'title' => 'text', 'description' => 'text', 'discount_type' => 'text', 'value' => 'real',
                    'applies_to' => 'text', 'applies_ids' => 'json', 'min_subtotal' => 'real', 'min_quantity' => 'int', 'max_discount' => 'real',
                    'usage_limit' => 'int', 'one_per_customer' => 'bool', 'first_order_only' => 'bool', 'exclude_sale_items' => 'bool',
                    'starts_at' => 'ts', 'ends_at' => 'ts', 'active' => 'bool', 'show_on_site' => 'bool', 'times_used' => 'int',
                ] + self::TS,
                'publicRead' => null,
                'writable' => true,
                'publicReadable' => false,
            ],
            'shipping_zones' => [
                'columns' => [
                    'id' => 'text', 'name' => 'text', 'states' => 'json', 'rate' => 'real', 'free_over' => 'real', 'active' => 'bool', 'sort_order' => 'int',
                ] + self::TS,
                'publicRead' => null,
                'writable' => true,
                'publicReadable' => false,
            ],
            'coupon_redemptions' => [
                'columns' => ['id' => 'text', 'coupon_id' => 'text', 'order_id' => 'text', 'customer_id' => 'text', 'email' => 'text', 'amount' => 'real', 'created_at' => 'ts'],
                'publicRead' => null,
                'writable' => false,
                'publicReadable' => false,
            ],
            'pages' => [
                'columns' => [
                    'id' => 'text', 'title' => 'text', 'slug' => 'text', 'kind' => 'text', 'published' => 'bool', 'blocks' => 'json',
                    'seo_title' => 'text', 'seo_description' => 'text', 'seo_image_url' => 'text',
                    'excerpt' => 'text', 'cover_url' => 'text', 'author' => 'text', 'tags' => 'text', 'published_at' => 'ts',
                ] + self::TS,
                'publicRead' => 'published = 1',
                'writable' => true,
                'publicReadable' => true,
            ],
            'reels' => [
                'columns' => [
                    'id' => 'text', 'title' => 'text', 'video_url' => 'text', 'poster_url' => 'text', 'product_id' => 'text',
                    'link_url' => 'text', 'link_label' => 'text', 'active' => 'bool', 'sort_order' => 'int',
                ] + self::TS,
                'publicRead' => 'active = 1',
                'writable' => true,
                'publicReadable' => true,
            ],
            'newsletter_subscribers' => [
                'columns' => ['id' => 'text', 'email' => 'text', 'created_at' => 'ts'],
                'publicRead' => null,
                'writable' => false,
                'publicReadable' => false,
            ],
            'customer_addresses' => [
                'columns' => [
                    'id' => 'text', 'customer_id' => 'text', 'name' => 'text', 'phone' => 'text', 'line1' => 'text',
                    'line2' => 'text', 'city' => 'text', 'state' => 'text', 'pincode' => 'text', 'country' => 'text',
                    'is_default' => 'bool',
                ] + self::TS,
                'publicRead' => null,
                'writable' => false,
                'publicReadable' => false,
            ],
        ];
    }

    /** Relations that may be embedded in a select, e.g. products -> product_images. */
    public static function relations(): array
    {
        return [
            'products' => [
                'product_images' => ['table' => 'product_images', 'foreignKey' => 'product_id'],
                'product_variants' => ['table' => 'product_variants', 'foreignKey' => 'product_id'],
            ],
            'site_media' => ['site_media_versions' => ['table' => 'site_media_versions', 'foreignKey' => 'media_id']],
            'orders' => [
                'order_items' => ['table' => 'order_items', 'foreignKey' => 'order_id'],
                'order_events' => ['table' => 'order_events', 'foreignKey' => 'order_id'],
            ],
            'customers' => ['customer_addresses' => ['table' => 'customer_addresses', 'foreignKey' => 'customer_id']],
        ];
    }

    public static function table(string $name): array
    {
        $tables = self::tables();
        if (! isset($tables[$name])) {
            throw new QueryError("Unknown table: {$name}");
        }

        return $tables[$name];
    }
}
