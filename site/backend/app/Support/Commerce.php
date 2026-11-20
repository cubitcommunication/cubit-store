<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Store switches and server-side pricing.
 *
 * The browser only ever sends product ids and quantities. Names, prices, stock
 * and shipping are always read from the database here, so a customer can never
 * change what they pay by editing the page.
 */
final class Commerce
{
    private const DEFAULTS = [
        'commerce_cart_enabled' => '0',
        'commerce_checkout_enabled' => '0',
        'commerce_wishlist_enabled' => '0',
        'commerce_accounts_enabled' => '0',
        'commerce_guest_checkout' => '1',
        'commerce_cod_enabled' => '1',
        'commerce_online_enabled' => '0',
        'commerce_shipping_flat' => '99',
        'commerce_free_shipping_over' => '1999',
        'commerce_cod_fee' => '0',
        'commerce_max_qty' => '10',
        'commerce_gifts' => '[]',
        'commerce_returns_enabled' => '0',
        'commerce_return_days' => '7',
    ];

    private static ?array $cache = null;

    private static ?array $zones = null;

    public static function forget(): void
    {
        self::$cache = null;
        self::$zones = null;
    }

    /** @return array<string,string> */
    public static function settings(): array
    {
        if (self::$cache === null) {
            $stored = DB::table('site_settings')->where('group_name', 'commerce')->pluck('value', 'key')->all();
            self::$cache = array_merge(self::DEFAULTS, array_map('strval', $stored));
        }

        return self::$cache;
    }

    public static function on(string $key): bool
    {
        return (self::settings()[$key] ?? '0') === '1';
    }

    public static function number(string $key): float
    {
        return max(0, (float) (self::settings()[$key] ?? 0));
    }

    public static function cartEnabled(): bool
    {
        return self::on('commerce_cart_enabled');
    }

    /** Checkout only works when the cart is also on. */
    public static function checkoutEnabled(): bool
    {
        return self::cartEnabled() && self::on('commerce_checkout_enabled');
    }

    public static function onlinePaymentReady(): bool
    {
        $rz = Secrets::razorpay();

        return self::on('commerce_online_enabled') && $rz['key_id'] !== '' && $rz['key_secret'] !== '';
    }

    /** @return string[] payment methods currently offered */
    public static function paymentMethods(): array
    {
        $methods = [];
        if (self::on('commerce_cod_enabled')) {
            $methods[] = 'cod';
        }
        if (self::onlinePaymentReady()) {
            $methods[] = 'razorpay';
        }

        return $methods;
    }

    /** @return list<object> active shipping zones, in the order the admin arranged them */
    private static function zones(): array
    {
        if (self::$zones === null) {
            try {
                self::$zones = DB::table('shipping_zones')->where('active', 1)->orderBy('sort_order')->orderBy('created_at')->get()->all();
            } catch (\Throwable) {
                self::$zones = [];
            }
        }

        return self::$zones;
    }

    /**
     * What it costs to ship to a state: the first active zone that lists the state, otherwise the store's standard fee.
     *
     * @return array{rate: float, freeOver: float, zone: ?string}  freeOver 0 means shipping is never free
     */
    public static function shippingRule(?string $state): array
    {
        $want = mb_strtolower(trim((string) $state));
        if ($want !== '') {
            foreach (self::zones() as $zone) {
                $states = array_map(fn ($s) => mb_strtolower(trim((string) $s)), json_decode((string) $zone->states, true) ?: []);
                if (in_array($want, $states, true)) {
                    return [
                        'rate' => round(max(0, (float) $zone->rate), 2),
                        'freeOver' => $zone->free_over === null ? self::number('commerce_free_shipping_over') : max(0, (float) $zone->free_over),
                        'zone' => $zone->name,
                    ];
                }
            }
        }

        return ['rate' => round(self::number('commerce_shipping_flat'), 2), 'freeOver' => self::number('commerce_free_shipping_over'), 'zone' => null];
    }

    public static function shipping(float $subtotal, ?string $state = null): float
    {
        if ($subtotal <= 0) {
            return 0.0;
        }
        $rule = self::shippingRule($state);
        if ($rule['freeOver'] > 0 && $subtotal >= $rule['freeOver']) {
            return 0.0;
        }

        return $rule['rate'];
    }

    /**
     * Free gifts the main administrator set up: "spend X and get Y".
     *
     * @return list<array{amount: float, label: string}> sorted by amount
     */
    public static function gifts(): array
    {
        $list = json_decode((string) (self::settings()['commerce_gifts'] ?? '[]'), true);
        $gifts = [];
        foreach (is_array($list) ? $list : [] as $g) {
            $amount = is_array($g) ? (float) ($g['amount'] ?? 0) : 0;
            $label = is_array($g) ? trim((string) ($g['label'] ?? '')) : '';
            if ($amount > 0 && $label !== '') {
                $gifts[] = ['amount' => $amount, 'label' => mb_substr($label, 0, 120)];
            }
        }
        usort($gifts, fn ($a, $b) => $a['amount'] <=> $b['amount']);

        return array_slice($gifts, 0, 10);
    }

    /**
     * Prices a basket from product ids, optional variant ids and quantities.
     *
     * @param  array<int, array{id?: mixed, variant?: mixed, qty?: mixed}>  $items
     * @return array{lines: array<int, array<string,mixed>>, subtotal: float, discount: float, coupon: ?array, couponError: ?string, shipping: float, codFee: float, total: float, problems: string[]}
     */
    public static function quote(array $items, string $paymentMethod = 'cod', bool $lock = false, ?string $couponCode = null, ?string $email = null, ?string $customerId = null, ?string $state = null): array
    {
        $maxQty = max(1, (int) self::number('commerce_max_qty'));

        // Merge duplicate product+variant pairs and clamp quantities.
        $wanted = [];
        foreach ($items as $item) {
            $id = is_array($item) ? ($item['id'] ?? null) : null;
            if (! is_string($id) || $id === '') {
                continue;
            }
            $variant = (is_array($item) && is_string($item['variant'] ?? null) && $item['variant'] !== '') ? $item['variant'] : null;
            $qty = max(1, min($maxQty, (int) ($item['qty'] ?? 1)));
            $key = $id.'|'.($variant ?? '');
            $wanted[$key] = ['id' => $id, 'variant' => $variant, 'qty' => min($maxQty, ($wanted[$key]['qty'] ?? 0) + $qty)];
        }
        $ids = array_values(array_unique(array_column($wanted, 'id')));

        $query = DB::table('products')->whereIn('id', $ids)->where('published', 1)->whereNull('archived_at');
        $variantQuery = DB::table('product_variants')->whereIn('product_id', $ids)->orderBy('sort_order');
        if ($lock) {
            $query->lockForUpdate();
            $variantQuery->lockForUpdate();
        }
        $products = $query->get()->keyBy('id');
        $variantsByProduct = $variantQuery->get()->groupBy('product_id');

        $images = DB::table('product_images')->whereIn('product_id', $ids)->orderBy('sort_order')->get()
            ->groupBy('product_id')->map(fn ($g) => $g->first()->image_url);

        $lines = [];
        $problems = [];
        $subtotal = 0.0;
        foreach ($wanted as $w) {
            $p = $products->get($w['id']);
            if (! $p) {
                $problems[] = 'An item in your cart is no longer available and was removed.';

                continue;
            }

            $own = $variantsByProduct->get($p->id);
            $variant = null;
            $issue = null;
            if ($own && $own->isNotEmpty()) {
                if ($w['variant'] === null) {
                    $issue = 'Please choose an option';
                } else {
                    $variant = $own->firstWhere('id', $w['variant']);
                    if (! $variant) {
                        $issue = 'This option is no longer available';
                    }
                }
            }

            $price = round((float) (($variant && $variant->price !== null) ? $variant->price : $p->price), 2);
            $stockRaw = $variant ? $variant->stock_quantity : $p->stock_quantity;
            $stock = $stockRaw === null ? null : (int) $stockRaw;
            $compare = $variant && $variant->compare_at_price !== null ? (float) $variant->compare_at_price : ($p->compare_at_price !== null ? (float) $p->compare_at_price : null);

            if ($issue === null) {
                if ($price <= 0) {
                    $issue = 'This piece is not available to order online yet.';
                } elseif ($stock !== null && $stock <= 0) {
                    $issue = 'Sold out';
                } elseif ($stock !== null && $w['qty'] > $stock) {
                    $issue = "Only {$stock} left";
                }
            }
            if ($issue) {
                $problems[] = $p->name.($variant ? " ({$variant->title})" : '').": {$issue}";
            }

            $lineTotal = round($price * $w['qty'], 2);
            if (! $issue) {
                $subtotal += $lineTotal;
            }
            $lines[] = [
                'id' => $p->id, 'variantId' => $variant->id ?? null, 'variantTitle' => $variant->title ?? null,
                'slug' => $p->slug, 'name' => $p->name, 'category' => $p->category, 'material' => $p->material, 'tags' => array_map('mb_strtolower', \App\Support\Tags::decode($p->tags ?? null)), 'sku' => ($variant && $variant->sku) ? $variant->sku : $p->sku,
                'price' => $price, 'compareAt' => ($compare !== null && $compare > $price) ? $compare : null,
                'qty' => $w['qty'], 'stock' => $stock,
                'image' => ($variant && $variant->image_url) ? $variant->image_url : $images->get($p->id),
                'lineTotal' => $lineTotal, 'issue' => $issue,
            ];
        }

        $subtotal = round($subtotal, 2);
        // The free-shipping threshold looks at the basket before any code is applied.
        $rule = self::shippingRule($state);
        $shipping = self::shipping($subtotal, $state);
        $gifts = array_values(array_filter(self::gifts(), fn ($g) => $subtotal >= $g['amount']));
        $offer = Coupons::evaluate($couponCode, $lines, $subtotal, $email, $customerId, $lock);
        if ($offer['freeShipping']) {
            $shipping = 0.0;
        }
        $discount = $offer['discount'];
        $codFee = ($paymentMethod === 'cod' && $subtotal > 0) ? round(self::number('commerce_cod_fee'), 2) : 0.0;

        return [
            'lines' => $lines, 'subtotal' => $subtotal, 'discount' => $discount, 'coupon' => $offer['coupon'], 'couponError' => $offer['error'],
            'shipping' => $shipping, 'codFee' => $codFee,
            'freeShippingOver' => $rule['freeOver'], 'shippingZone' => $rule['zone'], 'gifts' => $gifts,
            'total' => round($subtotal - $discount + $shipping + $codFee, 2), 'problems' => array_values(array_unique($problems)),
        ];
    }
}
