<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Admin -> Media: every file in the uploads folder (product photos, banners, reels and anything the
 * owner adds here), with upload and a delete that refuses to remove a file something still uses.
 * Only a signed-in admin reaches this (RequireAdmin middleware).
 */
class MediaLibraryController extends Controller
{
    private const KINDS = ['image', 'video', 'pdf', 'audio', 'other'];

    /** Largest accepted upload per kind, in bytes. */
    private function limit(string $kind, string $ext): int
    {
        return match (true) {
            $ext === 'svg' => 1 * 1024 * 1024,
            $kind === 'image' => (int) config('shop.max_image_bytes'),
            $kind === 'video' => (int) config('shop.max_video_bytes'),
            default => 20 * 1024 * 1024,
        };
    }

    /**
     * Which parts of the website use each stored file, read from the database in a handful of queries.
     * Tokens: products, reels, blog, pages, page:<id>, website, collections, orders.
     *
     * @return array{map: array<string, array<string, true>>, pages: list<array{id: string, title: string}>}
     */
    private function usageMap(): array
    {
        $map = [];
        $add = static function (mixed $url, string ...$tokens) use (&$map): void {
            if (is_string($url) && str_starts_with($url, Media::URL_PREFIX)) {
                foreach ($tokens as $t) {
                    $map[$url][$t] = true;
                }
            }
        };
        // Pictures inside page blocks and settings are stored as text, so pick the addresses out of it.
        $scan = static function (mixed $text, string ...$tokens) use ($add): void {
            if (! is_string($text) || $text === '') {
                return;
            }
            preg_match_all('#/api/public/img/[A-Za-z0-9._\-/]+#', str_replace('\\/', '/', $text), $m);
            foreach (array_unique($m[0]) as $u) {
                $add($u, ...$tokens);
            }
        };

        foreach (DB::table('product_images')->pluck('image_url') as $u) {
            $add($u, 'products');
        }
        foreach (DB::table('product_variants')->whereNotNull('image_url')->pluck('image_url') as $u) {
            $add($u, 'products');
        }
        foreach (DB::table('product_variants')->whereNotNull('video_url')->pluck('video_url') as $u) {
            $add($u, 'products');
        }
        foreach (DB::table('products')->whereNotNull('video_url')->pluck('video_url') as $u) {
            $add($u, 'products');
        }
        foreach (DB::table('products')->whereNotNull('seo_image_url')->pluck('seo_image_url') as $u) {
            $add($u, 'products');
        }
        foreach (DB::table('reels')->get(['video_url', 'poster_url']) as $r) {
            $add($r->video_url, 'reels');
            $add($r->poster_url, 'reels');
        }
        foreach (DB::table('site_media')->get(['image_url', 'mobile_image_url']) as $r) {
            $add($r->image_url, 'website');
            $add($r->mobile_image_url, 'website');
        }
        foreach (DB::table('site_settings')->pluck('value') as $v) {
            $scan($v, 'website');
        }
        foreach (['collections', 'categories'] as $table) {
            foreach (DB::table($table)->get(['image', 'seo_image_url']) as $r) {
                $add($r->image, 'collections');
                $add($r->seo_image_url, 'collections');
            }
        }
        foreach (DB::table('order_items')->whereNotNull('image_url')->distinct()->pluck('image_url') as $u) {
            $add($u, 'orders');
        }

        $pages = [];
        foreach (DB::table('pages')->get(['id', 'title', 'kind', 'blocks', 'cover_url', 'seo_image_url']) as $p) {
            $tokens = $p->kind === 'post' ? ['blog'] : ['pages', 'page:'.$p->id];
            $before = count($map, COUNT_RECURSIVE);
            $add($p->cover_url, ...$tokens);
            $add($p->seo_image_url, ...$tokens);
            $scan(is_string($p->blocks) ? $p->blocks : json_encode($p->blocks), ...$tokens);
            if ($p->kind !== 'post' && count($map, COUNT_RECURSIVE) !== $before) {
                $pages[] = ['id' => (string) $p->id, 'title' => (string) $p->title];
            }
        }
        usort($pages, static fn (array $a, array $b): int => strcasecmp($a['title'], $b['title']));

        return ['map' => $map, 'pages' => $pages];
    }

    /**
     * Files the website points at that are not in the uploads folder (so they show as broken pictures or videos).
     *
     * @param  array<string, array<string, true>>  $map  address => where it is used
     * @return list<array{url: string, name: string, uses: list<string>}>
     */
    private function missing(array $map): array
    {
        $out = [];
        foreach ($map as $url => $tokens) {
            if (! str_starts_with($url, Media::URL_PREFIX) || ! Media::isSafeKey(substr($url, strlen(Media::URL_PREFIX)))) {
                continue;
            }
            $key = substr($url, strlen(Media::URL_PREFIX));
            // Past orders keep their own copy of a picture address; a product photo missing there is not news by itself.
            $uses = array_values(array_filter(array_keys($tokens), static fn (string $t): bool => $t !== 'orders'));
            if ($uses && ! Media::exists($key)) {
                $out[] = ['url' => $url, 'name' => basename($key), 'uses' => $uses];
            }
        }
        usort($out, static fn (array $a, array $b): int => strcmp($a['url'], $b['url']));

        return array_slice($out, 0, 300);
    }

    /** Just the addresses that are missing, for screens that want to flag a broken item (for example a reel). */
    public function missingFiles(): JsonResponse
    {
        return response()->json(['missing' => array_column($this->missing($this->usageMap()['map']), 'url')]);
    }

    public function index(Request $request): JsonResponse
    {
        $q = Str::lower(trim((string) $request->query('q', '')));
        $kind = (string) $request->query('kind', '');
        $usageFilter = (string) $request->query('usage', '');
        $folder = (string) $request->query('folder', '');
        $sort = (string) $request->query('sort', 'newest');
        $page = max(1, (int) $request->query('page', 1));
        $per = min(100, max(12, (int) $request->query('per', 48)));

        $all = [];
        $root = Media::root();
        if (is_dir($root)) {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS | \FilesystemIterator::UNIX_PATHS),
            );
            /** @var \SplFileInfo $f */
            foreach ($iterator as $f) {
                if (! $f->isFile()) {
                    continue;
                }
                $key = ltrim(str_replace('\\', '/', substr($f->getPathname(), strlen($root))), '/');
                if (! Media::isSafeKey($key)) {
                    continue;
                }
                $all[] = [
                    'key' => $key,
                    'name' => $f->getBasename(),
                    'folder' => str_contains($key, '/') ? strstr($key, '/', true) : '',
                    'kind' => Media::kindFor($key),
                    'ext' => strtolower($f->getExtension()),
                    'size' => $f->getSize(),
                    'modified' => $f->getMTime(),
                ];
            }
        }

        $usage = $this->usageMap();
        foreach ($all as &$item) {
            $tokens = array_keys($usage['map'][Media::URL_PREFIX.$item['key']] ?? []);
            $item['uses'] = $tokens;
            if ($tokens === []) {
                $item['uses'] = ['unused'];
            }
        }
        unset($item);

        // Totals for the filter chips come from the whole library, before any filter.
        $kinds = array_fill_keys(self::KINDS, 0);
        $folders = [];
        $uses = [];
        $bytes = 0;
        foreach ($all as $item) {
            $kinds[$item['kind']]++;
            $folders[$item['folder']] = ($folders[$item['folder']] ?? 0) + 1;
            foreach ($item['uses'] as $t) {
                $uses[$t] = ($uses[$t] ?? 0) + 1;
            }
            $bytes += $item['size'];
        }
        ksort($folders);

        $rows = array_values(array_filter($all, static function (array $i) use ($q, $kind, $folder, $usageFilter): bool {
            return ($kind === '' || $i['kind'] === $kind)
                && ($usageFilter === '' || in_array($usageFilter, $i['uses'], true))
                && ($folder === '' || $i['folder'] === ($folder === '_root' ? '' : $folder))
                && ($q === '' || str_contains(Str::lower($i['key']), $q));
        }));

        usort($rows, static fn (array $a, array $b): int => match ($sort) {
            'oldest' => $a['modified'] <=> $b['modified'],
            'name' => strcasecmp($a['name'], $b['name']),
            'size' => $b['size'] <=> $a['size'],
            default => $b['modified'] <=> $a['modified'],
        });

        $total = count($rows);
        $pages = max(1, (int) ceil($total / $per));
        $page = min($page, $pages);
        $items = array_map(function (array $i): array {
            $i['url'] = Media::URL_PREFIX.$i['key'];
            $i['width'] = null;
            $i['height'] = null;
            if ($i['kind'] === 'image' && $i['ext'] !== 'svg') {
                $dim = @getimagesize(Media::path($i['key']));
                if ($dim !== false) {
                    [$i['width'], $i['height']] = $dim;
                }
            }

            return $i;
        }, array_slice($rows, ($page - 1) * $per, $per));

        return response()->json([
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'pages' => $pages,
            'missing' => $this->missing($usage['map']),
            'storage' => \App\Support\AdminAuth::isSuper($request) ? Media::diagnostics() : null,
            'stats' => ['files' => count($all), 'bytes' => $bytes, 'kinds' => $kinds, 'folders' => $folders, 'uses' => $uses, 'pages' => $usage['pages']],
        ]);
    }

    public function upload(Request $request): JsonResponse
    {
        $request->validate(['file' => ['required', 'file']], ['file.required' => 'Choose a file.', 'file.file' => 'The upload did not finish. The file may be larger than the server allows.']);
        $file = $request->file('file');
        if (! $file || ! $file->isValid()) {
            return response()->json(['message' => 'The upload did not finish. The file may be larger than the server allows ('.ini_get('upload_max_filesize').').'], 422);
        }

        $type = Media::detect($file->getRealPath());
        if ($type === null) {
            return response()->json(['message' => 'That file type is not supported. Use JPG, PNG, WebP, AVIF, GIF, SVG, PDF, MP4, WebM, MOV or MP3.'], 422);
        }
        $max = $this->limit($type['kind'], $type['ext']);
        if ($file->getSize() > $max) {
            return response()->json(['message' => 'That file is larger than '.round($max / 1048576).' MB. Please compress it first.'], 422);
        }
        if ($type['ext'] === 'svg' && ! Media::svgIsSafe((string) file_get_contents($file->getRealPath()))) {
            return response()->json(['message' => 'This SVG contains scripts or links to other sites, so it was not accepted. Export a plain SVG and try again.'], 422);
        }

        $base = Str::slug(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME));
        $base = $base === '' ? 'file' : Str::limit($base, 60, '');
        $key = Media::withMonth('library/'.$base.'-'.Str::lower(Str::random(6)).'.'.$type['ext']);

        try {
            Media::putFile($key, $file->getRealPath());
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['url' => Media::URL_PREFIX.$key, 'key' => $key]);
    }

    /** Where a file is used, so the owner knows what a delete would break. */
    public function usage(Request $request): JsonResponse
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:500']]);
        if (! str_starts_with($data['url'], Media::URL_PREFIX)) {
            return response()->json(['message' => 'Invalid file address.'], 422);
        }

        return response()->json(['uses' => Media::references($data['url'])]);
    }

    /** Deletes only files nothing uses; the rest are reported back and left alone. */
    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['urls' => ['required', 'array', 'min:1', 'max:100'], 'urls.*' => ['string', 'max:500']]);

        $deleted = [];
        $blocked = [];
        foreach (array_unique($data['urls']) as $url) {
            if (! str_starts_with($url, Media::URL_PREFIX) || ! Media::exists(substr($url, strlen(Media::URL_PREFIX)))) {
                continue;
            }
            if (Media::deleteIfUnreferenced($url)) {
                $deleted[] = $url;
            } else {
                $blocked[] = ['url' => $url, 'uses' => Media::references($url)];
            }
        }

        return response()->json(['deleted' => $deleted, 'blocked' => $blocked]);
    }
}
