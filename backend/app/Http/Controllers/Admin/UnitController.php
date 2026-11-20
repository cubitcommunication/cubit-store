<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Activity;
use App\Support\AdminAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Piece barcodes: a code for every physical piece (ER-0001.01, ER-0001.02...) so a piece that was sold cannot be sold twice. */
class UnitController extends Controller
{
    /** Makes `count` new piece codes for a product (or one of its variations) and returns them for printing. */
    public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'string', 'max:36'],
            'variant_id' => ['nullable', 'string', 'max:36'],
            'count' => ['required', 'integer', 'min:1', 'max:200'],
        ]);
        $product = DB::table('products')->where('id', $data['product_id'])->first();
        $variant = ! empty($data['variant_id']) ? DB::table('product_variants')->where('id', $data['variant_id'])->where('product_id', $data['product_id'])->first() : null;
        if (! $product || (! empty($data['variant_id']) && ! $variant)) {
            return response()->json(['message' => 'That piece was not found.'], 404);
        }
        $base = trim((string) (($variant?->sku ?: $product->sku) ?? ''));
        if ($base === '') {
            return response()->json(['message' => 'Give this piece a SKU first (Inventory → Generate missing SKUs).'], 422);
        }

        $codes = DB::transaction(function () use ($data, $base) {
            $now = now()->utc()->format('Y-m-d H:i:s');
            $max = 0;
            foreach (DB::table('stock_units')->where('code', 'like', str_replace(['%', '_'], ['\\%', '\\_'], $base).'.%')->lockForUpdate()->pluck('code') as $code) {
                if (preg_match('/\.(\d+)$/', (string) $code, $m)) {
                    $max = max($max, (int) $m[1]);
                }
            }
            $out = [];
            for ($i = 1; $i <= (int) $data['count']; $i++) {
                $code = $base.'.'.str_pad((string) ($max + $i), 2, '0', STR_PAD_LEFT);
                DB::table('stock_units')->insert(['id' => (string) Str::uuid(), 'product_id' => $data['product_id'], 'variant_id' => $data['variant_id'] ?? null, 'code' => $code, 'status' => 'in_stock', 'created_at' => $now, 'updated_at' => $now]);
                $out[] = $code;
            }

            return $out;
        });
        Activity::log($request, AdminAuth::current($request), 'create', 'Piece barcodes', 'Made '.count($codes).' piece barcodes for '.$product->name, ['first' => $codes[0], 'last' => end($codes)], 'product', $product->id);

        return response()->json(['codes' => $codes]);
    }

    /** The piece codes that are still in stock (to reprint a lost or damaged label). */
    public function inStock(Request $request): JsonResponse
    {
        $data = $request->validate(['product_id' => ['required', 'string', 'max:36'], 'variant_id' => ['nullable', 'string', 'max:36']]);
        $codes = DB::table('stock_units')->where('product_id', $data['product_id'])->where('status', 'in_stock')
            ->when(! empty($data['variant_id']), fn ($q) => $q->where('variant_id', $data['variant_id']), fn ($q) => $q->whereNull('variant_id'))
            ->orderBy('code')->pluck('code');

        return response()->json(['codes' => $codes]);
    }
}
