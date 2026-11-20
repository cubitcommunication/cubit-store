<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/** Admin-only catalogue export used by the backup screen. */
class CatalogueController extends Controller
{
    public function export(): JsonResponse
    {
        $products = DB::table('products')->orderBy('created_at')->get([
            'id', 'name', 'slug', 'sku', 'price', 'category', 'subcategory', 'material', 'description',
            'occasion', 'where_to_wear', 'specifications', 'featured', 'new_arrival', 'navratri_2026',
            'diwali_2026', 'published', 'archived_at', 'seo_title', 'seo_description', 'created_at', 'updated_at',
        ]);

        $byProduct = [];
        foreach (DB::table('product_images')->orderBy('product_id')->orderBy('sort_order')->get() as $image) {
            $byProduct[$image->product_id][] = [
                'image_url' => $image->image_url,
                'alt_text' => $image->alt_text,
                'sort_order' => (int) $image->sort_order,
            ];
        }

        $json = fn ($value, $fallback) => (function () use ($value, $fallback) {
            $decoded = is_string($value) ? json_decode($value, false) : null;

            return json_last_error() === JSON_ERROR_NONE && $decoded !== null ? $decoded : $fallback;
        })();

        $rows = [];
        foreach ($products as $row) {
            $rows[] = [
                'id' => $row->id, 'name' => $row->name, 'slug' => $row->slug, 'sku' => $row->sku,
                'price' => (float) $row->price, 'category' => $row->category, 'subcategory' => $row->subcategory,
                'material' => $row->material, 'description' => $row->description,
                'occasion' => $json($row->occasion, []),
                'where_to_wear' => $row->where_to_wear,
                'specifications' => $json($row->specifications, new \stdClass()),
                'featured' => (bool) $row->featured, 'new_arrival' => (bool) $row->new_arrival,
                'navratri_2026' => (bool) $row->navratri_2026, 'diwali_2026' => (bool) $row->diwali_2026,
                'published' => (bool) $row->published, 'archived_at' => $row->archived_at,
                'seo_title' => $row->seo_title, 'seo_description' => $row->seo_description,
                'created_at' => $row->created_at, 'updated_at' => $row->updated_at,
                'product_images' => $byProduct[$row->id] ?? [],
            ];
        }

        return response()->json(
            ['exportedAt' => now()->utc()->toIso8601String(), 'products' => $rows],
            200,
            [],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION,
        );
    }
}
