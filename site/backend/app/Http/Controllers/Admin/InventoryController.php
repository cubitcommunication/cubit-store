<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AdminAuth;
use App\Support\Notifier;
use App\Support\StockLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Stock levels for every piece and variation, a way to adjust them with a reason, and the history of every change. */
class InventoryController extends Controller
{
    private const REASONS = ['received', 'correction', 'damaged', 'count', 'other'];

    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $filter = (string) $request->query('filter', 'all');
        $low = Notifier::lowStockThreshold();

        $products = DB::table('products')->whereNull('archived_at')->orderBy('name')
            ->when($q !== '', fn ($b) => $b->where(fn ($w) => $w->where('name', 'like', "%{$q}%")->orWhere('sku', 'like', "%{$q}%")))
            ->limit(600)->get(['id', 'name', 'sku', 'stock_quantity', 'published', 'price']);
        $variants = DB::table('product_variants')->whereIn('product_id', $products->pluck('id'))->orderBy('sort_order')->get(['id', 'product_id', 'title', 'sku', 'stock_quantity', 'price'])->groupBy('product_id');
        $images = DB::table('product_images')->whereIn('product_id', $products->pluck('id'))->orderBy('sort_order')->get(['product_id', 'image_url'])->groupBy('product_id');

        // Pieces that have their own barcode: how many exist and how many are still in stock.
        $units = [];
        foreach (DB::table('stock_units')->whereIn('product_id', $products->pluck('id'))->selectRaw("product_id, variant_id, COUNT(*) as total, SUM(CASE WHEN status = 'in_stock' THEN 1 ELSE 0 END) as in_stock")->groupBy('product_id', 'variant_id')->get() as $u) {
            $units[$u->product_id.':'.($u->variant_id ?? '')] = ['total' => (int) $u->total, 'inStock' => (int) $u->in_stock];
        }

        $rows = [];
        foreach ($products as $p) {
            $own = $variants->get($p->id);
            $image = optional($images->get($p->id)?->first())->image_url;
            $entries = $own && $own->isNotEmpty()
                ? $own->map(fn ($v) => ['variantId' => $v->id, 'variant' => $v->title, 'sku' => $v->sku ?: $p->sku, 'price' => $v->price !== null ? (float) $v->price : (float) $p->price, 'stock' => $v->stock_quantity === null ? null : (int) $v->stock_quantity])->all()
                : [['variantId' => null, 'variant' => null, 'sku' => $p->sku, 'price' => (float) $p->price, 'stock' => $p->stock_quantity === null ? null : (int) $p->stock_quantity]];
            foreach ($entries as $e) {
                $state = $e['stock'] === null ? 'untracked' : ($e['stock'] <= 0 ? 'out' : ($e['stock'] <= $low ? 'low' : 'ok'));
                if (($filter === 'low' && ! in_array($state, ['low', 'out'], true)) || ($filter === 'out' && $state !== 'out') || ($filter === 'untracked' && $state !== 'untracked')) {
                    continue;
                }
                $rows[] = ['productId' => $p->id, 'name' => $p->name, 'published' => (bool) $p->published, 'image' => $image, 'state' => $state, 'pieces' => $units[$p->id.':'.($e['variantId'] ?? '')] ?? ['total' => 0, 'inStock' => 0]] + $e;
            }
        }

        return response()->json(['rows' => $rows, 'lowThreshold' => $low, 'reasons' => self::REASONS]);
    }

    public function history(Request $request): JsonResponse
    {
        $data = $request->validate(['product_id' => ['required', 'string', 'max:36'], 'variant_id' => ['nullable', 'string', 'max:36']]);
        $q = DB::table('stock_adjustments')->where('product_id', $data['product_id'])->orderByDesc('created_at')->limit(60);
        if (! empty($data['variant_id'])) {
            $q->where('variant_id', $data['variant_id']);
        }

        return response()->json(['items' => $q->get()->map(fn ($a) => [
            'change' => (int) $a->change, 'after' => $a->stock_after === null ? null : (int) $a->stock_after, 'reason' => $a->reason, 'note' => $a->note,
            'by' => $a->admin_email, 'variantId' => $a->variant_id, 'at' => \Carbon\Carbon::parse($a->created_at, 'UTC')->format('Y-m-d\TH:i:s\Z'),
        ])->all()]);
    }

    /** Gives every piece and variation that has no SKU one (made from the name). Existing SKUs are never changed. */
    public function generateSkus(Request $request): JsonResponse
    {
        $done = \App\Support\SkuGenerator::fillMissing();
        if ($done['products'] || $done['variants']) {
            \App\Support\Activity::log($request, AdminAuth::current($request), 'update', 'Inventory', 'Generated SKUs: '.$done['products'].' products, '.$done['variants'].' variations');
        }

        return response()->json($done);
    }

    /** "add" puts a number on top of the stock (use a negative number to take some off); "set" replaces it. */
    public function adjust(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'string', 'max:36'],
            'variant_id' => ['nullable', 'string', 'max:36'],
            'mode' => ['required', 'in:add,set'],
            'quantity' => ['required', 'integer', 'min:-100000', 'max:100000'],
            'reason' => ['required', 'in:'.implode(',', self::REASONS)],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
        $variantId = $data['variant_id'] ?? null;
        $table = $variantId ? 'product_variants' : 'products';
        $rowId = $variantId ?: $data['product_id'];

        $result = DB::transaction(function () use ($data, $table, $rowId, $variantId) {
            $row = DB::table($table)->where('id', $rowId)->lockForUpdate()->first();
            if (! $row || ($variantId && $row->product_id !== $data['product_id'])) {
                return ['error' => 'That piece was not found.'];
            }
            $before = $row->stock_quantity === null ? null : (int) $row->stock_quantity;
            if ($data['mode'] === 'add' && $before === null) {
                return ['error' => 'This piece does not track stock yet. Use "Set to" to start tracking it.'];
            }
            $after = $data['mode'] === 'set' ? (int) $data['quantity'] : $before + (int) $data['quantity'];
            if ($after < 0) {
                return ['error' => 'Stock cannot go below zero.'];
            }
            DB::table($table)->where('id', $rowId)->update(['stock_quantity' => $after]);
            $admin = (array) AdminAuth::current(request());
            StockLog::record($data['product_id'], $variantId, $after - (int) ($before ?? 0), $after, $data['reason'], null, $data['note'] ?? null, $admin['email'] ?? null);

            return ['after' => $after, 'name' => $row->name ?? DB::table('products')->where('id', $data['product_id'])->value('name')];
        });
        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }
        Notifier::stock([['name' => (string) $result['name'], 'left' => $result['after']]]);

        return response()->json(['ok' => true, 'stock' => $result['after']]);
    }
}
