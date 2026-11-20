<?php

return [
    // Public address of the site (used in the sitemap, canonical URLs and OG tags).
    'site_url' => rtrim((string) env('SITE_URL', 'https://example.com'), '/'),

    // When true, requests on any other host name (the test subdomain, www.) are redirected to site_url.
    // Turn on with FORCE_CANONICAL_HOST=true after the domain has gone live.
    'force_canonical_host' => (bool) env('FORCE_CANONICAL_HOST', false),

    // Where new-order alerts are sent. Falls back to the contact e-mail in Website content.
    'order_notify' => env('ORDER_NOTIFY_EMAIL'),

    // The main administrator: the only account that can add, edit or remove other admins and read the activity log.
    // This account can never be deleted, disabled or demoted from the panel.
    'super_admin_email' => strtolower((string) env('SUPER_ADMIN_EMAIL', '')),

    // Paid add-ons, switched on by the vendor in backend/.env (never from the admin panel). All off by default.
    'features' => [
        // Offline shop: Quick sell by barcode, barcode / piece labels, shop customers, online vs shop reports.
        'offline_shop' => (bool) env('FEATURE_OFFLINE_SHOP', false),
        // External storefront API: lets a client's own (hand-built or static) website read this catalogue and
        // write its orders here, so the site keeps its design and the admin gets the orders, stock and coupons.
        'external_storefront' => (bool) env('FEATURE_EXTERNAL_STOREFRONT', false),
    ],

    // Settings for that external storefront API (only read while the add-on above is on).
    'storefront_api' => [
        // Comma-separated list of origins allowed to call it, exactly as a browser sends them,
        // e.g. "https://example.com,https://www.example.com". Empty means browsers are refused.
        'origins' => (string) env('STOREFRONT_API_ORIGINS', ''),
        // A WhatsApp checkout often has no e-mail address. The phone number then becomes the customer's
        // stand-in address at this domain, so their orders and coupon limits still line up.
        'phone_email_domain' => (string) env('STOREFRONT_API_PHONE_EMAIL_DOMAIN', 'phone.invalid'),
    ],

    // Admin session cookie.
    'session_cookie' => 'shop_session',
    'session_days' => 14,

    // Uploaded images and videos always live in the website's own media folder (<site>/media), which the web server serves
    // directly through the /api/public/img/* rewrite rule. Git never touches it, so a deploy keeps every upload.
    'media_path' => null,
    'max_image_bytes' => 8 * 1024 * 1024,
    'max_video_bytes' => 40 * 1024 * 1024,

    // Business vocabulary used by the CSV importer (mirrors frontend/src/config/brand.ts: keep both lists the same).
    'categories' => [],
    'materials' => ['Cotton', 'Leather', 'Metal', 'Wood', 'Glass'],
    'occasions' => ['Everyday', 'Bridal', 'Reception', 'Party'],
];
