<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** The stock history: every change to a piece's quantity is written here with a reason. Never throws. */
final class StockLog
{
    public static function record(string $productId, ?string $variantId, int $change, ?int $after, string $reason, ?string $orderId = null, ?string $note = null, ?string $adminEmail = null): void
    {
        try {
            DB::table('stock_adjustments')->insert([
                'id' => (string) Str::uuid(), 'product_id' => $productId, 'variant_id' => $variantId, 'change' => $change, 'stock_after' => $after,
                'reason' => $reason, 'note' => $note !== null ? mb_substr($note, 0, 200) : null, 'admin_email' => $adminEmail, 'order_id' => $orderId,
                'created_at' => now()->utc()->format('Y-m-d H:i:s'),
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('[stock] could not write the history: '.$e->getMessage());
        }
    }

    /**
     * Puts quantity back on a product or variant (only if it tracks stock) and logs it.
     * Returns the new stock, or null when the piece does not track stock.
     */
    public static function restock(?string $productId, ?string $variantId, int $qty, string $reason, ?string $orderId = null, ?string $note = null): ?int
    {
        $table = $variantId ? 'product_variants' : 'products';
        $rowId = $variantId ?: $productId;
        if (! $rowId || $qty <= 0) {
            return null;
        }
        $updated = DB::table($table)->where('id', $rowId)->whereNotNull('stock_quantity')->update(['stock_quantity' => DB::raw('stock_quantity + '.$qty)]);
        if (! $updated) {
            return null;
        }
        $after = (int) DB::table($table)->where('id', $rowId)->value('stock_quantity');
        $pid = $productId ?: (string) DB::table('product_variants')->where('id', $variantId)->value('product_id');
        self::record($pid, $variantId, $qty, $after, $reason, $orderId, $note);

        return $after;
    }
}
