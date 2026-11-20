<?php

namespace App\Support\Bulk;

use App\Support\Media;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Server-side bulk product import / export.
 *
 * Everything runs against the existing `products` and `product_images` tables
 * and the existing media folder: no new tables, no second product store and no
 * duplicate product logic. The CSV carries the same fields as the Add / Edit form.
 */
final class BulkService
{
    private const MAX_IMPORT_ROWS = 500;
    private const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

    /* ------------------------------------------------------------------ export */

    public function buildProductCsv(?string $productId = null): string
    {
        $query = DB::table('products');
        $products = $productId
            ? $query->where('id', $productId)->get()
            : $query->whereNull('archived_at')->orderBy('created_at')->get();

        $byProduct = [];
        foreach (DB::table('product_images')->orderBy('product_id')->orderBy('sort_order')->get() as $image) {
            $byProduct[$image->product_id][] = $image;
        }
        $collectionNames = DB::table('collections')->pluck('name')->all();

        $records = [];
        foreach ($products as $product) {
            $own = $byProduct[$product->id] ?? [];
            $specs = $this->decodeJson($product->specifications, []);
            $records[] = [
                'Product Name' => $product->name,
                'SKU' => $product->sku,
                'Slug' => $product->slug,
                // A price of 0 means "not set yet" — export it as blank, never as a number.
                'Price' => (float) $product->price > 0 ? (string) (float) $product->price : '',
                'Category' => $product->category,
                'Material' => $product->material,
                'Collection' => in_array($product->subcategory ?? '', $collectionNames, true) ? $product->subcategory : '',
                'Subcategory' => $product->subcategory ?? '',
                'Short Description' => $specs['short_description'] ?? '',
                'Description' => $product->description ?? '',
                'Where to Wear' => $product->where_to_wear ?? '',
                'Occasions' => implode(', ', $this->decodeJson($product->occasion, [])),
                'Visibility' => $product->published ? 'Published' : 'Draft',
                'Featured' => $product->featured ? 'TRUE' : 'FALSE',
                'New Arrival' => $product->new_arrival ? 'TRUE' : 'FALSE',
                'SEO Title' => $product->seo_title ?? '',
                'SEO Description' => $product->seo_description ?? '',
                'Social Image URL' => $product->seo_image_url ?? '',
                'Primary Image URL' => $own[0]->image_url ?? '',
                'Additional Image URLs' => implode(',', array_map(fn ($i) => $i->image_url, array_slice($own, 1))),
                'Image Alt Text' => $own[0]->alt_text ?? '',
                'WhatsApp Enquiry Message' => $specs['whatsapp_message'] ?? '',
            ];
        }

        return Csv::build($records);
    }

    private function decodeJson(mixed $value, array $fallback): array
    {
        if (! is_string($value)) {
            return is_array($value) ? $value : $fallback;
        }
        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : $fallback;
    }

    /* -------------------------------------------------------------- validation */

    private function matchInsensitive(string $value, array $allowed): ?string
    {
        $needle = strtolower(trim($value));
        foreach ($allowed as $candidate) {
            if (strtolower($candidate) === $needle) {
                return $candidate;
            }
        }

        return null;
    }

    private function fallbackSeoDescription(array $record, string $name): string
    {
        $source = trim($record['Short Description'] ?? '') ?: (trim($record['Description'] ?? '') ?: "{$name} from ".\App\Support\Brand::name()." — available now.");
        $clean = trim((string) preg_replace('/\s+/', ' ', $source));

        return mb_strlen($clean) > 155 ? rtrim(mb_substr($clean, 0, 152)).'…' : $clean;
    }

    private function validateRows(string $csv, string $mode): array
    {
        $categoryRows = DB::table('categories')->pluck('name')->all();
        $collections = array_values(array_filter(DB::table('collections')->pluck('name')->all()));
        $categories = array_values(array_unique(array_filter([...config('shop.categories'), ...$categoryRows])));
        $materials = config('shop.materials');
        $occasionsAllowed = config('shop.occasions');

        $skus = [];
        $slugs = [];
        foreach (DB::table('products')->get(['id', 'sku', 'slug']) as $row) {
            $skus[strtolower(trim($row->sku))] = $row->id;
            $slugs[$row->slug] = $row->id;
        }

        ['records' => $records, 'missingColumns' => $missingColumns, 'unknownColumns' => $unknownColumns] = Csv::parseRecords($csv);
        $fileErrors = [];
        if (! $records) {
            $fileErrors[] = 'The file contains no product rows.';
        }
        if (count($records) > self::MAX_IMPORT_ROWS) {
            $fileErrors[] = 'This file has '.count($records).' rows. Please import at most '.self::MAX_IMPORT_ROWS.' products at a time.';
        }
        if ($missingColumns) {
            $fileErrors[] = 'Missing columns: '.implode(', ', $missingColumns).'.';
        }

        $seenSkus = [];
        $seenSlugs = [];
        $validated = [];

        foreach ($records as $index => $record) {
            $rowNumber = $index + 2; // header is row 1 in the spreadsheet
            $errors = [];
            $warnings = [];
            $name = trim($record['Product Name'] ?? '');
            $sku = trim($record['SKU'] ?? '');

            if (str_starts_with(strtoupper($name), Csv::EXAMPLE_MARKER)) {
                $validated[] = [
                    'row' => $rowNumber, 'record' => $record, 'errors' => [],
                    'warnings' => ['Example row from the template — it will not be imported.'],
                    'existingId' => null, 'skip' => true, 'draftReasons' => [], 'payload' => null,
                ];

                continue;
            }

            if ($name === '') {
                $errors[] = 'Product Name is required.';
            }
            if ($sku === '') {
                $errors[] = 'SKU is required.';
            }

            // Reasons a row is saved as a Draft instead of being rejected. Nothing is
            // invented: a missing price stays unset and a missing material stays empty.
            $draftReasons = [];

            $priceText = preg_replace('/[^\d.]/u', '', $record['Price'] ?? '');
            $price = 0.0;
            if ($priceText === '') {
                $draftReasons[] = 'Price missing';
                $warnings[] = 'Price missing — product imported as Draft.';
            } elseif (! is_numeric($priceText) || (float) $priceText <= 0) {
                $errors[] = 'Price must be a valid number greater than zero.';
            } else {
                $price = (float) $priceText;
            }

            $category = $this->matchInsensitive($record['Category'] ?? '', $categories);
            if (trim($record['Category'] ?? '') === '') {
                $errors[] = 'Category is required.';
            } elseif (! $category) {
                $errors[] = 'Invalid Category: '.$record['Category'];
            }

            $materialText = trim($record['Material'] ?? '');
            $material = '';
            if ($materialText === '') {
                $draftReasons[] = 'Material missing';
                $warnings[] = 'Material missing — product imported as Draft.';
            } else {
                $found = $this->matchInsensitive($materialText, $materials);
                if (! $found) {
                    $errors[] = "Invalid Material: {$materialText}";
                } else {
                    $material = $found;
                }
            }

            $collection = '';
            $collectionText = trim($record['Collection'] ?? '');
            if ($collectionText !== '') {
                $found = $this->matchInsensitive($collectionText, $collections);
                if (! $found) {
                    $errors[] = "Invalid Collection: {$collectionText}";
                } else {
                    $collection = $found;
                }
            }

            $existingId = $sku !== '' ? ($skus[strtolower($sku)] ?? null) : null;
            if ($sku !== '' && isset($seenSkus[strtolower($sku)])) {
                $errors[] = "SKU appears more than once in this file: {$sku}";
            }
            if ($sku !== '') {
                $seenSkus[strtolower($sku)] = true;
            }
            if ($existingId) {
                $warnings[] = $mode === 'create'
                    ? "SKU already exists: {$sku}"
                    : "SKU already exists: {$sku} — this product will be updated.";
            }

            // A duplicate web address never overwrites an existing product: we add a
            // -2 / -3 suffix until the address is free, in the database and in this file.
            $baseSlug = Csv::slugify(trim($record['Slug'] ?? '') ?: $name);
            $slug = $baseSlug;
            if ($baseSlug === '') {
                $errors[] = 'Slug could not be generated — please set a Slug.';
            } else {
                $suffix = 2;
                $taken = function (string $candidate) use ($slugs, $existingId, $seenSlugs): bool {
                    $owner = $slugs[$candidate] ?? null;

                    return ($owner && $owner !== $existingId) || isset($seenSlugs[$candidate]);
                };
                while ($taken($slug)) {
                    $slug = $baseSlug.'-'.$suffix++;
                }
                if ($slug !== $baseSlug) {
                    $warnings[] = "Web address already in use — saved as {$slug} instead.";
                }
                $seenSlugs[$slug] = true;
            }

            $visibility = Csv::parseVisibility($record['Visibility'] ?? '');
            if ($visibility === null) {
                $errors[] = 'Visibility must be Published or Draft: '.($record['Visibility'] ?? '');
            }
            if (trim($record['Visibility'] ?? '') === '') {
                $warnings[] = 'Visibility is blank — saved as Draft.';
            }

            $booleans = [
                'Featured' => Csv::parseBoolean($record['Featured'] ?? ''),
                'New Arrival' => Csv::parseBoolean($record['New Arrival'] ?? ''),
            ];
            foreach ($booleans as $label => $value) {
                if ($value === null) {
                    $errors[] = "{$label} must be TRUE or FALSE.";
                }
            }

            $occasion = [];
            $ignored = [];
            foreach (Csv::splitList($record['Occasions'] ?? '') as $value) {
                $found = $this->matchInsensitive($value, $occasionsAllowed);
                if ($found) {
                    $occasion[] = $found;
                } else {
                    $ignored[] = $value;
                }
            }
            if ($ignored) {
                $warnings[] = 'Ignored values (not valid occasions): '.implode(', ', $ignored);
            }

            $primaryImage = trim($record['Primary Image URL'] ?? '');
            $additionalImages = Csv::splitList($record['Additional Image URLs'] ?? '');
            foreach (array_filter([$primaryImage, ...$additionalImages]) as $url) {
                if (! Csv::isValidHttpUrl($url)) {
                    $errors[] = "Invalid image URL: {$url}";
                }
            }
            $noImages = $primaryImage === '' && ! $additionalImages;
            if ($noImages) {
                $warnings[] = 'No images provided — add product images later.';
            }
            if ($noImages && $draftReasons) {
                $draftReasons[] = 'Images missing';
            }

            $socialImage = trim($record['Social Image URL'] ?? '');
            if ($socialImage !== '' && ! Csv::isValidHttpUrl($socialImage)) {
                $errors[] = "Invalid Social Image URL: {$socialImage}";
            }

            // Published is only honoured when the product is complete enough to show.
            $published = $visibility === true && ! $draftReasons;
            $skip = $mode === 'create' && (bool) $existingId;

            $payload = null;
            if (! $errors && ! $skip) {
                $payload = [
                    'name' => $name, 'slug' => $slug, 'sku' => $sku, 'price' => $price,
                    'category' => $category, 'material' => $material,
                    'subcategory' => trim($record['Subcategory'] ?? '') ?: ($collection ?: null),
                    'description' => trim($record['Description'] ?? '') ?: null,
                    'shortDescription' => trim($record['Short Description'] ?? ''),
                    'whereToWear' => trim($record['Where to Wear'] ?? '') ?: null,
                    'occasion' => $occasion,
                    'featured' => $booleans['Featured'] === true,
                    'newArrival' => $booleans['New Arrival'] === true,
                    'published' => $published,
                    'wantsPublished' => $visibility === true,
                    'seoTitle' => trim($record['SEO Title'] ?? '') ?: "{$name} | ".\App\Support\Brand::name(),
                    'seoDescription' => trim($record['SEO Description'] ?? '') ?: $this->fallbackSeoDescription($record, $name),
                    'seoImageUrl' => $socialImage,
                    'whatsappMessage' => trim($record['WhatsApp Enquiry Message'] ?? ''),
                    'primaryImage' => $primaryImage,
                    'additionalImages' => $additionalImages,
                    'altText' => trim($record['Image Alt Text'] ?? '') ?: "{$name} - ".\App\Support\Brand::name(),
                ];
            }

            $validated[] = [
                'row' => $rowNumber, 'record' => $record, 'errors' => $errors, 'warnings' => $warnings,
                'existingId' => $existingId, 'skip' => $skip, 'draftReasons' => $draftReasons, 'payload' => $payload,
            ];
        }

        return compact('validated', 'missingColumns', 'unknownColumns', 'fileErrors');
    }

    public function previewImport(string $csv, string $mode): array
    {
        ['validated' => $validated, 'missingColumns' => $missing, 'unknownColumns' => $unknown, 'fileErrors' => $fileErrors] = $this->validateRows($csv, $mode);

        $rows = array_map(function (array $row) {
            $status = $row['errors'] ? 'error' : ($row['skip'] ? 'skipped' : ($row['existingId'] ? 'update' : 'ready'));
            $draft = $row['payload'] !== null && ! $row['payload']['published'];

            return [
                'row' => $row['row'],
                'name' => trim($row['record']['Product Name'] ?? ''),
                'sku' => trim($row['record']['SKU'] ?? ''),
                'category' => trim($row['record']['Category'] ?? ''),
                'price' => trim($row['record']['Price'] ?? ''),
                'visibility' => $row['payload'] !== null ? ($draft ? 'Draft' : 'Published') : '—',
                'status' => $status,
                'errors' => $row['errors'],
                'warnings' => $row['warnings'],
                'existing' => (bool) $row['existingId'],
                'draft' => $draft,
                'draftReasons' => $row['draftReasons'],
            ];
        }, $validated);

        $count = fn (callable $fn) => count(array_filter($rows, $fn));

        return [
            'rows' => $rows,
            'found' => count($rows),
            'ready' => $count(fn ($r) => $r['status'] === 'ready'),
            'updates' => $count(fn ($r) => $r['status'] === 'update'),
            'warnings' => $count(fn ($r) => $r['status'] !== 'error' && $r['warnings']),
            'errors' => $count(fn ($r) => $r['status'] === 'error'),
            'drafts' => $count(fn ($r) => $r['draft'] && $r['status'] !== 'error' && $r['status'] !== 'skipped'),
            'missingColumns' => $missing,
            'unknownColumns' => $unknown,
            'fileErrors' => $fileErrors,
        ];
    }

    /* ----------------------------------------------------------------- images */

    private function extensionFor(string $contentType, string $url): string
    {
        foreach (['webp' => 'webp', 'avif' => 'avif', 'png' => 'png', 'jpeg' => 'jpg', 'jpg' => 'jpg', 'gif' => 'gif'] as $needle => $ext) {
            if (str_contains($contentType, $needle)) {
                return $ext;
            }
        }
        $guess = strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?: '', PATHINFO_EXTENSION));

        return in_array($guess, ['jpg', 'jpeg', 'png', 'webp', 'avif'], true) ? $guess : 'jpg';
    }

    /** A remote host is allowed only when every address it resolves to is public (blocks SSRF). */
    private function isPublicHost(string $host): bool
    {
        $host = trim($host, '[]');
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
        if (! $ips) {
            return false;
        }
        foreach ($ips as $ip) {
            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return false;
            }
        }

        return true;
    }

    /** @return array{0: string, 1: string} [bytes, contentType] */
    private function download(string $url): array
    {
        for ($hop = 0; $hop < 4; $hop++) {
            $parts = parse_url($url);
            if (! $parts || ! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || empty($parts['host'])) {
                throw new \RuntimeException('That URL is not allowed');
            }
            if (! $this->isPublicHost($parts['host'])) {
                throw new \RuntimeException('That address is not allowed');
            }
            $response = Http::timeout(20)->withOptions(['allow_redirects' => false])->withHeaders(['User-Agent' => \App\Support\Brand::name().'-importer'])->get($url);
            if (in_array($response->status(), [301, 302, 303, 307, 308], true) && $response->header('Location')) {
                $location = $response->header('Location');
                $url = str_starts_with($location, 'http') ? $location : ($parts['scheme'].'://'.$parts['host'].'/'.ltrim($location, '/'));

                continue;
            }
            if (! $response->successful()) {
                throw new \RuntimeException("Image download failed ({$response->status()})");
            }

            return [$response->body(), strtolower((string) $response->header('Content-Type'))];
        }
        throw new \RuntimeException('Too many redirects');
    }

    /**
     * Fetches a remote image into the media folder and returns the stored
     * reference. Images that already live in our own media system are reused.
     */
    private function importImage(string $url, array &$cache): string
    {
        if (str_starts_with($url, '/api/public/img/') || str_starts_with($url, '/images/')) {
            return $url;
        }
        if (isset($cache[$url])) {
            return $cache[$url];
        }

        [$bytes, $contentType] = $this->download($url);
        if (! str_starts_with($contentType, 'image/')) {
            throw new \RuntimeException('That URL is not an image');
        }
        if ($bytes === '') {
            throw new \RuntimeException('The image file is empty');
        }
        if (strlen($bytes) > self::MAX_IMAGE_BYTES) {
            throw new \RuntimeException('The image is larger than 8 MB');
        }

        $key = Media::withMonth('products/'.Str::uuid().'.'.$this->extensionFor($contentType, $url));
        Media::put($key, $bytes);

        return $cache[$url] = Media::URL_PREFIX.$key;
    }

    /* ------------------------------------------------------------------ import */

    public function runImport(string $csv, string $mode): array
    {
        ['validated' => $validated, 'fileErrors' => $fileErrors] = $this->validateRows($csv, $mode);
        if ($fileErrors) {
            throw new \RuntimeException($fileErrors[0]);
        }

        $cache = [];
        $rows = [];
        $created = $updated = $skipped = $failed = $drafted = 0;

        foreach ($validated as $row) {
            $sku = trim($row['record']['SKU'] ?? '');
            $name = trim($row['record']['Product Name'] ?? '');

            if ($row['errors']) {
                $failed++;
                $rows[] = ['row' => $row['row'], 'sku' => $sku, 'name' => $name, 'outcome' => 'failed', 'reason' => implode(' ', $row['errors']), 'draft' => false, 'draftReasons' => []];

                continue;
            }
            if ($row['skip'] || ! $row['payload']) {
                $skipped++;
                $rows[] = ['row' => $row['row'], 'sku' => $sku, 'name' => $name, 'outcome' => 'skipped', 'reason' => implode(' ', $row['warnings']) ?: 'Skipped', 'draft' => false, 'draftReasons' => []];

                continue;
            }

            $p = $row['payload'];
            $now = now()->utc()->format('Y-m-d H:i:s');
            $productId = $row['existingId'] ?? (string) Str::uuid();
            $createdHere = ! $row['existingId'];
            $finalPublished = $p['published'];
            $draftReasons = $row['draftReasons'];

            try {
                $specifications = [];
                if ($p['shortDescription'] !== '') {
                    $specifications['short_description'] = $p['shortDescription'];
                }
                if ($p['whatsappMessage'] !== '') {
                    $specifications['whatsapp_message'] = $p['whatsappMessage'];
                }

                if ($createdHere) {
                    DB::table('products')->insert([
                        'id' => $productId, 'name' => $p['name'], 'slug' => $p['slug'], 'sku' => $p['sku'], 'price' => $p['price'],
                        'description' => $p['description'], 'material' => $p['material'], 'category' => $p['category'],
                        'subcategory' => $p['subcategory'],
                        'occasion' => json_encode($p['occasion'], JSON_UNESCAPED_UNICODE),
                        'where_to_wear' => $p['whereToWear'],
                        'specifications' => json_encode((object) $specifications, JSON_UNESCAPED_UNICODE),
                        'featured' => $p['featured'] ? 1 : 0, 'new_arrival' => $p['newArrival'] ? 1 : 0,
                        'published' => $p['published'] ? 1 : 0,
                        'seo_title' => $p['seoTitle'], 'seo_description' => $p['seoDescription'],
                        'seo_image_url' => $p['seoImageUrl'] ?: null,
                        'created_at' => $now, 'updated_at' => $now,
                    ]);
                } else {
                    // Update mode only touches fields the CSV actually carries; blank cells
                    // never wipe existing descriptions, collections or images.
                    $existing = DB::table('products')->where('id', $productId)->first();
                    $mergedSpecs = array_merge($this->decodeJson($existing->specifications ?? null, []), $specifications);
                    $effectivePrice = $p['price'] ?: (float) ($existing->price ?? 0);
                    $effectiveMaterial = $p['material'] ?: ($existing->material ?? '');
                    $canPublish = $effectivePrice > 0 && $effectiveMaterial !== '';
                    $finalPublished = $p['wantsPublished'] && $canPublish;
                    if ($finalPublished) {
                        $draftReasons = [];
                    }

                    DB::table('products')->where('id', $productId)->update([
                        'name' => $p['name'], 'slug' => $p['slug'], 'price' => $effectivePrice,
                        'description' => $p['description'] ?? $existing->description,
                        'material' => $effectiveMaterial, 'category' => $p['category'],
                        'subcategory' => $p['subcategory'] ?? $existing->subcategory,
                        'occasion' => $p['occasion'] ? json_encode($p['occasion'], JSON_UNESCAPED_UNICODE) : ($existing->occasion ?: '[]'),
                        'where_to_wear' => $p['whereToWear'] ?? $existing->where_to_wear,
                        'specifications' => json_encode((object) $mergedSpecs, JSON_UNESCAPED_UNICODE),
                        'featured' => $p['featured'] ? 1 : 0, 'new_arrival' => $p['newArrival'] ? 1 : 0,
                        'published' => $finalPublished ? 1 : 0,
                        'seo_title' => $p['seoTitle'], 'seo_description' => $p['seoDescription'],
                        'seo_image_url' => $p['seoImageUrl'] ?: ($existing->seo_image_url ?? null),
                        'updated_at' => $now,
                    ]);

                    if ($existing && $existing->slug !== $p['slug']) {
                        DB::table('slug_redirects')->upsert([[
                            'id' => (string) Str::uuid(), 'entity_type' => 'product',
                            'source_slug' => $existing->slug, 'target_slug' => $p['slug'],
                            'source_path' => "/product/{$existing->slug}", 'target_path' => "/product/{$p['slug']}",
                            'created_at' => $now, 'updated_at' => $now,
                        ]], ['source_path'], ['target_slug', 'target_path', 'updated_at']);
                    }
                }

                $urls = array_values(array_filter([$p['primaryImage'], ...$p['additionalImages']]));
                $imageWarnings = [];
                if ($urls) {
                    $have = DB::table('product_images')->where('product_id', $productId)->pluck('image_url')->flip()->all();
                    $order = count($have);
                    foreach ($urls as $url) {
                        try {
                            $stored = $this->importImage($url, $cache);
                            if (isset($have[$stored])) {
                                continue;
                            }
                            DB::table('product_images')->insert([
                                'id' => (string) Str::uuid(), 'product_id' => $productId, 'image_url' => $stored,
                                'alt_text' => $p['altText'], 'sort_order' => $order, 'created_at' => $now,
                            ]);
                            $have[$stored] = true;
                            $order++;
                        } catch (\Throwable $e) {
                            $imageWarnings[] = "{$url}: ".$e->getMessage();
                        }
                    }
                }

                $createdHere ? $created++ : $updated++;
                $isDraft = ! $finalPublished;
                if ($isDraft) {
                    $drafted++;
                }
                $reason = [];
                if ($draftReasons) {
                    $reason[] = 'Imported as Draft — '.implode(', ', $draftReasons);
                }
                if ($imageWarnings) {
                    $reason[] = 'Image problems — '.implode('; ', $imageWarnings);
                }
                $rows[] = [
                    'row' => $row['row'], 'sku' => $sku, 'name' => $name,
                    'outcome' => $createdHere ? 'created' : 'updated',
                    'reason' => implode(' · ', $reason), 'draft' => $isDraft, 'draftReasons' => $draftReasons,
                ];
            } catch (\Throwable $e) {
                // Per-product rollback: a half-created product is removed again so the
                // catalogue never keeps a broken record (images cascade with it).
                if ($createdHere) {
                    try {
                        DB::table('products')->where('id', $productId)->delete();
                    } catch (\Throwable) {
                        // nothing more we can do
                    }
                }
                $failed++;
                $rows[] = ['row' => $row['row'], 'sku' => $sku, 'name' => $name, 'outcome' => 'failed', 'reason' => 'Import failed', 'draft' => false, 'draftReasons' => []];
                report($e);
            }
        }

        return compact('created', 'updated', 'skipped', 'failed', 'drafted', 'rows');
    }
}
