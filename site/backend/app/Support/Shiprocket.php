<?php

namespace App\Support;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Thin client for the Shiprocket API (https://apiv2.shiprocket.in/v1/external). The login (an API user's e-mail and
 * password) is saved encrypted in the admin (Integrations); the access token Shiprocket returns is kept in the cache
 * and renewed when it expires. Every failure is turned into a ShiprocketException with a message fit to show the owner.
 */
final class Shiprocket
{
    private const BASE = 'https://apiv2.shiprocket.in/v1/external';
    private const TOKEN_KEY = 'shiprocket_access_token';

    /** Is a Shiprocket login saved? */
    public static function hasLogin(): bool
    {
        return Secrets::get(Secrets::SHIPROCKET_EMAIL) !== '' && Secrets::get(Secrets::SHIPROCKET_PASSWORD) !== '';
    }

    /** Switched on in Integrations and a login is saved. */
    public static function enabled(): bool
    {
        return self::setting('shiprocket_enabled') === '1' && self::hasLogin();
    }

    public static function setting(string $key): string
    {
        try {
            return trim((string) DB::table('site_settings')->where('key', $key)->value('value'));
        } catch (\Throwable) {
            return '';
        }
    }

    /** Forget the saved access token (after the login changes). */
    public static function forgetToken(): void
    {
        Cache::forget(self::TOKEN_KEY);
    }

    /** @throws ShiprocketException */
    private static function token(bool $fresh = false): string
    {
        if (! $fresh && ($cached = Cache::get(self::TOKEN_KEY))) {
            return (string) $cached;
        }
        if (! self::hasLogin()) {
            throw new ShiprocketException('Shiprocket is not connected yet. The main administrator can add the login in Integrations.');
        }
        try {
            $res = Http::acceptJson()->timeout(20)->post(self::BASE.'/auth/login', [
                'email' => Secrets::get(Secrets::SHIPROCKET_EMAIL), 'password' => Secrets::get(Secrets::SHIPROCKET_PASSWORD),
            ]);
        } catch (ConnectionException) {
            throw new ShiprocketException('Could not reach Shiprocket. Please try again in a moment.');
        }
        if (! $res->successful() || ! is_string($res->json('token')) || $res->json('token') === '') {
            throw new ShiprocketException($res->status() === 403 || $res->status() === 401 || $res->status() === 400
                ? 'Shiprocket rejected the login. Use the e-mail and password of an API user (Shiprocket → Settings → API → Configure → Create an API user).'
                : 'Shiprocket could not sign in (error '.$res->status().').');
        }
        // Tokens last 10 days; renew a little earlier.
        Cache::put(self::TOKEN_KEY, $res->json('token'), now()->addDays(8));

        return (string) $res->json('token');
    }

    /**
     * @param  array<string, mixed>  $data  query string for GET, JSON body otherwise
     * @return array<string, mixed>
     *
     * @throws ShiprocketException
     */
    public static function call(string $method, string $path, array $data = []): array
    {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $token = self::token($attempt > 0);
            try {
                $req = Http::withToken($token)->acceptJson()->timeout(30);
                $res = strtoupper($method) === 'GET' ? $req->get(self::BASE.$path, $data) : $req->post(self::BASE.$path, $data);
            } catch (ConnectionException) {
                throw new ShiprocketException('Could not reach Shiprocket. Please try again in a moment.');
            }
            if ($res->status() === 401 && $attempt === 0) {
                self::forgetToken();

                continue;
            }
            if (! $res->successful()) {
                throw new ShiprocketException(self::errorText($res->json(), $res->status()));
            }

            return (array) ($res->json() ?? []);
        }

        throw new ShiprocketException('Shiprocket did not accept the saved login.');
    }

    /** The most useful sentence in a Shiprocket error reply. @param mixed $body */
    private static function errorText(mixed $body, int $status): string
    {
        if (is_array($body)) {
            $parts = [];
            if (isset($body['message']) && is_string($body['message'])) {
                $parts[] = $body['message'];
            }
            foreach ((array) ($body['errors'] ?? []) as $field => $messages) {
                $parts[] = (is_string($field) ? $field.': ' : '').implode(' ', array_map('strval', (array) $messages));
            }
            if ($parts) {
                return 'Shiprocket: '.mb_substr(implode(' ', $parts), 0, 400);
            }
        }

        return 'Shiprocket answered with an error ('.$status.').';
    }

    /* ------------------------------------------------------------------ account */

    /**
     * Signs in and lists the pickup addresses on the account.
     *
     * @return list<array{name: string, pincode: string, city: string}>
     *
     * @throws ShiprocketException
     */
    public static function testConnection(): array
    {
        self::token(true);

        return self::pickupLocations(true);
    }

    /** @return list<array{name: string, pincode: string, city: string}> */
    public static function pickupLocations(bool $fresh = false): array
    {
        if ($fresh) {
            Cache::forget('shiprocket_pickups');
        }

        return Cache::remember('shiprocket_pickups', now()->addHour(), function () {
            $res = self::call('GET', '/settings/company/pickup');
            $out = [];
            foreach ((array) ($res['data']['shipping_address'] ?? []) as $a) {
                if (! empty($a['pickup_location'])) {
                    $out[] = ['name' => (string) $a['pickup_location'], 'pincode' => (string) ($a['pin_code'] ?? ''), 'city' => (string) ($a['city'] ?? '')];
                }
            }

            return $out;
        });
    }

    /** The pincode couriers collect from, from the chosen pickup address. */
    public static function pickupPincode(): ?string
    {
        $name = self::setting('shiprocket_pickup_location');
        foreach (self::pickupLocations() as $p) {
            if ($name === '' || $p['name'] === $name) {
                return $p['pincode'] !== '' ? $p['pincode'] : null;
            }
        }

        return null;
    }

    /* ------------------------------------------------------------------ rates */

    /**
     * Couriers that can carry a parcel, with price and estimated days.
     *
     * @return array{couriers: list<array<string, mixed>>, recommended: ?int}
     *
     * @throws ShiprocketException
     */
    public static function couriers(string $pickupPin, string $deliveryPin, float $weightKg, bool $cod): array
    {
        $res = self::call('GET', '/courier/serviceability/', [
            'pickup_postcode' => $pickupPin, 'delivery_postcode' => $deliveryPin, 'weight' => max(0.05, round($weightKg, 3)), 'cod' => $cod ? 1 : 0,
        ]);
        $list = [];
        foreach ((array) ($res['data']['available_courier_companies'] ?? []) as $c) {
            $list[] = [
                'id' => (int) ($c['courier_company_id'] ?? 0), 'name' => (string) ($c['courier_name'] ?? ''),
                'rate' => (float) ($c['rate'] ?? $c['freight_charge'] ?? 0), 'etd' => (string) ($c['etd'] ?? ''),
                'days' => isset($c['estimated_delivery_days']) ? (int) $c['estimated_delivery_days'] : null,
                'rating' => isset($c['rating']) ? round((float) $c['rating'], 1) : null,
            ];
        }
        $rec = $res['data']['recommended_courier_company_id'] ?? null;

        return ['couriers' => $list, 'recommended' => $rec !== null ? (int) $rec : null];
    }

    /* ------------------------------------------------------------------ shipments */

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     *
     * @throws ShiprocketException
     */
    public static function createOrder(array $payload): array
    {
        $res = self::call('POST', '/orders/create/adhoc', $payload);
        if (empty($res['order_id']) || empty($res['shipment_id'])) {
            throw new ShiprocketException('Shiprocket did not create the order. '.self::errorText($res, 200));
        }

        return $res;
    }

    /**
     * Books a courier and gets the tracking number (AWB). $courierId null lets Shiprocket choose.
     *
     * @return array{awb: string, courier: string}
     *
     * @throws ShiprocketException
     */
    public static function assignAwb(string $shipmentId, ?int $courierId): array
    {
        $res = self::call('POST', '/courier/assign/awb', array_filter(['shipment_id' => (int) $shipmentId, 'courier_id' => $courierId], fn ($v) => $v !== null));
        $d = (array) ($res['response']['data'] ?? $res['data'] ?? []);
        $awb = (string) ($d['awb_code'] ?? '');
        if (($res['awb_assign_status'] ?? 1) != 1 || $awb === '') {
            $why = (string) ($d['awb_assign_error'] ?? $res['message'] ?? '');

            throw new ShiprocketException($why !== '' ? 'Shiprocket could not book the courier: '.$why : 'Shiprocket could not book a courier. Check the wallet balance and the parcel size.');
        }

        return ['awb' => $awb, 'courier' => (string) ($d['courier_name'] ?? '')];
    }

    /** @throws ShiprocketException */
    public static function schedulePickup(string $shipmentId): string
    {
        $res = self::call('POST', '/courier/generate/pickup', ['shipment_id' => [(int) $shipmentId]]);
        if (($res['pickup_status'] ?? 1) != 1) {
            throw new ShiprocketException('Shiprocket could not schedule the pickup. '.self::errorText($res, 200));
        }
        $when = $res['response']['pickup_scheduled_date'] ?? $res['pickup_scheduled_date'] ?? null;

        return is_string($when) && $when !== '' ? $when : 'Requested';
    }

    /** @throws ShiprocketException */
    public static function label(string $shipmentId): string
    {
        $res = self::call('POST', '/courier/generate/label', ['shipment_id' => [(int) $shipmentId]]);
        $url = (string) ($res['label_url'] ?? '');
        if ($url === '' || ! preg_match('#^https://#i', $url)) {
            throw new ShiprocketException('Shiprocket did not return a label yet. Please try again in a minute.');
        }

        return $url;
    }

    /**
     * Latest status of a parcel.
     *
     * @return array{status: string, url: ?string, etd: ?string}
     *
     * @throws ShiprocketException
     */
    public static function track(string $awb): array
    {
        $res = self::call('GET', '/courier/track/awb/'.rawurlencode($awb));
        $t = (array) ($res['tracking_data'] ?? []);
        $latest = (array) (($t['shipment_track'][0] ?? []) ?: []);
        $status = trim((string) ($latest['current_status'] ?? ''));
        if ($status === '') {
            $status = trim((string) ($t['track_status'] ?? '')) === '1' ? 'In transit' : trim((string) ($t['error'] ?? 'No updates yet'));
        }
        $url = (string) ($t['track_url'] ?? '');

        return ['status' => mb_substr($status, 0, 80), 'url' => preg_match('#^https://#i', $url) ? $url : null, 'etd' => isset($t['etd']) ? (string) $t['etd'] : null];
    }

    /** @throws ShiprocketException */
    public static function cancel(string $shiprocketOrderId): void
    {
        self::call('POST', '/orders/cancel', ['ids' => [(int) $shiprocketOrderId]]);
    }
}
