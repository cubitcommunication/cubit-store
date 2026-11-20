<?php

/*
 * The store's identity: the ONE place the server (SEO tags, e-mails, product feed, robots.txt) and the web app (through
 * window.__BRAND__, see SpaController) read the name, contact details and social links from.
 *
 * Each value is set in backend/.env (BRAND_NAME=..., see .env.example). The defaults below are neutral; the
 * installer writes every one of these lines into the new site's .env.
 */

return [
    'name' => (string) env('BRAND_NAME', 'Your Store'),
    'tagline' => (string) env('BRAND_TAGLINE', ''),
    // One sentence about the store, used as the default page description.
    'description' => (string) env('BRAND_DESCRIPTION', 'Shop online.'),
    'founded_label' => (string) env('BRAND_FOUNDED_LABEL', ''),

    // Shown on the contact page and used for WhatsApp enquiry links (digits only, with country code).
    'phone_display' => (string) env('BRAND_PHONE_DISPLAY', ''),
    'phone_e164' => (string) env('BRAND_PHONE_E164', ''),

    'support_email' => (string) env('BRAND_SUPPORT_EMAIL', ''),
    // The address orders are sent from. MAIL_FROM_ADDRESS (the SMTP login) still wins when it is set.
    'orders_email' => (string) env('BRAND_ORDERS_EMAIL', ''),

    // Money, dates and place. Online payments (Razorpay) are in rupees (INR), so change these only together with the payment gateway.
    'currency_symbol' => (string) env('BRAND_CURRENCY_SYMBOL', '₹'),
    'currency_code' => (string) env('BRAND_CURRENCY_CODE', 'INR'),
    'locale' => (string) env('BRAND_LOCALE', 'en-IN'),
    'timezone' => (string) env('BRAND_TIMEZONE', 'Asia/Kolkata'),
    'country' => (string) env('BRAND_COUNTRY', 'India'),

    'instagram_handle' => (string) env('BRAND_INSTAGRAM_HANDLE', ''),
    'instagram_url' => (string) env('BRAND_INSTAGRAM_URL', ''),
    'facebook_label' => (string) env('BRAND_FACEBOOK_LABEL', ''),
    'facebook_url' => (string) env('BRAND_FACEBOOK_URL', ''),
];
