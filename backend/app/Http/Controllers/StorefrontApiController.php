<?php

namespace App\Http\Controllers;

use App\Support\Coupons;
use App\Support\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The external storefront API: a small, stable contract for a website that is not this app's own React storefront.
 *
 * A client may already have a hand-built or static site whose design they want to keep. That site can read its
 * catalogue here and post its orders here, so stock, coupons, customers and orders all live in this admin while
 * the site itself stays exactly as it is. Three endpoints, all under /api/public:
 *
 *   GET  products                                  the catalogue: price, stock and variants
 *   GET  coupon?code=&subtotal=&phone=             check a discount code before the order is placed
 *   POST order                                     place the order
 *
 * A cart line from such a site is `{id, q, n}`: `id` is the product's slug, `q` the pack size (the variant) and
 * `n` how many of that pack. Prices and stock are always re-read here from the database: whatever the browser
 * sends about money is ignored, exactly as in the app's own checkout.
 *
 * Switched off unless FEATURE_EXTERNAL_STOREFRONT is on; see App\Http\Middleware\StorefrontApi for the gate.
 */
final class StorefrontApiController
{
    /** The catalogue a static site needs to render its shop: one entry per published product. */
    public function products(): JsonResponse
    {
        $products = DB::table('products')
            ->where('published', 1)->whereNull('archived_at')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'sku', 'price', 'compare_at_price', 'stock_quantity']);

        $ids = $products->pluck('id')->all();
        $variants = DB::table('product_variants')->whereIn('product_id', $ids)->orderBy('sort_order')->get();
        $images = DB::table('product_images')->whereIn('product_id', $ids)->orderBy('sort_order')->get()->groupBy('product_id');

        return response()->json([
            'ok' => true,
            'products' => $products->map(fn ($p) => [
                'id' => $p->slug,
                'name' => $p->name,
                'sku' => $p->sku,
                'price' => (float) $p->price,
                'mrp' => $p->compare_at_price !== null ? (float) $p->compare_at_price : null,
                'stock' => $p->stock_quantity,
                'images' => ($images[$p->id] ?? collect())->pluck('image_url')->values(),
                'variants' => $variants->where('product_id', $p->id)->values()->map(fn ($v) => [
                    'title' => $v->title,
                    'sku' => $v->sku,
                    'qty' => self::packSize($v->title, $v->sku),
                    'price' => (float) ($v->price ?? $p->price),
                    'mrp' => $v->compare_at_price !== null ? (float) $v->compare_at_price : null,
                    'stock' => $v->stock_quantity,
                ]),
            ])->values(),
        ]);
    }

    /** Checks a discount code against a subtotal, so the site can show the saving before the order is placed. */
    public function coupon(Request $request): JsonResponse
    {
        $code = (string) $request->query('code', '');
        $subtotal = max(0.0, (float) $request->query('subtotal', 0));
        // Product- and category-scoped codes need to know what is in the cart; cart-wide codes do not.
        $lines = $request->has('items') ? $this->resolve((array) $request->input('items', []))['lines'] : [];

        $result = Coupons::evaluate($code, $lines, $subtotal, $this->emailFor((string) $request->query('phone', '')), null);

        if ($result['error']) {
            return response()->json(['ok' => false, 'error' => $result['error']]);
        }
        if (! $result['coupon']) {
            return response()->json(['ok' => false, 'error' => "That code isn't valid."]);
        }

        return response()->json([
            'ok' => true,
            'code' => $result['coupon']['code'],
            'label' => $result['coupon']['label'],
            'discount' => $result['discount'],
            'free_shipping' => $result['freeShipping'],
        ]);
    }

    /** Places an order from the external site. Returns the order number the customer should quote. */
    public function order(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:191'],
            'address' => ['required', 'string', 'max:500'],
            'city' => ['required', 'string', 'max:120'],
            'state' => ['required', 'string', 'max:120'],
            'pin' => ['required', 'string', 'max:20'],
            'gstin' => ['nullable', 'string', 'max:30'],
            'note' => ['nullable', 'string', 'max:1000'],
            'coupon' => ['nullable', 'string', 'max:60'],
            'items' => ['required', 'array', 'min:1'],
        ]);

        $resolved = $this->resolve($data['items']);
        if (! $resolved['items']) {
            return response()->json(['ok' => false, 'error' => $resolved['problems'][0] ?? 'Those items are not available.'], 422);
        }

        $note = trim(implode("\n", array_filter([
            $data['note'] ?? null,
            ($data['gstin'] ?? '') !== '' ? 'GSTIN: '.strtoupper($data['gstin']) : null,
            $resolved['problems'] ? 'Not available when the order came in: '.implode('; ', $resolved['problems']) : null,
        ])));

        $result = OrderService::place(
            $resolved['items'],
            ['name' => $data['name'], 'email' => $this->emailFor($data['phone'], $data['email'] ?? null), 'phone' => $data['phone']],
            [
                'name' => $data['name'], 'phone' => $data['phone'], 'line1' => $data['address'],
                'city' => $data['city'], 'state' => $data['state'], 'postal_code' => $data['pin'], 'country' => 'India',
            ],
            'cod',
            $note !== '' ? $note : null,
            null,
            $data['coupon'] ?? null,
        );

        if (! $result['order']) {
            return response()->json(['ok' => false, 'error' => $result['problems'][0] ?? 'That order could not be placed.'], 422);
        }

        $o = $result['order'];

        return response()->json([
            'ok' => true,
            'order_no' => (string) $o->number,
            'subtotal' => (float) $o->subtotal,
            'discount' => (float) $o->discount_total,
            'shipping' => (float) $o->shipping_total,
            'total' => (float) $o->total,
        ]);
    }

    /**
     * Turns the external site's `{id, q, n}` lines into the product and variant ids this app works with.
     *
     * @return array{items: array<int, array{id: string, variant: ?string, qty: int}>, lines: array<int, array{id: string, qty: int}>, problems: string[]}
     */
    private function resolve(array $raw): array
    {
        $items = [];
        $lines = [];
        $problems = [];

        foreach ($raw as $row) {
            if (! is_array($row)) {
                continue;
            }
            $slug = trim((string) ($row['id'] ?? ''));
            $pack = (int) ($row['q'] ?? 0);
            $count = max(1, (int) ($row['n'] ?? 1));
            if ($slug === '') {
                continue;
            }

            $product = DB::table('products')
                ->where('published', 1)->whereNull('archived_at')
                ->where(fn ($q) => $q->where('slug', $slug)->orWhere('sku', $slug))
                ->first(['id', 'name']);
            if (! $product) {
                $problems[] = $slug;

                continue;
            }

            $variantId = null;
            if ($pack > 0) {
                $variant = DB::table('product_variants')->where('product_id', $product->id)->orderBy('sort_order')->get()
                    ->first(fn ($v) => self::packSize($v->title, $v->sku) === $pack);
                if (! $variant) {
                    $problems[] = $product->name.' (pack of '.$pack.')';

                    continue;
                }
                $variantId = $variant->id;
            }

            $items[] = ['id' => $product->id, 'variant' => $variantId, 'qty' => $count];
            $lines[] = ['id' => $product->id, 'qty' => $count];
        }

        return ['items' => $items, 'lines' => $lines, 'problems' => $problems];
    }

    /**
     * The pack size a variant stands for: the first whole number in its title ("Pack of 50") or, failing that,
     * the number its SKU ends with ("P9-3CP-50"). Null when the variant is not a pack.
     */
    private static function packSize(?string $title, ?string $sku): ?int
    {
        foreach ([(string) $title, (string) $sku] as $text) {
            if (preg_match('/(\d+)\s*$/', trim($text), $m) || preg_match('/(\d+)/', $text, $m)) {
                return (int) $m[1];
            }
        }

        return null;
    }

    /**
     * Orders are keyed by e-mail here, and a WhatsApp checkout usually has only a phone number. A site that does
     * collect an e-mail should send it; otherwise the phone becomes a stable stand-in address, so the same
     * customer's orders, coupon limits and history still line up.
     */
    private function emailFor(string $phone, ?string $email = null): string
    {
        $email = trim((string) $email);
        if ($email !== '') {
            return strtolower($email);
        }
        $digits = preg_replace('/\D+/', '', $phone) ?: 'unknown';
        $domain = (string) config('shop.storefront_api.phone_email_domain', 'phone.invalid');

        return $digits.'@'.$domain;
    }
}
