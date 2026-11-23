<?php

/*
 * Cross-origin rules.
 *
 * Laravel's default is to answer every /api/* route with "Access-Control-Allow-Origin: *", which would let any
 * website on the internet read this store's API from a visitor's browser. This app does not need that: its own
 * React storefront and admin are served from the same origin, and every other route is behind `same-origin`.
 *
 * The one exception is the external storefront API, which exists to be called by a client's own website. Those
 * three routes are listed here, and the origins allowed to call them are the same STOREFRONT_API_ORIGINS list the
 * gate middleware checks, so there is one place to add a website.
 */
return [
    'paths' => ['api/public/products', 'api/public/coupon', 'api/public/order'],

    'allowed_methods' => ['GET', 'POST', 'OPTIONS'],

    'allowed_origins' => array_values(array_filter(array_map(
        fn ($o) => rtrim(trim($o), '/'),
        explode(',', (string) env('STOREFRONT_API_ORIGINS', ''))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Content-Type', 'Accept'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => false,
];
