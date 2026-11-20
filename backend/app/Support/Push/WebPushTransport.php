<?php

namespace App\Support\Push;

use App\Support\Secrets;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\VAPID;
use Minishlink\WebPush\WebPush;

/**
 * Real web push (browser and phone notifications) using the minishlink/web-push library. The server identifies itself
 * to the browsers' push services with a VAPID key pair; it is created the first time it is needed and kept encrypted.
 */
final class WebPushTransport implements PushTransport
{
    /** The public half, which the browser needs in order to subscribe. Creates the pair on first use. @return array{public: string, private: string} */
    public static function keys(): array
    {
        $public = Secrets::get(Secrets::VAPID_PUBLIC);
        $private = Secrets::get(Secrets::VAPID_PRIVATE);
        if ($public !== '' && $private !== '') {
            return ['public' => $public, 'private' => $private];
        }
        $k = self::makeKeys();
        Secrets::set(Secrets::VAPID_PUBLIC, $k['publicKey']);
        Secrets::set(Secrets::VAPID_PRIVATE, $k['privateKey']);

        return ['public' => $k['publicKey'], 'private' => $k['privateKey']];
    }

    /**
     * A new P-256 key pair in the base64url form browsers and push services expect. Some Windows PHP installs (XAMPP) have
     * to be told where OpenSSL's config file is; servers on Linux, like the live site, do not.
     *
     * @return array{publicKey: string, privateKey: string}
     */
    private static function makeKeys(): array
    {
        $opts = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
        $cnf = dirname(PHP_BINARY).'/extras/openssl/openssl.cnf';
        if (is_file($cnf)) {
            $opts['config'] = $cnf;
        }
        $key = @openssl_pkey_new($opts) ?: @openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $ec = $key ? (openssl_pkey_get_details($key)['ec'] ?? null) : null;
        if (! $ec) {
            return VAPID::createVapidKeys();   // the library's own attempt (throws a clear error if OpenSSL cannot do it)
        }
        $pad = static fn (string $v): string => str_pad($v, 32, "\0", STR_PAD_LEFT);
        $b64 = static fn (string $v): string => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');

        return ['publicKey' => $b64("\x04".$pad($ec['x']).$pad($ec['y'])), 'privateKey' => $b64($pad($ec['d']))];
    }

    public function send(array $subscriptions, string $payloadJson): array
    {
        $results = [];
        if (! $subscriptions) {
            return $results;
        }
        $keys = self::keys();
        $webPush = new WebPush(['VAPID' => [
            'subject' => (string) config('shop.site_url'), 'publicKey' => $keys['public'], 'privateKey' => $keys['private'],
        ]], ['TTL' => 3600, 'urgency' => 'high'], new \GuzzleHttp\Client(['timeout' => 10, 'connect_timeout' => 5, 'http_errors' => false]));

        $byEndpoint = [];
        foreach ($subscriptions as $s) {
            $byEndpoint[$s['endpoint']] = $s['id'];
            try {
                $webPush->queueNotification(Subscription::create(['endpoint' => $s['endpoint'], 'publicKey' => $s['p256dh'], 'authToken' => $s['auth'], 'contentEncoding' => 'aes128gcm']), $payloadJson);
            } catch (\Throwable $e) {
                $results[$s['id']] = 'failed';
                Log::warning('[push] could not queue a message: '.$e->getMessage());
            }
        }
        try {
            foreach ($webPush->flush() as $report) {
                $id = $byEndpoint[$report->getEndpoint()] ?? null;
                if ($id === null) {
                    continue;
                }
                // 404 / 410 mean the device unsubscribed or the app was removed: forget it.
                $results[$id] = $report->isSuccess() ? 'ok' : ($report->isSubscriptionExpired() ? 'gone' : 'failed');
            }
        } catch (\Throwable $e) {
            Log::warning('[push] sending failed: '.$e->getMessage());
        }

        return $results;
    }
}
