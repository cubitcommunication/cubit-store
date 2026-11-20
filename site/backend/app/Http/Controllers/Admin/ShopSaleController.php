<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Activity;
use App\Support\AdminAuth;
use App\Support\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Offline store: find a piece by scanning its barcode (the SKU) or typing, and record the sale. Shares the website's stock. */
class ShopSaleController extends Controller
{
    /** Pieces matching a scanned or typed code. `exact` is true when the code is a SKU, so the screen can add it straight away. */
    public function lookup(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if ($q === '') {
            return response()->json(['exact' => false, 'items' => []]);
        }
        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $q).'%';

        // A piece's own barcode (ER-0001.01): say which piece it is and whether it was already sold.
        if ($unit = DB::table('stock_units')->whereRaw('UPPER(code) = ?', [strtoupper($q)])->first()) {
            $p = DB::table('products')->where('id', $unit->product_id)->first();
            $v = $unit->variant_id ? DB::table('product_variants')->where('id', $unit->variant_id)->first() : null;
            if ($p) {
                $image = DB::table('product_images')->where('product_id', $p->id)->orderBy('sort_order')->value('image_url');

                return response()->json(['exact' => true, 'items' => [$this->entry($p, $v, $image) + ['unitCode' => $unit->code]], 'unit' => [
                    'code' => $unit->code, 'status' => $unit->status,
                    'soldAt' => $unit->sold_at ? \Carbon\Carbon::parse($unit->sold_at, 'UTC')->format('Y-m-d\TH:i:s\Z') : null,
                    'orderNumber' => $unit->order_id ? (int) DB::table('orders')->where('id', $unit->order_id)->value('number') : null,
                ]]);
            }
        }

        $productIds = collect();
        $variantIds = collect();
        $exact = false;

        $variantHit = DB::table('product_variants')->where('sku', $q)->pluck('id');
        $productHit = DB::table('products')->where('sku', $q)->whereNull('archived_at')->pluck('id');
        if ($variantHit->isNotEmpty() || $productHit->isNotEmpty()) {
            $exact = true;
            $variantIds = $variantHit;
            $productIds = $productHit;
        } else {
            $productIds = DB::table('products')->whereNull('archived_at')->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like))->orderBy('name')->limit(12)->pluck('id');
            $variantIds = DB::table('product_variants')->where('sku', 'like', $like)->limit(12)->pluck('id');
        }

        $ownerIds = DB::table('product_variants')->whereIn('id', $variantIds)->pluck('product_id');
        $products = DB::table('products')->whereNull('archived_at')->whereIn('id', $productIds->merge($ownerIds)->unique()->values())->get()->keyBy('id');
        $variants = DB::table('product_variants')->whereIn('product_id', $products->keys())->orderBy('sort_order')->get()->groupBy('product_id');
        $images = DB::table('product_images')->whereIn('product_id', $products->keys())->orderBy('sort_order')->get(['product_id', 'image_url'])->groupBy('product_id');

        $items = [];
        foreach ($products as $p) {
            $image = optional($images->get($p->id)?->first())->image_url;
            $own = $variants->get($p->id);
            if ($own && $own->isNotEmpty()) {
                // A variant SKU scanned: just that variation. A product SKU: every variation, to choose from.
                $wanted = $own->filter(fn ($v) => $variantIds->contains($v->id) || $productIds->contains($p->id));
                foreach ($wanted as $v) {
                    $items[] = $this->entry($p, $v, $image);
                }
            } else {
                $items[] = $this->entry($p, null, $image);
            }
        }

        // A design whose pieces each have their own barcode is sold by scanning the piece, not the design's SKU.
        if ($exact) {
            $loose = array_values(array_filter($items, fn ($i) => ! DB::table('stock_units')->where('product_id', $i['productId'])->when($i['variantId'], fn ($w) => $w->where('variant_id', $i['variantId']), fn ($w) => $w->whereNull('variant_id'))->exists()));
            if (! $loose && $items) {
                return response()->json(['exact' => true, 'items' => [], 'needsPiece' => true, 'name' => $items[0]['name']]);
            }
            $items = $loose;
        }

        return response()->json(['exact' => $exact, 'items' => array_slice($items, 0, 30)]);
    }

    private function entry(object $p, ?object $v, ?string $image): array
    {
        $stockRow = $v ?? $p;

        return [
            'productId' => $p->id, 'variantId' => $v?->id, 'name' => $p->name, 'variant' => $v?->title,
            'sku' => ($v?->sku ?: $p->sku) ?: null,
            'price' => $v && $v->price !== null ? (float) $v->price : (float) $p->price,
            'stock' => $stockRow->stock_quantity === null ? null : (int) $stockRow->stock_quantity,
            'image' => $image,
        ];
    }

    public function sale(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1', 'max:60'],
            'lines.*.product_id' => ['required', 'string', 'max:36'],
            'lines.*.variant_id' => ['nullable', 'string', 'max:36'],
            'lines.*.qty' => ['required', 'integer', 'min:1', 'max:100'],
            'lines.*.unit_code' => ['nullable', 'string', 'max:60'],
            'payment_method' => ['required', 'in:cash,upi,card'],
            'note' => ['nullable', 'string', 'max:300'],
            // Everything about the customer is optional.
            'customer' => ['nullable', 'array'],
            'customer.name' => ['nullable', 'string', 'max:100'],
            'customer.phone' => ['nullable', 'string', 'max:20', 'regex:/^[0-9+()\- ]{6,20}$/'],
            'customer.email' => ['nullable', 'email', 'max:160'],
            'customer.marketing' => ['nullable', 'boolean'],
            'customer.address' => ['nullable', 'string', 'max:300'],
            'customer.dob' => ['nullable', 'date_format:Y-m-d', 'before:tomorrow', 'after:1900-01-01'],
        ]);
        $admin = AdminAuth::current($request);
        $result = OrderService::placeShopSale($data['lines'], $data['payment_method'], $data['note'] ?? null, $admin['email'] ?? null, $data['customer'] ?? []);
        if (! $result['order']) {
            return response()->json(['message' => implode(' ', $result['problems'])], 422);
        }
        $o = $result['order'];
        Activity::log($request, $admin, 'create', 'Shop sale', 'Shop sale #'.$o->number.' ('.$data['payment_method'].', Rs '.number_format((float) $o->total, 2).')', [], 'order', $o->id);

        return response()->json(['ok' => true, 'orderId' => $o->id, 'number' => (int) $o->number, 'total' => (float) $o->total]);
    }
}
