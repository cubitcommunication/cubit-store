<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Media;
use App\Support\Tags;
use App\Support\SkuGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Atomic product save. The product row, its slug redirect and every image row
 * are written in a single transaction, so a failure halfway through can never
 * leave a half-saved product. Images the admin removed are deleted from disk
 * only after the commit, and only when no other record still references them.
 */
class ProductSaveController extends Controller
{
    private const SLUG_RE = '/^[a-z0-9]+(?:-[a-z0-9]+)*$/';

    public function __invoke(Request $request): JsonResponse
    {
        $id = $request->input('id');
        $previousSlug = $request->input('previousSlug');
        $p = (array) $request->input('payload', []);
        $images = array_values((array) $request->input('images', []));
        $removed = array_values((array) $request->input('removedImages', []));
        $variantsIn = array_values((array) $request->input('variants', []));

        $problems = [];
        if (! trim((string) ($p['name'] ?? ''))) {
            $problems[] = 'Product name is required.';
        }
        // The SKU (the barcode text) may be left empty: it is made from the category, see App\Support\SkuGenerator.
        if (! is_numeric($p['price'] ?? null) || (float) $p['price'] <= 0) {
            $problems[] = 'Please enter a valid price greater than zero.';
        }
        if (! isset($p['slug']) || ! preg_match(self::SLUG_RE, (string) $p['slug'])) {
            $problems[] = 'Please provide a valid web address (slug).';
        }
        if (! trim((string) ($p['category'] ?? ''))) {
            $problems[] = 'Please choose a valid category.';
        }
        if (! trim((string) ($p['material'] ?? ''))) {
            $problems[] = 'Please choose a valid material.';
        }
        foreach ($images as $image) {
            if (! trim((string) (((array) $image)['image_url'] ?? ''))) {
                $problems[] = 'Every image needs a file.';
                break;
            }
        }

        // Options (Size, Colour...) and their variants.
        [$options, $variants, $variantProblems] = $this->cleanVariants($p['options'] ?? null, $variantsIn);
        $problems = array_merge($problems, $variantProblems);
        if ($problems) {
            return response()->json(['message' => implode(' ', $problems)], 422);
        }

        // The slug must belong to this product alone.
        $clash = DB::table('products')->where('slug', $p['slug'])->when($id, fn ($q) => $q->where('id', '!=', $id))->exists();
        if ($clash) {
            return response()->json(['message' => 'That web address (slug) is already used by another product.'], 422);
        }

        $now = now()->utc()->format('Y-m-d H:i:s');
        $productId = $id ?: (string) Str::uuid();
        $name = trim((string) $p['name']);
        $category = (string) $p['category'];

        $sku = trim((string) ($p['sku'] ?? '')) ?: SkuGenerator::forProduct($category, $name);
        // Variations without their own SKU get the product SKU and a number (ER-0001-1).
        $taken = array_values(array_filter(array_map(fn ($v) => $v['sku'] ?? null, $variants)));
        foreach ($variants as $i => $v) {
            if (empty($v['sku'])) {
                $variants[$i]['sku'] = SkuGenerator::forVariant($sku, $taken);
                $taken[] = $variants[$i]['sku'];
            }
        }

        $values = [
            'name' => $name,
            'slug' => $p['slug'],
            'sku' => $sku,
            'price' => (float) $p['price'],
            'category' => $category,
            'subcategory' => $p['subcategory'] ?? null,
            'material' => $p['material'],
            'description' => $p['description'] ?? null,
            'where_to_wear' => $p['where_to_wear'] ?? null,
            'occasion' => json_encode(array_values((array) ($p['occasion'] ?? [])), JSON_UNESCAPED_UNICODE),
            'tags' => Tags::encode((array) ($p['tags'] ?? [])),
            'video_url' => self::cleanVideo($p['video_url'] ?? null),
            // Packed weight and size, used to book a courier (blank = the default parcel in Integrations).
            'weight_grams' => isset($p['weight_grams']) && is_numeric($p['weight_grams']) && (int) $p['weight_grams'] > 0 ? min(100000, (int) $p['weight_grams']) : null,
            'length_cm' => isset($p['length_cm']) && is_numeric($p['length_cm']) && (float) $p['length_cm'] > 0 ? min(500, round((float) $p['length_cm'], 1)) : null,
            'breadth_cm' => isset($p['breadth_cm']) && is_numeric($p['breadth_cm']) && (float) $p['breadth_cm'] > 0 ? min(500, round((float) $p['breadth_cm'], 1)) : null,
            'height_cm' => isset($p['height_cm']) && is_numeric($p['height_cm']) && (float) $p['height_cm'] > 0 ? min(500, round((float) $p['height_cm'], 1)) : null,
            'featured' => ! empty($p['featured']) ? 1 : 0,
            'new_arrival' => ! empty($p['new_arrival']) ? 1 : 0,
            'navratri_2026' => ! empty($p['navratri_2026']) ? 1 : 0,
            'diwali_2026' => ! empty($p['diwali_2026']) ? 1 : 0,
            'published' => ! empty($p['published']) ? 1 : 0,
            'seo_title' => $p['seo_title'] ?? null,
            'seo_description' => $p['seo_description'] ?? null,
            'seo_image_url' => $p['seo_image_url'] ?? null,
            'options' => $options ? json_encode($options, JSON_UNESCAPED_UNICODE) : null,
            // Blank = stock not tracked. A number is reduced by every order.
            'stock_quantity' => isset($p['stock_quantity']) && is_numeric($p['stock_quantity']) ? max(0, (int) $p['stock_quantity']) : null,
            'compare_at_price' => isset($p['compare_at_price']) && is_numeric($p['compare_at_price']) && (float) $p['compare_at_price'] > (float) $p['price'] ? (float) $p['compare_at_price'] : null,
        ];

        // The videos this product has now, so a replaced or removed one can be cleaned up after the save.
        $oldVideos = $id
            ? array_values(array_filter(array_merge([DB::table('products')->where('id', $id)->value('video_url')], DB::table('product_variants')->where('product_id', $id)->pluck('video_url')->all())))
            : [];

        DB::transaction(function () use ($id, $productId, $values, $now, $previousSlug, $p, $removed, $images, $name, $category, $variants) {
            if ($id) {
                DB::table('products')->where('id', $id)->update($values + ['updated_at' => $now]);

                if ($previousSlug && $previousSlug !== $p['slug']) {
                    DB::table('slug_redirects')->upsert([[
                        'id' => (string) Str::uuid(),
                        'entity_type' => 'product',
                        'source_slug' => $previousSlug,
                        'target_slug' => $p['slug'],
                        'source_path' => "/product/{$previousSlug}",
                        'target_path' => "/product/{$p['slug']}",
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]], ['source_path'], ['target_slug', 'target_path', 'updated_at']);
                }
            } else {
                DB::table('products')->insert($values + [
                    'id' => $productId,
                    'specifications' => '{}',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            // Removed image rows leave the database inside the same transaction.
            foreach ($removed as $image) {
                $image = (array) $image;
                if (! empty($image['id'])) {
                    DB::table('product_images')->where('id', $image['id'])->where('product_id', $productId)->delete();
                }
            }

            // Variants: update the ones that exist, add new ones, delete the ones the admin removed.
            $existing = DB::table('product_variants')->where('product_id', $productId)->pluck('id')->all();
            $keep = [];
            foreach ($variants as $index => $v) {
                $row = [
                    'title' => $v['title'], 'options' => json_encode($v['options'], JSON_UNESCAPED_UNICODE), 'sku' => $v['sku'],
                    'price' => $v['price'], 'compare_at_price' => $v['compare_at_price'], 'stock_quantity' => $v['stock_quantity'],
                    'image_url' => $v['image_url'], 'video_url' => $v['video_url'], 'sort_order' => $index, 'updated_at' => $now,
                ];
                if ($v['id'] && in_array($v['id'], $existing, true)) {
                    DB::table('product_variants')->where('id', $v['id'])->update($row);
                    $keep[] = $v['id'];
                } else {
                    $newId = (string) Str::uuid();
                    DB::table('product_variants')->insert($row + ['id' => $newId, 'product_id' => $productId, 'created_at' => $now]);
                    $keep[] = $newId;
                }
            }
            DB::table('product_variants')->where('product_id', $productId)->whereNotIn('id', $keep ?: [''])->delete();

            // Remaining images are synced to their final order and alt text.
            foreach ($images as $index => $image) {
                $image = (array) $image;
                $alt = trim((string) ($image['alt_text'] ?? '')) ?: \App\Support\Brand::name()." {$name} {$category}";
                if (! empty($image['id'])) {
                    DB::table('product_images')->where('id', $image['id'])->where('product_id', $productId)->update([
                        'image_url' => $image['image_url'], 'alt_text' => $alt, 'sort_order' => $index,
                    ]);
                } else {
                    DB::table('product_images')->insert([
                        'id' => (string) Str::uuid(), 'product_id' => $productId, 'image_url' => $image['image_url'],
                        'alt_text' => $alt, 'sort_order' => $index, 'created_at' => $now,
                    ]);
                }
            }
        });

        // Only after the commit: delete files nothing references any more. A
        // failure here never affects the saved product.
        foreach ($removed as $image) {
            $url = (string) (((array) $image)['image_url'] ?? '');
            try {
                if ($url !== '') {
                    Media::deleteIfUnreferenced($url);
                }
            } catch (\Throwable $e) {
                Log::error("[product-save] media cleanup failed for {$url}: ".$e->getMessage());
            }
        }
        // A video that was replaced or removed goes too, unless something else still uses it.
        $keptVideos = array_filter(array_merge([$values['video_url']], array_column($variants, 'video_url')));
        foreach (array_diff($oldVideos, $keptVideos) as $url) {
            try {
                Media::deleteIfUnreferenced((string) $url);
            } catch (\Throwable $e) {
                Log::error("[product-save] video cleanup failed for {$url}: ".$e->getMessage());
            }
        }

        return response()->json(['id' => $productId, 'slug' => $p['slug']]);
    }

    /** A product or variation video: one of our own uploaded videos, or nothing. */
    private static function cleanVideo(mixed $url): ?string
    {
        $url = is_string($url) ? trim($url) : '';
        if ($url === '' || ! str_starts_with($url, Media::URL_PREFIX)) {
            return null;
        }
        $key = substr($url, strlen(Media::URL_PREFIX));

        return Media::isSafeKey($key) && Media::kindFor($key) === 'video' ? $url : null;
    }

    /**
     * Validates and normalises options + variants from the admin form.
     *
     * @return array{0: array<int, array{name: string, values: string[]}>, 1: array<int, array<string,mixed>>, 2: string[]}
     */
    private function cleanVariants(mixed $rawOptions, array $rawVariants): array
    {
        $problems = [];
        $options = [];
        foreach ((array) ($rawOptions ?? []) as $opt) {
            $opt = (array) $opt;
            $name = trim((string) ($opt['name'] ?? ''));
            $values = array_values(array_unique(array_filter(array_map(fn ($v) => trim((string) $v), (array) ($opt['values'] ?? [])), fn ($v) => $v !== '')));
            if ($name === '' && ! $values) {
                continue;
            }
            if ($name === '' || ! $values) {
                $problems[] = 'Each option needs a name and at least one value.';

                continue;
            }
            $options[] = ['name' => mb_substr($name, 0, 40), 'values' => array_map(fn ($v) => mb_substr($v, 0, 60), array_slice($values, 0, 30))];
        }
        if (count($options) > 3) {
            $problems[] = 'A product can have at most 3 options.';
            $options = array_slice($options, 0, 3);
        }
        $names = array_map(fn ($o) => strtolower($o['name']), $options);
        if (count($names) !== count(array_unique($names))) {
            $problems[] = 'Option names must be different from each other.';
        }

        if (! $options) {
            return [[], [], $problems];   // no options -> no variants
        }
        if (count($rawVariants) > 100) {
            $problems[] = 'A product can have at most 100 variants.';
            $rawVariants = array_slice($rawVariants, 0, 100);
        }

        $variants = [];
        $seen = [];
        foreach ($rawVariants as $raw) {
            $raw = (array) $raw;
            $selection = [];
            foreach ($options as $o) {
                $value = (string) (((array) ($raw['options'] ?? []))[$o['name']] ?? '');
                if (! in_array($value, $o['values'], true)) {
                    $problems[] = "A variant has no valid value for \"{$o['name']}\".";

                    continue 2;
                }
                $selection[$o['name']] = $value;
            }
            $signature = implode('|', $selection);
            if (isset($seen[$signature])) {
                $problems[] = 'Two variants have the same combination ('.implode(' / ', $selection).').';

                continue;
            }
            $seen[$signature] = true;

            $price = $raw['price'] ?? null;
            $compare = $raw['compare_at_price'] ?? null;
            $stock = $raw['stock_quantity'] ?? null;
            if ($price !== null && $price !== '' && (! is_numeric($price) || (float) $price <= 0)) {
                $problems[] = 'Variant '.implode(' / ', $selection).': the price must be greater than zero (or blank to use the product price).';
            }
            $variants[] = [
                'id' => ! empty($raw['id']) ? (string) $raw['id'] : null,
                'title' => implode(' / ', $selection),
                'options' => $selection,
                'sku' => isset($raw['sku']) && trim((string) $raw['sku']) !== '' ? mb_substr(trim((string) $raw['sku']), 0, 100) : null,
                'price' => ($price === null || $price === '' || ! is_numeric($price)) ? null : (float) $price,
                'compare_at_price' => ($compare === null || $compare === '' || ! is_numeric($compare) || (float) $compare <= 0) ? null : (float) $compare,
                'stock_quantity' => ($stock === null || $stock === '' || ! is_numeric($stock)) ? null : max(0, (int) $stock),
                'image_url' => ! empty($raw['image_url']) ? mb_substr((string) $raw['image_url'], 0, 500) : null,
                'video_url' => self::cleanVideo($raw['video_url'] ?? null),
            ];
        }
        if (! $variants) {
            $problems[] = 'Add at least one variant, or remove the options.';
        }

        return [$options, $variants, $problems];
    }
}
