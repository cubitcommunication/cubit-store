<?php

use App\Http\Controllers\Admin\AbandonedController;
use App\Http\Controllers\Admin\BulkController;
use App\Http\Controllers\Admin\EmailController;
use App\Http\Controllers\CartRecoveryController;
use App\Http\Controllers\Admin\CatalogueController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\ImageController;
use App\Http\Controllers\Admin\IntegrationController;
use App\Http\Controllers\Admin\MediaLibraryController;
use App\Http\Controllers\Admin\NotificationController;
use App\Http\Controllers\Admin\ReelController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Admin\ShippingController;
use App\Http\Controllers\Admin\SmtpController;
use App\Http\Controllers\Admin\TagController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\ProductSaveController;
use App\Http\Controllers\Admin\StoreStatusController;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CheckoutController;
use App\Http\Controllers\NewsletterController;
use App\Http\Controllers\PublicImageController;
use App\Http\Controllers\QueryController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| JSON API  (served under /api)
|--------------------------------------------------------------------------
| Cookie-authenticated, so every state-changing call also passes through the
| "same-origin" CSRF guard. Admin routes additionally require a valid session.
*/

// Public image files (Apache serves them directly when present; this is the PHP fallback).
Route::get('/public/img/{path}', PublicImageController::class)->where('path', '.*');

/*
| The external storefront API. A client's own website lives on another domain, so these cannot sit behind
| `same-origin`; App\Http\Middleware\StorefrontApi is what guards them instead (add-on off by default, an
| allow-list of origins, and the CORS headers only for those origins). See StorefrontApiController.
*/
Route::middleware('storefront-api')->prefix('public')->group(function () {
    Route::get('/products', [\App\Http\Controllers\StorefrontApiController::class, 'products'])->middleware('throttle:query');
    Route::get('/coupon', [\App\Http\Controllers\StorefrontApiController::class, 'coupon'])->middleware('throttle:query');
    Route::post('/order', [\App\Http\Controllers\StorefrontApiController::class, 'order'])->middleware('throttle:checkout');
});

// Called by Razorpay's servers, not by browsers: no cookies or same-origin rule. The signature is the proof.
Route::post('/webhooks/razorpay', \App\Http\Controllers\RazorpayWebhookController::class)->middleware('throttle:webhook');
Route::post('/webhooks/shiprocket', \App\Http\Controllers\ShiprocketWebhookController::class)->middleware('throttle:webhook');

// The browser installer of a brand-new site (answers 404 once the site has its .env). It must not touch the database,
// the cache or the session before the site is installed, so it sits outside every middleware group.
Route::get('/install/status', [\App\Http\Controllers\InstallController::class, 'status']);
Route::post('/install', [\App\Http\Controllers\InstallController::class, 'store']);

Route::middleware('same-origin')->group(function () {
    // Generic catalogue / site-content queries (reads are public, writes need an admin).
    Route::post('/query', QueryController::class)->middleware(['throttle:query', 'storefront']);

    // The store's name and contact details (the same facts the page carries as window.__BRAND__; used by the dev server).
    Route::get('/brand', fn () => response()->json(\App\Support\Brand::forBrowser()));

    // Storefront password page: is the shop locked for me, and unlock it.
    Route::get('/storefront/status', [\App\Http\Controllers\StorefrontGateController::class, 'status']);
    Route::post('/storefront/unlock', [\App\Http\Controllers\StorefrontGateController::class, 'unlock'])->middleware('throttle:password');

    // Admin sign-in.
    Route::get('/auth/setup-status', [AuthController::class, 'setupStatus']);
    Route::get('/auth/session', [AuthController::class, 'session']);
    Route::post('/auth/first-admin', [AuthController::class, 'firstAdmin'])->middleware('throttle:first-admin');
    Route::post('/auth/sign-in', [AuthController::class, 'signIn'])->middleware('throttle:sign-in');
    Route::post('/auth/sign-out', [AuthController::class, 'signOut']);
    Route::post('/auth/change-password', [AuthController::class, 'changePassword'])->middleware('throttle:password');

    // Footer newsletter form.
    Route::post('/newsletter', [NewsletterController::class, 'subscribe'])->middleware(['storefront', 'throttle:newsletter', 'recaptcha:newsletter,0.5']);

    // Shopping: cart pricing and checkout (each is switched on/off in Admin -> Store features).
    Route::post('/cart/quote', [CheckoutController::class, 'quote'])->middleware(['storefront', 'throttle:query']);
    // Product page: can we deliver to this PIN code, and how soon? (answered through Shiprocket)
    Route::get('/delivery-check', \App\Http\Controllers\DeliveryCheckController::class)->middleware(['storefront', 'throttle:query']);
    Route::get('/promotions', [CheckoutController::class, 'promotions'])->middleware('storefront');
    // Product catalogue for Google Merchant Center and Meta (Facebook / Instagram).
    Route::get('/feeds/products.xml', \App\Http\Controllers\ProductFeedController::class)->middleware(['storefront', 'throttle:query']);
    // Abandoned carts: keep the basket once an e-mail is typed, refill it from an e-mail link, stop reminders.
    Route::post('/cart/capture', [CartRecoveryController::class, 'capture'])->middleware('throttle:checkout');
    Route::get('/cart/recover/{token}', [CartRecoveryController::class, 'recover'])->middleware('throttle:query');
    Route::get('/abandoned/unsubscribe/{token}', [CartRecoveryController::class, 'unsubscribe'])->middleware('throttle:query');
    Route::post('/checkout', [CheckoutController::class, 'place'])->middleware(['storefront', 'throttle:checkout', 'recaptcha:checkout,0.3']);
    Route::post('/checkout/verify-payment', [CheckoutController::class, 'verifyPayment'])->middleware('throttle:checkout');
    Route::get('/orders/{number}', [CheckoutController::class, 'show'])->whereNumber('number');

    // Customer accounts.
    Route::prefix('account')->group(function () {
        Route::get('/session', [AccountController::class, 'session']);
        Route::post('/register', [AccountController::class, 'register'])->middleware(['throttle:account-auth', 'recaptcha:register,0.5']);
        Route::post('/sign-in', [AccountController::class, 'signIn'])->middleware(['throttle:account-auth', 'recaptcha:login,0.5']);
        Route::post('/sign-out', [AccountController::class, 'signOut']);
        Route::post('/forgot-password', [AccountController::class, 'forgotPassword'])->middleware(['throttle:account-auth', 'recaptcha:forgot_password,0.5']);
        Route::post('/reset-password', [AccountController::class, 'resetPassword'])->middleware('throttle:account-auth');
        Route::post('/profile', [AccountController::class, 'updateProfile']);
        Route::post('/change-password', [AccountController::class, 'changePassword'])->middleware('throttle:account-auth');
        Route::get('/addresses', [AccountController::class, 'addresses']);
        Route::post('/addresses', [AccountController::class, 'saveAddress']);
        Route::post('/addresses/delete', [AccountController::class, 'deleteAddress']);
        Route::get('/orders', [AccountController::class, 'orders']);
        Route::get('/orders/{number}', [AccountController::class, 'order'])->whereNumber('number');
        Route::post('/orders/{number}/return', [AccountController::class, 'requestReturn'])->whereNumber('number')->middleware('throttle:checkout');
        Route::get('/wishlist', [AccountController::class, 'wishlist']);
        Route::post('/wishlist/merge', [AccountController::class, 'mergeWishlist']);
        Route::post('/wishlist/toggle', [AccountController::class, 'toggleWishlist']);
    });

    // Everything below needs a signed-in admin.
    Route::middleware(['admin', 'admin.log'])->prefix('admin')->group(function () {
        Route::get('/dashboard', DashboardController::class);
        Route::get('/store-status', StoreStatusController::class);
        Route::get('/emails', [EmailController::class, 'index']);
        Route::post('/emails/settings', [EmailController::class, 'settings']);
        Route::post('/emails/template', [EmailController::class, 'template']);
        Route::post('/emails/preview', [EmailController::class, 'preview']);
        Route::post('/emails/test', [EmailController::class, 'test'])->middleware('throttle:password');
        Route::get('/abandoned', [AbandonedController::class, 'index']);
        Route::post('/abandoned/settings', [AbandonedController::class, 'settings']);
        Route::post('/abandoned/actions', [AbandonedController::class, 'act'])->middleware('throttle:password');
        Route::post('/abandoned/run', [AbandonedController::class, 'run'])->middleware('throttle:password');
        Route::post('/orders/{id}', [OrderController::class, 'update']);
        Route::get('/returns', [\App\Http\Controllers\Admin\ReturnController::class, 'index']);
        Route::post('/returns/{id}', [\App\Http\Controllers\Admin\ReturnController::class, 'update']);
        Route::get('/inventory', [\App\Http\Controllers\Admin\InventoryController::class, 'index']);
        Route::get('/inventory/history', [\App\Http\Controllers\Admin\InventoryController::class, 'history']);
        Route::post('/inventory/generate-skus', [\App\Http\Controllers\Admin\InventoryController::class, 'generateSkus'])->middleware('throttle:password');
        Route::post('/inventory/adjust', [\App\Http\Controllers\Admin\InventoryController::class, 'adjust']);
        // Which paid add-ons are on (the panel hides the screens of the ones that are off).
        Route::get('/features', \App\Http\Controllers\Admin\FeaturesController::class);
        // PAID ADD-ON "offline shop" (FEATURE_OFFLINE_SHOP in .env): scan or search a piece and record a shop sale on the
        // shared stock, plus piece barcodes (one code per physical piece, so a sold piece cannot be sold twice).
        Route::middleware('feature:offline_shop')->group(function () {
            Route::post('/units/create', [\App\Http\Controllers\Admin\UnitController::class, 'create'])->middleware('throttle:shipping');
            Route::get('/units/in-stock', [\App\Http\Controllers\Admin\UnitController::class, 'inStock']);
            Route::get('/shop/lookup', [\App\Http\Controllers\Admin\ShopSaleController::class, 'lookup']);
            Route::post('/shop/sale', [\App\Http\Controllers\Admin\ShopSaleController::class, 'sale'])->middleware('throttle:shipping');
        });
        Route::get('/reports',\App\Http\Controllers\Admin\ReportController::class);
        // Shipping through Shiprocket (create the shipment, book a courier, pickup, label, tracking).
        Route::get('/orders/{id}/shipping', [ShippingController::class, 'show']);
        Route::get('/orders/{id}/shipping/couriers', [ShippingController::class, 'couriers']);
        Route::post('/orders/{id}/shipping/create', [ShippingController::class, 'create'])->middleware('throttle:shipping');
        Route::post('/orders/{id}/shipping/assign', [ShippingController::class, 'assign'])->middleware('throttle:shipping');
        Route::post('/orders/{id}/shipping/pickup', [ShippingController::class, 'pickup'])->middleware('throttle:shipping');
        Route::post('/orders/{id}/shipping/label', [ShippingController::class, 'label'])->middleware('throttle:shipping');
        Route::post('/orders/{id}/shipping/track', [ShippingController::class, 'track'])->middleware('throttle:shipping');
        Route::post('/orders/{id}/shipping/cancel', [ShippingController::class, 'cancel'])->middleware('throttle:shipping');
        Route::post('/customers/bulk-marketing', [CustomerController::class, 'bulkMarketing']);
        Route::post('/subscribers/delete', [CustomerController::class, 'deleteSubscribers']);
        Route::post('/customers/{id}', [CustomerController::class, 'update']);
        Route::post('/customers/{id}/password', [CustomerController::class, 'setPassword'])->middleware('throttle:password');
        Route::get('/export-catalogue', [CatalogueController::class, 'export']);
        Route::post('/products/save', ProductSaveController::class);

        Route::post('/bulk/export', [BulkController::class, 'export']);
        Route::post('/bulk/preview', [BulkController::class, 'preview']);
        Route::post('/bulk/commit', [BulkController::class, 'commit']);

        Route::post('/images', [ImageController::class, 'store']);
        Route::post('/images/delete', [ImageController::class, 'destroy']);
        Route::post('/images/delete-if-unreferenced', [ImageController::class, 'destroyIfUnreferenced']);
        Route::post('/reels/video', [ReelController::class, 'upload']);
        // Notifications: every admin has their own bell and devices; the switches are the main administrator's.
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/seen', [NotificationController::class, 'seen']);
        Route::get('/notifications/push-key', [NotificationController::class, 'pushKey']);
        Route::post('/notifications/subscribe', [NotificationController::class, 'subscribe']);
        Route::post('/notifications/unsubscribe', [NotificationController::class, 'unsubscribe']);
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::post('/users/{id}', [UserController::class, 'update']);
        Route::post('/users/{id}/delete', [UserController::class, 'destroy']);
        Route::get('/activity', [UserController::class, 'activity']);
        Route::get('/tags', [TagController::class, 'index']);
        Route::get('/tags/products', [TagController::class, 'products']);
        Route::post('/tags/rename', [TagController::class, 'rename']);
        Route::post('/tags/delete', [TagController::class, 'delete']);
        Route::post('/tags/assign', [TagController::class, 'assign']);
        Route::get('/media', [MediaLibraryController::class, 'index']);
        Route::get('/media/missing', [MediaLibraryController::class, 'missingFiles']);
        Route::post('/media/upload', [MediaLibraryController::class, 'upload']);
        Route::post('/media/usage', [MediaLibraryController::class, 'usage']);
        Route::post('/media/delete', [MediaLibraryController::class, 'destroy']);

        // Integrations, payment keys and mail servers: the main administrator only (checked on the server).
        Route::middleware('admin.super')->group(function () {
            Route::get('/storefront-password', [\App\Http\Controllers\Admin\StorefrontPasswordController::class, 'show']);
            Route::post('/storefront-password', [\App\Http\Controllers\Admin\StorefrontPasswordController::class, 'save'])->middleware('throttle:password');
            Route::get('/integrations/status', [IntegrationController::class, 'status']);
            Route::post('/integrations/test-razorpay', [IntegrationController::class, 'testRazorpay'])->middleware('throttle:password');
            Route::post('/integrations/secrets', [IntegrationController::class, 'saveSecrets'])->middleware('throttle:password');
            Route::post('/integrations/test-shiprocket', [ShippingController::class, 'test'])->middleware('throttle:password');
            // Signed-in devices: see every one and sign any of them out.
            Route::get('/sessions', [SessionController::class, 'index']);
            Route::post('/sessions/revoke-user', [SessionController::class, 'revokeUser']);
            Route::post('/sessions/revoke-others', [SessionController::class, 'revokeOthers']);
            Route::post('/sessions/{id}/revoke', [SessionController::class, 'revoke']);
            Route::get('/notifications/settings', [NotificationController::class, 'settings']);
            Route::post('/notifications/settings', [NotificationController::class, 'saveSettings']);
            Route::post('/notifications/test', [NotificationController::class, 'test'])->middleware('throttle:password');
            Route::get('/smtp', [SmtpController::class, 'index']);
            Route::post('/smtp', [SmtpController::class, 'store']);
            Route::post('/smtp/assign', [SmtpController::class, 'assign']);
            Route::post('/smtp/{id}', [SmtpController::class, 'update']);
            Route::post('/smtp/{id}/delete', [SmtpController::class, 'destroy']);
            Route::post('/smtp/{id}/default', [SmtpController::class, 'makeDefault']);
            Route::post('/smtp/{id}/test', [SmtpController::class, 'test'])->middleware('throttle:password');
        });
    });
});
