<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Commerce;
use App\Support\Mail\SmtpAccounts;
use App\Support\Recaptcha;
use App\Support\Secrets;
use App\Support\Tracking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/** What is connected? Never returns a secret: only whether each one is present. */
class IntegrationController extends Controller
{
    public function status(): JsonResponse
    {
        $id = Tracking::ids();
        $rz = Secrets::razorpay();
        $keyId = $rz['key_id'];
        $secret = $rz['key_secret'];

        return response()->json([
            'liveTracking' => ! app()->isLocal(),
            'tracking' => [
                'ga4' => $id['ga4'], 'ga4Mode' => $id['ga4_mode'], 'gtm' => $id['gtm'], 'clarity' => $id['clarity'], 'meta' => $id['meta'],
                'googleVerify' => $id['google_verify'] !== null, 'bingVerify' => $id['bing_verify'] !== null,
            ],
            'recaptcha' => ['siteKey' => $id['recaptcha'] !== null, 'secret' => Recaptcha::secret() !== null, 'secretSource' => Secrets::source(Secrets::RECAPTCHA_SECRET), 'active' => Recaptcha::active()],
            'razorpay' => [
                'keyId' => $keyId !== '', 'keyIdValue' => $keyId, 'secret' => $secret !== '',
                'keyIdSource' => Secrets::source(Secrets::RAZORPAY_KEY_ID), 'secretSource' => Secrets::source(Secrets::RAZORPAY_KEY_SECRET),
                'webhookSource' => Secrets::source(Secrets::RAZORPAY_WEBHOOK_SECRET),
                'mode' => str_starts_with($keyId, 'rzp_live_') ? 'live' : (str_starts_with($keyId, 'rzp_test_') ? 'test' : null),
                'webhookSecret' => $rz['webhook_secret'] !== '',
                'webhookUrl' => rtrim((string) config('shop.site_url'), '/').'/api/webhooks/razorpay',
                'webhookLastReceived' => \Illuminate\Support\Facades\Cache::get(\App\Http\Controllers\RazorpayWebhookController::CACHE_KEY),
                'switchedOn' => Commerce::on('commerce_online_enabled'),
                'ready' => (bool) Commerce::onlinePaymentReady(),
            ],
            'mail' => ['accounts' => count(SmtpAccounts::all()), 'configured' => SmtpAccounts::configured()],
            'shiprocket' => [
                'email' => Secrets::get(Secrets::SHIPROCKET_EMAIL), 'emailSource' => Secrets::source(Secrets::SHIPROCKET_EMAIL),
                'password' => Secrets::get(Secrets::SHIPROCKET_PASSWORD) !== '', 'passwordSource' => Secrets::source(Secrets::SHIPROCKET_PASSWORD),
                'webhookSource' => Secrets::source(Secrets::SHIPROCKET_WEBHOOK_TOKEN),
                'webhookUrl' => rtrim((string) config('shop.site_url'), '/').'/api/webhooks/shiprocket',
                'webhookLastReceived' => \Illuminate\Support\Facades\Cache::get(\App\Http\Controllers\ShiprocketWebhookController::CACHE_KEY),
                'enabled' => \App\Support\Shiprocket::setting('shiprocket_enabled') === '1', 'ready' => \App\Support\Shiprocket::enabled(),
                'pickupLocation' => \App\Support\Shiprocket::setting('shiprocket_pickup_location'),
            ],
        ]);
    }

    /**
     * Saves or removes secret keys. Values are encrypted before they are stored and are never sent back.
     * A field that is left out (or empty) is left as it is; to remove a saved value, name it in "clear".
     */
    public function saveSecrets(Request $request): JsonResponse
    {
        $data = $request->validate([
            'razorpay_key_id' => ['nullable', 'string', 'regex:/^rzp_(live|test)_[A-Za-z0-9]{8,40}$/'],
            'razorpay_key_secret' => ['nullable', 'string', 'min:8', 'max:100', 'regex:/^\S+$/'],
            'razorpay_webhook_secret' => ['nullable', 'string', 'min:8', 'max:200', 'regex:/^\S+$/'],
            'recaptcha_secret' => ['nullable', 'string', 'regex:/^6L[A-Za-z0-9_\-]{30,50}$/'],
            'shiprocket_email' => ['nullable', 'email', 'max:160'],
            'shiprocket_password' => ['nullable', 'string', 'min:6', 'max:200'],
            'shiprocket_webhook_token' => ['nullable', 'string', 'min:8', 'max:100', 'regex:/^\S+$/'],
            'clear' => ['nullable', 'array'],
            'clear.*' => ['string', 'in:razorpay_key_id,razorpay_key_secret,razorpay_webhook_secret,recaptcha_secret,shiprocket_email,shiprocket_password,shiprocket_webhook_token'],
        ], [
            'razorpay_key_id.regex' => 'The Razorpay key ID should look like rzp_live_… or rzp_test_….',
            'razorpay_key_secret.regex' => 'The key secret must not contain spaces.',
            'razorpay_key_secret.min' => 'That key secret looks too short.',
            'razorpay_webhook_secret.min' => 'That webhook secret looks too short.',
            'razorpay_webhook_secret.regex' => 'The webhook secret must not contain spaces.',
            'recaptcha_secret.regex' => 'The reCAPTCHA secret key should start with 6L.',
            'shiprocket_password.min' => 'That password looks too short.',
            'shiprocket_webhook_token.regex' => 'The webhook token must not contain spaces.',
            'shiprocket_webhook_token.min' => 'That webhook token looks too short.',
        ]);

        $saved = [];
        foreach (['razorpay_key_id', 'razorpay_key_secret', 'razorpay_webhook_secret', 'recaptcha_secret', 'shiprocket_email', 'shiprocket_password', 'shiprocket_webhook_token'] as $key) {
            if (isset($data[$key]) && $data[$key] !== '') {
                Secrets::set($key, trim($data[$key]));
                $saved[] = $key;
            }
        }
        foreach ((array) ($data['clear'] ?? []) as $key) {
            Secrets::clear($key);
            $saved[] = $key;
        }

        // A changed login means the cached Shiprocket access token and pickup list belong to the old one.
        if (array_intersect($saved, ['shiprocket_email', 'shiprocket_password'])) {
            \App\Support\Shiprocket::forgetToken();
            \Illuminate\Support\Facades\Cache::forget('shiprocket_pickups');
        }

        // The activity log records which keys were changed, never their values.
        return response()->json(['ok' => true, 'changed' => $saved]);
    }

    /** Asks Razorpay whether the saved keys are accepted (a read-only request: it creates nothing). */
    public function testRazorpay(): JsonResponse
    {
        $rz = Secrets::razorpay();
        $keyId = $rz['key_id'];
        $secret = $rz['key_secret'];
        if ($keyId === '' || $secret === '') {
            return response()->json(['ok' => false, 'message' => 'Razorpay key ID and key secret are not saved yet.']);
        }

        try {
            $res = Http::withBasicAuth($keyId, $secret)->timeout(15)->get('https://api.razorpay.com/v1/orders', ['count' => 1]);
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => 'Could not reach Razorpay from the server. Please try again.']);
        }

        if ($res->successful()) {
            return response()->json(['ok' => true, 'message' => 'Razorpay accepted the keys ('.(str_starts_with($keyId, 'rzp_live_') ? 'live' : 'test').' mode).']);
        }

        return response()->json(['ok' => false, 'message' => $res->status() === 401
            ? 'Razorpay rejected the keys. Check that the key ID and key secret belong together and are for the same mode (test or live).'
            : 'Razorpay answered with an error ('.$res->status().').']);
    }
}
