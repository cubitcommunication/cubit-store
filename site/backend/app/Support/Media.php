<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Image storage on the web server's disk (replaces the Cloudflare R2 bucket).
 *
 * Files live under <public>/media/<key>. Their public address is
 * /api/public/img/<key>, exactly the URL the database already stores, so no
 * image reference had to change in the move. Apache serves existing files
 * straight from disk (see public/.htaccess); this class is the write path and
 * the PHP fallback for reads.
 */
final class Media
{
    public const URL_PREFIX = '/api/public/img/';

    private const TYPES = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'avif' => 'image/avif',
        'gif' => 'image/gif',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'mov' => 'video/quicktime',
        'svg' => 'image/svg+xml',
        'pdf' => 'application/pdf',
        'mp3' => 'audio/mpeg',
    ];

    public static function root(): string
    {
        $configured = config('shop.media_path');
        $docRoot = ! app()->runningInConsole() && isset($_SERVER['DOCUMENT_ROOT']) ? (string) $_SERVER['DOCUMENT_ROOT'] : null;

        return rtrim(self::resolveRoot(is_string($configured) ? $configured : null, $docRoot, public_path('media'), base_path()), '/\\');
    }

    /**
     * Picks the uploads folder. Files must never live inside the application folder, because every deploy replaces that
     * folder and would delete them. If the default folder is inside the application and the real web root already has a
     * `media` folder, that one is used (it is where the web server looks for /api/public/img/<file> anyway).
     */
    public static function resolveRoot(?string $configured, ?string $docRoot, string $publicMedia, string $basePath): string
    {
        if ($configured !== null && $configured !== '') {
            return $configured;
        }
        $inside = static function (string $path, string $folder): bool {
            $a = str_replace('\\', '/', (string) (realpath($path) ?: $path));
            $b = rtrim(str_replace('\\', '/', (string) (realpath($folder) ?: $folder)), '/');

            return $a === $b || str_starts_with($a, $b.'/');
        };
        if ($docRoot !== null && $docRoot !== '' && $inside($publicMedia, $basePath)) {
            $candidate = rtrim($docRoot, '/\\').'/media';
            if (is_dir($candidate) && ! $inside($candidate, $basePath)) {
                return $candidate;
            }
        }

        return $publicMedia;
    }

    /**
     * Facts about the uploads folder for the main administrator: where it is, whether it can be written to, and whether
     * it sits inside the application folder (which a deploy replaces).
     *
     * @return array<string, mixed>
     */
    public static function diagnostics(): array
    {
        $root = self::root();
        $base = str_replace('\\', '/', (string) (realpath(base_path()) ?: base_path()));
        $real = str_replace('\\', '/', (string) (realpath($root) ?: $root));

        return [
            'root' => $root,
            'exists' => is_dir($root),
            'writable' => is_dir($root) && is_writable($root),
            'insideApp' => $real === $base || str_starts_with($real, rtrim($base, '/').'/'),
            'configuredByEnv' => (string) config('shop.media_path') !== '',
            'documentRoot' => isset($_SERVER['DOCUMENT_ROOT']) ? (string) $_SERVER['DOCUMENT_ROOT'] : null,
        ];
    }

    /**
     * New uploads are filed by the month they were added: products/<uuid>.webp becomes 2026-11/products/<uuid>.webp.
     * The folder is created on the first upload of the month, so nothing has to be set up in advance. Files already
     * stored keep their paths (the database points at them), and a key that already starts with a month is left as it is.
     */
    public static function withMonth(string $key): string
    {
        if (preg_match('#^\d{4}-\d{2}/#', $key)) {
            return $key;
        }

        return now(\App\Support\Brand::timezone())->format('Y-m').'/'.ltrim($key, '/');
    }

    /** Keys are relative paths such as products/<uuid>.webp. Anything odd is rejected. */
    public static function isSafeKey(mixed $key): bool
    {
        if (! is_string($key) || ! preg_match('#^[A-Za-z0-9][A-Za-z0-9._\-/]{0,200}$#', $key)) {
            return false;
        }
        if (str_contains($key, '..') || str_contains($key, '//')) {
            return false;
        }
        $ext = strtolower(pathinfo($key, PATHINFO_EXTENSION));

        return isset(self::TYPES[$ext]);
    }

    public static function contentTypeFor(string $key): string
    {
        return self::TYPES[strtolower(pathinfo($key, PATHINFO_EXTENSION))] ?? 'application/octet-stream';
    }

    public static function path(string $key): string
    {
        return self::root().DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $key);
    }

    public static function exists(string $key): bool
    {
        return self::isSafeKey($key) && is_file(self::path($key));
    }

    /** @throws \RuntimeException when the file is not a real image or cannot be written */
    public static function put(string $key, string $bytes): void
    {
        if (! self::isSafeKey($key)) {
            throw new \RuntimeException('Invalid image path.');
        }
        if ($bytes === '' || strlen($bytes) > (int) config('shop.max_image_bytes')) {
            throw new \RuntimeException('The image is empty or larger than 8 MB.');
        }
        // The bytes must really be an image, whatever the file name says.
        $info = @getimagesizefromstring($bytes);
        if ($info === false || ! str_starts_with((string) ($info['mime'] ?? ''), 'image/')) {
            throw new \RuntimeException('That file is not a valid image.');
        }

        $file = self::path($key);
        $dir = dirname($file);
        if (! is_dir($dir) && ! @mkdir($dir, 0755, true) && ! is_dir($dir)) {
            throw new \RuntimeException('Could not create the image folder.');
        }
        if (file_put_contents($file, $bytes, LOCK_EX) === false) {
            throw new \RuntimeException('Could not save the image.');
        }
    }

    public static function delete(string $key): void
    {
        if (self::isSafeKey($key) && is_file(self::path($key))) {
            @unlink(self::path($key));
        }
    }

    /** 'mp4' or 'webm' when the first bytes of a file really are that kind of video, else null. */
    public static function videoExtension(string $head): ?string
    {
        if (strlen($head) >= 12 && substr($head, 4, 4) === 'ftyp') {
            return 'mp4';
        }
        if (str_starts_with($head, "\x1A\x45\xDF\xA3")) {
            return 'webm';
        }

        return null;
    }

    /** Moves an already validated upload (a video) into the media folder. @throws \RuntimeException */
    public static function putFile(string $key, string $source): void
    {
        if (! self::isSafeKey($key)) {
            throw new \RuntimeException('Invalid file path.');
        }
        $file = self::path($key);
        $dir = dirname($file);
        if (! is_dir($dir) && ! @mkdir($dir, 0755, true) && ! is_dir($dir)) {
            throw new \RuntimeException('Could not create the media folder.');
        }
        if (! @copy($source, $file)) {
            throw new \RuntimeException('Could not save the video.');
        }
    }

    /** The kind of a file, from its extension: image, video, pdf, audio or other. */
    public static function kindFor(string $key): string
    {
        return match (strtolower(pathinfo($key, PATHINFO_EXTENSION))) {
            'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg' => 'image',
            'mp4', 'webm', 'mov' => 'video',
            'pdf' => 'pdf',
            'mp3' => 'audio',
            default => 'other',
        };
    }

    /**
     * Works out what an uploaded file really is from its first bytes, whatever its name says.
     *
     * @return array{ext: string, kind: string}|null
     */
    public static function detect(string $path): ?array
    {
        $head = (string) @file_get_contents($path, false, null, 0, 4096);
        if ($head === '') {
            return null;
        }
        if (str_starts_with($head, '%PDF-')) {
            return ['ext' => 'pdf', 'kind' => 'pdf'];
        }
        if (strlen($head) >= 12 && substr($head, 4, 4) === 'ftyp') {
            return substr($head, 8, 4) === 'qt  ' ? ['ext' => 'mov', 'kind' => 'video'] : ['ext' => 'mp4', 'kind' => 'video'];
        }
        if (str_starts_with($head, "\x1A\x45\xDF\xA3")) {
            return ['ext' => 'webm', 'kind' => 'video'];
        }
        if (str_starts_with($head, 'ID3') || (ord($head[0]) === 0xFF && (ord($head[1] ?? "\0") & 0xE0) === 0xE0)) {
            return ['ext' => 'mp3', 'kind' => 'audio'];
        }
        $info = @getimagesize($path);
        if ($info !== false) {
            $ext = match ($info[2] ?? 0) {
                IMAGETYPE_JPEG => 'jpg',
                IMAGETYPE_PNG => 'png',
                IMAGETYPE_GIF => 'gif',
                IMAGETYPE_WEBP => 'webp',
                IMAGETYPE_AVIF => 'avif',
                default => null,
            };

            return $ext ? ['ext' => $ext, 'kind' => 'image'] : null;
        }
        if (preg_match('/^(\xEF\xBB\xBF)?\s*(<\?xml[^>]*\?>\s*)?(<!--.*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg\b/is', $head)) {
            return ['ext' => 'svg', 'kind' => 'image'];
        }

        return null;
    }

    /**
     * An SVG is code, so it is only accepted when it is plain artwork: no scripts, event handlers,
     * embedded pages or links to other sites. (It is also served with a locked-down policy.)
     */
    public static function svgIsSafe(string $svg): bool
    {
        if (preg_match('/<\s*(script|foreignObject|iframe|embed|object|audio|video|animate|set)\b|<!ENTITY|\son[a-z]+\s*=|javascript:|data:text|vbscript:/i', $svg)) {
            return false;
        }
        // Any href must point inside the file (#id) or at an embedded raster image.
        if (preg_match_all('/href\s*=\s*["\']([^"\']*)["\']/i', $svg, $m)) {
            foreach ($m[1] as $href) {
                $href = trim($href);
                if ($href !== '' && $href[0] !== '#' && ! preg_match('#^data:image/(png|jpe?g|gif|webp);base64,#i', $href)) {
                    return false;
                }
            }
        }

        return ! preg_match('/url\(\s*["\']?\s*(https?:|\/\/)/i', $svg);
    }

    /**
     * Where a stored file is used, as [label, count] pairs. Empty means nothing points at it.
     *
     * @return list<array{label: string, count: int}>
     */
    public static function references(string $url): array
    {
        $like = '%'.addcslashes($url, '\\%_').'%';
        // JSON text may store the slashes escaped (\/), so look for that spelling too.
        $likeJson = '%'.addcslashes(str_replace('/', '\\/', $url), '\\%_').'%';
        $checks = [
            ['Product photos', 'SELECT COUNT(*) AS c FROM product_images WHERE image_url = ?', [$url]],
            ['Product options', 'SELECT COUNT(*) AS c FROM product_variants WHERE image_url = ?', [$url]],
            ['Product videos', 'SELECT COUNT(*) AS c FROM products WHERE video_url = ?', [$url]],
            ['Variation videos', 'SELECT COUNT(*) AS c FROM product_variants WHERE video_url = ?', [$url]],
            ['Product search preview', 'SELECT COUNT(*) AS c FROM products WHERE seo_image_url = ?', [$url]],
            ['Website pictures', 'SELECT COUNT(*) AS c FROM site_media WHERE image_url = ? OR mobile_image_url = ?', [$url, $url]],
            ['Website picture history', 'SELECT COUNT(*) AS c FROM site_media_versions WHERE image_url = ? OR mobile_image_url = ?', [$url, $url]],
            ['Collections', 'SELECT COUNT(*) AS c FROM collections WHERE image = ? OR seo_image_url = ?', [$url, $url]],
            ['Categories', 'SELECT COUNT(*) AS c FROM categories WHERE image = ? OR seo_image_url = ?', [$url, $url]],
            ['Reels', 'SELECT COUNT(*) AS c FROM reels WHERE video_url = ? OR poster_url = ?', [$url, $url]],
            ['Pages and blog posts', 'SELECT COUNT(*) AS c FROM pages WHERE blocks LIKE ? OR blocks LIKE ? OR seo_image_url = ? OR cover_url = ?', [$like, $likeJson, $url, $url]],
            ['Store settings', 'SELECT COUNT(*) AS c FROM site_settings WHERE value LIKE ?', [$like]],
            ['Past orders', 'SELECT COUNT(*) AS c FROM order_items WHERE image_url = ?', [$url]],
        ];

        $out = [];
        foreach ($checks as [$label, $sql, $bindings]) {
            $count = (int) (DB::selectOne($sql, $bindings)->c ?? 0);
            if ($count > 0) {
                $out[] = ['label' => $label, 'count' => $count];
            }
        }

        return $out;
    }

    /** Counts every database row that points at a stored file URL. */
    public static function countReferences(string $url): int
    {
        return array_sum(array_column(self::references($url), 'count'));
    }

    /**
     * Shared-reference-safe deletion: the file is removed only when no product,
     * banner, collection or category still points at it. External URLs are never touched.
     */
    public static function deleteIfUnreferenced(string $url): bool
    {
        if (! str_starts_with($url, self::URL_PREFIX)) {
            return false;
        }
        if (self::countReferences($url) > 0) {
            return false;
        }
        self::delete(substr($url, strlen(self::URL_PREFIX)));

        return true;
    }
}
