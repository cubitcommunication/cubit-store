<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Makes short SKUs (the text under the barcode): the category's code plus a running number that counts separately in
 * every category, for example ER-0001, ER-0002 for earrings and NK-0001 for necklaces. A variation adds a short
 * number: ER-0001-1, ER-0001-2. The code of a category is set in Admin -> Categories; without one, the first letters
 * of the category name are used. A SKU that already exists is never changed or reused.
 */
final class SkuGenerator
{
    /** The letters in front of the number for products of this category. */
    public static function prefix(?string $category, ?string $name = null): string
    {
        $category = trim((string) $category);
        if ($category !== '') {
            $code = DB::table('categories')->whereRaw('LOWER(name) = ?', [strtolower($category)])->value('sku_code');
            $code = self::clean((string) $code);
            if ($code !== '') {
                return $code;
            }
            $fromName = self::clean(substr(self::clean($category, 20), 0, 2));
            if (strlen($fromName) >= 2) {
                return $fromName;
            }
        }
        // No category: the first letters of the product's name.
        $name = self::clean((string) $name, 40);

        return strlen($name) >= 2 ? substr($name, 0, 2) : 'PR';
    }

    private static function clean(string $text, int $max = 6): string
    {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        $ascii = $ascii === false ? $text : $ascii;

        return substr(strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $ascii) ?? ''), 0, $max);
    }

    /** A new, unused product SKU such as ER-0007: the next number after the highest one already used with this code. */
    public static function forProduct(?string $category, ?string $name = null): string
    {
        $prefix = self::prefix($category, $name);
        $all = DB::table('products')->pluck('sku')->merge(DB::table('product_variants')->pluck('sku'))->filter()->map(fn ($s) => strtoupper((string) $s));
        $max = 0;
        foreach ($all as $sku) {
            if (preg_match('/^'.preg_quote($prefix, '/').'-(\d{1,6})(?:-|$)/', $sku, $m)) {
                $max = max($max, (int) $m[1]);
            }
        }
        $taken = $all->flip();
        do {
            $sku = $prefix.'-'.str_pad((string) (++$max), 4, '0', STR_PAD_LEFT);
        } while ($taken->has($sku));

        return $sku;
    }

    /**
     * A SKU for one variation: the product SKU and the next free number (ER-0001-1, ER-0001-2...).
     *
     * @param  string[]  $taken  SKUs already used by the other variations of this product
     */
    public static function forVariant(string $productSku, array $taken = []): string
    {
        $inUse = array_flip(array_map('strtoupper', $taken));
        $n = 0;
        do {
            $sku = $productSku.'-'.(++$n);
        } while (isset($inUse[strtoupper($sku)]) || DB::table('product_variants')->whereRaw('UPPER(sku) = ?', [strtoupper($sku)])->exists());

        return $sku;
    }

    /**
     * Gives every product and variation that has no SKU one. Existing SKUs are never touched.
     *
     * @return array{products: int, variants: int}
     */
    public static function fillMissing(): array
    {
        $products = 0;
        $variants = 0;
        DB::transaction(function () use (&$products, &$variants) {
            foreach (DB::table('products')->where(fn ($q) => $q->whereNull('sku')->orWhere('sku', ''))->orderBy('created_at')->get(['id', 'name', 'category']) as $p) {
                DB::table('products')->where('id', $p->id)->update(['sku' => self::forProduct($p->category, $p->name)]);
                $products++;
            }
            $rows = DB::table('product_variants')->where(fn ($q) => $q->whereNull('sku')->orWhere('sku', ''))->orderBy('product_id')->orderBy('sort_order')->get(['id', 'product_id']);
            foreach ($rows->groupBy('product_id') as $productId => $list) {
                $base = (string) DB::table('products')->where('id', $productId)->value('sku');
                $taken = DB::table('product_variants')->where('product_id', $productId)->pluck('sku')->filter()->all();
                foreach ($list as $v) {
                    $sku = self::forVariant($base, $taken);
                    $taken[] = $sku;
                    DB::table('product_variants')->where('id', $v->id)->update(['sku' => $sku]);
                    $variants++;
                }
            }
        });

        return ['products' => $products, 'variants' => $variants];
    }
}
