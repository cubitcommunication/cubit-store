<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Shopper sign-in. Same design as the admin session: an opaque HttpOnly cookie,
 * with only a SHA-256 hash of it stored, in a separate cookie and table so a
 * customer session can never be mistaken for an admin session.
 */
final class CustomerAuth
{
    public const COOKIE = 'shop_customer';
    private const DAYS = 30;

    public static function start(string $customerId, Request $request): Cookie
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $expires = now()->utc()->addDays(self::DAYS);
        DB::table('customer_sessions')->insert([
            'id' => (string) Str::uuid(), 'customer_id' => $customerId, 'token_hash' => hash('sha256', $token),
            'expires_at' => $expires->format('Y-m-d H:i:s'), 'created_at' => now()->utc()->format('Y-m-d H:i:s'),
        ]);

        return new Cookie(self::COOKIE, $token, $expires->getTimestamp(), '/', null, $request->isSecure(), true, false, Cookie::SAMESITE_LAX);
    }

    public static function forgetCookie(Request $request): Cookie
    {
        return new Cookie(self::COOKIE, '', 1, '/', null, $request->isSecure(), true, false, Cookie::SAMESITE_LAX);
    }

    public static function end(Request $request): void
    {
        $token = $request->cookie(self::COOKIE);
        if (is_string($token) && $token !== '') {
            DB::table('customer_sessions')->where('token_hash', hash('sha256', $token))->delete();
        }
    }

    public static function endAll(string $customerId): void
    {
        DB::table('customer_sessions')->where('customer_id', $customerId)->delete();
    }

    /** @return object|null the customers row (without password_hash) */
    public static function current(Request $request): ?object
    {
        if ($request->attributes->has('shop_customer')) {
            return $request->attributes->get('shop_customer');
        }
        $customer = null;
        $token = $request->cookie(self::COOKIE);
        if (is_string($token) && $token !== '') {
            $row = DB::table('customer_sessions as s')->join('customers as c', 'c.id', '=', 's.customer_id')
                ->where('s.token_hash', hash('sha256', $token))
                ->select('c.id', 'c.name', 'c.email', 'c.phone', 'c.accepts_marketing', 'c.date_of_birth', 'c.gift_note', 's.expires_at')->first();
            if ($row && strtotime($row->expires_at.' UTC') >= time()) {
                unset($row->expires_at);
                $customer = $row;
            } elseif ($row) {
                DB::table('customer_sessions')->where('token_hash', hash('sha256', $token))->delete();
            }
        }
        $request->attributes->set('shop_customer', $customer);

        return $customer;
    }

    public static function hash(string $password): string
    {
        return Hash::make($password);
    }

    public static function check(string $password, string $hash): bool
    {
        return $hash !== '' && Hash::check($password, $hash);
    }

    public static function present(object $c): array
    {
        return ['id' => $c->id, 'name' => $c->name, 'email' => $c->email, 'phone' => $c->phone, 'acceptsMarketing' => (bool) $c->accepts_marketing,
            'dateOfBirth' => $c->date_of_birth ?? null, 'giftNote' => $c->gift_note ?? null];
    }
}
