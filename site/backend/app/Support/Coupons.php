<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Discount codes. Everything is decided on the server from the database: the browser only
 * sends the code the customer typed, never an amount.
 */
final class Coupons
{
    public static function normalise(?string $code): string
    {
        return strtoupper(preg_replace('/\s+/', '', (string) $code) ?? '');
    }

    /** disabled | scheduled | expired | exhausted | active */
    public static function status(object $c): string
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        if (! $c->active) {
            return 'disabled';
        }
        if ($c->starts_at && $c->starts_at > $now) {
            return 'scheduled';
        }
        if ($c->ends_at && $c->ends_at < $now) {
            return 'expired';
        }
        if ($c->usage_limit !== null && (int) $c->times_used >= (int) $c->usage_limit) {
            return 'exhausted';
        }

        return 'active';
    }

    private static function money(float $v): string
    {
        return \App\Support\Brand::currencySymbol().rtrim(rtrim(number_format($v, 2, '.', ','), '0'), '.');
    }

    /** "10% OFF", "200 OFF" with the currency symbol in front or "FREE SHIPPING". */
    public static function label(object $c): string
    {
        return match ($c->discount_type) {
            'fixed' => self::money((float) $c->value).' OFF',
            'free_shipping' => 'FREE SHIPPING',
            default => rtrim(rtrim(number_format((float) $c->value, 2), '0'), '.').'% OFF',
        };
    }

    /** Short conditions line: "On orders above 999 · Max 500 off · Ends 15 Nov". */
    public static function terms(object $c): string
    {
        $parts = [];
        if ($c->min_subtotal !== null && (float) $c->min_subtotal > 0) {
            $parts[] = 'On orders above '.self::money((float) $c->min_subtotal);
        }
        if ($c->min_quantity) {
            $parts[] = 'Buy '.$c->min_quantity.'+ pieces';
        }
        if ($c->discount_type === 'percentage' && $c->max_discount !== null) {
            $parts[] = 'Up to '.self::money((float) $c->max_discount).' off';
        }
        if ($c->applies_to !== 'all') {
            $parts[] = 'Selected '.($c->applies_to === 'products' ? 'pieces' : ($c->applies_to === 'categories' ? 'categories' : ($c->applies_to === 'tags' ? 'tags' : 'materials')));
        }
        if ($c->first_order_only) {
            $parts[] = 'First order only';
        }
        if ($c->ends_at) {
            $parts[] = 'Ends '.\Carbon\Carbon::parse($c->ends_at, 'UTC')->setTimezone(\App\Support\Brand::timezone())->format('j M');
        }

        return implode(' · ', $parts);
    }

    /** The coupons promoted on the storefront (switched on, running now, not used up). */
    public static function promoted(): array
    {
        return DB::table('coupons')->where('show_on_site', 1)->where('active', 1)->orderBy('created_at', 'desc')->get()
            ->filter(fn ($c) => self::status($c) === 'active')
            ->map(fn ($c) => [
                'code' => $c->code, 'title' => $c->title, 'label' => self::label($c), 'type' => $c->discount_type,
                'description' => $c->description ?: ($c->title ?: ''), 'terms' => self::terms($c),
                'minSubtotal' => $c->min_subtotal !== null ? (float) $c->min_subtotal : null,
            ])->values()->all();
    }

    /** True when this e-mail / customer has placed an order before (cancelled orders do not count). */
    private static function hasOrdered(?string $email, ?string $customerId): bool
    {
        return DB::table('orders')->where('status', '!=', 'cancelled')->where(function ($q) use ($email, $customerId) {
            if ($email) {
                $q->orWhereRaw('LOWER(email) = ?', [strtolower($email)]);
            }
            if ($customerId) {
                $q->orWhere('customer_id', $customerId);
            }
        })->exists();
    }

    /**
     * Works out the discount for a priced basket.
     *
     * @param  array<int, array<string,mixed>>  $lines  quote lines (only those without an issue count)
     * @return array{coupon: ?array, discount: float, freeShipping: bool, error: ?string}
     */
    public static function evaluate(?string $code, array $lines, float $subtotal, ?string $email, ?string $customerId, bool $lock = false): array
    {
        $none = ['coupon' => null, 'discount' => 0.0, 'freeShipping' => false, 'error' => null];
        $code = self::normalise($code);
        if ($code === '') {
            return $none;
        }
        $fail = fn (string $message) => ['error' => $message] + $none;

        $query = DB::table('coupons')->where('code', $code);
        if ($lock) {
            $query->lockForUpdate();
        }
        $c = $query->first();
        if (! $c) {
            return $fail("That code isn't valid.");
        }
        switch (self::status($c)) {
            case 'disabled':
                return $fail("That code isn't valid.");
            case 'scheduled':
                return $fail("This code isn't active yet.");
            case 'expired':
                return $fail('This code has expired.');
            case 'exhausted':
                return $fail('This code has reached its usage limit.');
        }

        // Who may use it (checked once the customer's e-mail is known, i.e. at checkout).
        if (($c->first_order_only || $c->one_per_customer) && ($email || $customerId)) {
            if ($c->first_order_only && self::hasOrdered($email, $customerId)) {
                return $fail('This code is for first orders only.');
            }
            if ($c->one_per_customer && DB::table('coupon_redemptions')->where('coupon_id', $c->id)->where(function ($q) use ($email, $customerId) {
                if ($email) {
                    $q->orWhereRaw('LOWER(email) = ?', [strtolower($email)]);
                }
                if ($customerId) {
                    $q->orWhere('customer_id', $customerId);
                }
            })->exists()) {
                return $fail("You've already used this code.");
            }
        }

        // Eligible lines.
        $ids = json_decode((string) $c->applies_ids, true);
        $ids = is_array($ids) ? array_map(fn ($v) => strtolower((string) $v), $ids) : [];
        $eligible = array_values(array_filter($lines, function ($l) use ($c, $ids) {
            if ($l['issue'] !== null) {
                return false;
            }
            if ($c->exclude_sale_items && $l['compareAt'] !== null) {
                return false;
            }

            return match ($c->applies_to) {
                'products' => in_array(strtolower((string) $l['id']), $ids, true),
                'categories' => in_array(strtolower((string) ($l['category'] ?? '')), $ids, true),
                'materials' => in_array(strtolower((string) ($l['material'] ?? '')), $ids, true),
                'tags' => array_intersect($ids, (array) ($l['tags'] ?? [])) !== [],
                default => true,
            };
        }));
        if (! $eligible) {
            return $fail("This code doesn't apply to the items in your cart.");
        }
        $base = round(array_sum(array_column($eligible, 'lineTotal')), 2);
        $qty = array_sum(array_column($eligible, 'qty'));

        if ($c->min_subtotal !== null && $base < (float) $c->min_subtotal) {
            return $fail('Add '.self::money(round((float) $c->min_subtotal - $base, 2)).' more to use this code.');
        }
        if ($c->min_quantity && $qty < (int) $c->min_quantity) {
            return $fail('Add '.((int) $c->min_quantity - $qty).' more '.(((int) $c->min_quantity - $qty) === 1 ? 'piece' : 'pieces').' to use this code.');
        }

        $discount = 0.0;
        $freeShipping = false;
        if ($c->discount_type === 'percentage') {
            $discount = round($base * min(100.0, (float) $c->value) / 100, 2);
            if ($c->max_discount !== null) {
                $discount = min($discount, (float) $c->max_discount);
            }
        } elseif ($c->discount_type === 'fixed') {
            $discount = min((float) $c->value, $base);
        } else {
            $freeShipping = true;
        }
        $discount = round(max(0.0, min($discount, $subtotal)), 2);

        return [
            'coupon' => [
                'id' => $c->id, 'code' => $c->code, 'title' => $c->title, 'label' => self::label($c), 'type' => $c->discount_type,
            ],
            'discount' => $discount, 'freeShipping' => $freeShipping, 'error' => null,
        ];
    }

    /** Records a use of the code against an order. Call inside the order transaction. */
    public static function redeem(array $coupon, string $orderId, string $email, ?string $customerId, float $amount): void
    {
        DB::table('coupon_redemptions')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(), 'coupon_id' => $coupon['id'], 'order_id' => $orderId,
            'customer_id' => $customerId, 'email' => strtolower($email), 'amount' => $amount,
            'created_at' => now()->utc()->format('Y-m-d H:i:s'),
        ]);
        DB::table('coupons')->where('id', $coupon['id'])->update(['times_used' => DB::raw('times_used + 1')]);
    }

    /** Gives the use back when an order is cancelled. */
    public static function release(string $orderId): ?string
    {
        $r = DB::table('coupon_redemptions')->where('order_id', $orderId)->first();
        if (! $r) {
            return null;
        }
        DB::table('coupon_redemptions')->where('id', $r->id)->delete();
        DB::table('coupons')->where('id', $r->coupon_id)->where('times_used', '>', 0)->update(['times_used' => DB::raw('times_used - 1')]);

        return (string) DB::table('coupons')->where('id', $r->coupon_id)->value('code');
    }
}
