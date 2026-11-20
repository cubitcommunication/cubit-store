<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    // Shiprocket (courier booking). The login can also be saved in the admin (Integrations), where it is stored encrypted.
    'shiprocket' => [
        'email' => env('SHIPROCKET_EMAIL'),
        'password' => env('SHIPROCKET_PASSWORD'),
        'webhook_token' => env('SHIPROCKET_WEBHOOK_TOKEN'),
    ],

    // Razorpay (online payments). Keys live only in the server .env, never in the database.
    'razorpay' => [
        'key_id' => env('RAZORPAY_KEY_ID'),
        'key_secret' => env('RAZORPAY_KEY_SECRET'),
        // Signs the calls Razorpay makes to /api/webhooks/razorpay (set when you create the webhook in the dashboard).
        'webhook_secret' => env('RAZORPAY_WEBHOOK_SECRET'),
    ],

    // Google reCAPTCHA v3. The public site key is set in Admin -> Integrations; the secret stays here.
    'recaptcha' => [
        'secret' => env('RECAPTCHA_SECRET_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
