<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Server-side <head> for the single-page app.
 *
 * Search engines and link previews (WhatsApp, Facebook, Instagram) do not run
 * JavaScript, so Laravel writes the right <title>, description, Open Graph tags
 * and JSON-LD into the HTML for every page before it is sent. It mirrors the
 * head() definitions of the React routes. Once React has started it replaces
 * these tags with its own (they are marked data-shop-ssr and removed).
 *
 * resolve() returns:
 *   ['status' => 200|404, 'redirect' => ?string, 'meta' => string of HTML tags]
 */
final class Seo
{
    // Texts below may contain {brand}; it becomes the store name (config/brand.php) when the tags are written.
    private const DEFAULT_TITLE = '{brand}';

    public static function siteUrl(): string
    {
        return Brand::siteUrl();
    }

    public static function absoluteUrl(string $path = '/'): string
    {
        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        return self::siteUrl().(str_starts_with($path, '/') ? $path : '/'.$path);
    }

    public static function description(?string $value, string $fallback): string
    {
        $text = trim((string) $value) !== '' ? (string) $value : $fallback;

        return mb_substr(trim((string) preg_replace('/\s+/', ' ', $text)), 0, 158);
    }

    /** The store's currency symbol and digit grouping (Indian lakh grouping for en-IN, e.g. ₹1,25,000; thousands otherwise). */
    public static function price(float $value): string
    {
        $n = (string) (int) round($value);
        if (Brand::get('locale') !== 'en-IN') {
            return Brand::currencySymbol().number_format((float) $n, 0, '.', ',');
        }
        if (strlen($n) > 3) {
            $last = substr($n, -3);
            $rest = substr($n, 0, -3);
            $n = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest).','.$last;
        }

        return Brand::currencySymbol().$n;
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /** Builds the tag block for one page. */
    public static function tags(string $path, string $title, string $description, ?string $image = null, string $type = 'website', bool $noindex = false, array $jsonLd = []): string
    {
        $title = Brand::fill($title);
        $description = Brand::fill($description);
        $url = self::absoluteUrl($path);
        $img = $image ? self::absoluteUrl($image) : null;
        $meta = [
            ['name', 'description', $description],
            ['name', 'robots', $noindex ? 'noindex, follow' : 'index, follow'],
            ['property', 'og:site_name', Brand::name()],
            ['property', 'og:title', $title],
            ['property', 'og:description', $description],
            ['property', 'og:type', $type],
            ['property', 'og:url', $url],
            ['name', 'twitter:card', 'summary_large_image'],
            ['name', 'twitter:title', $title],
            ['name', 'twitter:description', $description],
            ['name', 'theme-color', '#000000'],
        ];
        if ($img) {
            $meta[] = ['property', 'og:image', $img];
            $meta[] = ['name', 'twitter:image', $img];
        }

        $html = '<title data-shop-ssr>'.self::e($title)."</title>\n";
        foreach ($meta as [$attr, $key, $content]) {
            $html .= '    <meta data-shop-ssr '.$attr.'="'.self::e($key).'" content="'.self::e($content).'">'."\n";
        }
        $html .= '    <link data-shop-ssr rel="canonical" href="'.self::e($url).'">'."\n";
        foreach ($jsonLd as $data) {
            $html .= '    <script data-shop-ssr type="application/ld+json">'
                .Brand::fillJson((string) json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP))
                ."</script>\n";
        }

        return $html;
    }

    public static function breadcrumb(array $items): array
    {
        return [
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => array_map(fn ($item, $i) => [
                '@type' => 'ListItem',
                'position' => $i + 1,
                'name' => $item[0],
                'item' => self::absoluteUrl($item[1]),
            ], $items, array_keys($items)),
        ];
    }

    /** @return array{status: int, redirect: ?string, meta: string} */
    public static function resolve(string $path, array $query = []): array
    {
        $path = '/'.trim($path, '/');
        $ok = fn (string $meta) => ['status' => 200, 'redirect' => null, 'meta' => $meta];

        // The page builder's canvas is only ever shown inside the admin.
        if ($path === '/page-preview') {
            return $ok(self::tags($path, 'Page builder canvas — {brand}', '{brand} page builder canvas.', null, 'website', true));
        }

        // Admin area: never indexed.
        if ($path === '/admin' || str_starts_with($path, '/admin/')) {
            return $ok(self::tags($path, '{brand} Admin', '{brand} admin panel.', null, 'website', true));
        }

        // Shopping and account pages: real pages for visitors, never indexed by search engines.
        if (preg_match('#^/(cart|checkout|wishlist|account|login|register|forgot-password|reset-password)(/|$)#', $path, $m)) {
            $titles = [
                'cart' => 'Your cart', 'checkout' => 'Checkout', 'wishlist' => 'Your wishlist', 'account' => 'Your account',
                'login' => 'Sign in', 'register' => 'Create account', 'forgot-password' => 'Forgot password', 'reset-password' => 'Reset password',
            ];

            return $ok(self::tags($path, $titles[$m[1]].' — {brand}', '{brand} '.strtolower($titles[$m[1]]).'.', null, 'website', true));
        }

        $static = self::staticPage($path, $query);
        if ($static !== null) {
            return $ok($static);
        }

        if (preg_match('#^/product/([^/]+)$#', $path, $m)) {
            return self::product(rawurldecode($m[1]), $path);
        }
        if (preg_match('#^/pages/([a-z0-9-]+)$#', $path, $m)) {
            return self::builtPage($m[1], $path);
        }
        if (preg_match('#^/policies/([a-z0-9-]+)$#', $path, $m)) {
            return self::policyPage($m[1], $path);
        }
        if (preg_match('#^/blog/([a-z0-9-]+)$#', $path, $m)) {
            return self::blogPost($m[1], $path);
        }
        if (preg_match('#^/collection/([^/]+)$#', $path, $m)) {
            return self::collection(rawurldecode($m[1]), $path);
        }
        if (preg_match('#^/category/([^/]+)$#', $path, $m)) {
            return self::category(rawurldecode($m[1]), $path);
        }
        if (preg_match('#^/collections/([^/]+)$#', $path, $m)) {
            return self::collectionsOfCategory(rawurldecode($m[1]), $path);
        }

        return [
            'status' => 404,
            'redirect' => null,
            'meta' => self::tags($path, 'Page not found — {brand}', 'This {brand} page could not be found.', null, 'website', true),
        ];
    }

    private static function staticPage(string $path, array $query): ?string
    {
        switch ($path) {
            case '/':
                return self::tags('/', '{brand}',
                    Brand::get('description'),
                    null, 'website', false, [[
                        '@context' => 'https://schema.org',
                        '@type' => 'Organization',
                        'name' => '{brand}',
                        'url' => self::siteUrl(),
                        'email' => Brand::get('support_email'),
                        'telephone' => '+'.Brand::get('phone_e164'),
                        'sameAs' => array_values(array_filter([Brand::get('instagram_url'), Brand::get('facebook_url')])),
                    ]]);
            case '/shop':
                return self::tags('/shop', 'Shop — {brand}',
                    'Browse everything from {brand} by category and price. View product details and enquire directly on WhatsApp.',
                    null, 'website', ! empty($query['q']));
            case '/collections':
                return self::tags('/collections', 'Collections — {brand}',
                    'Explore the {brand} collections.');
            case '/about':
                return self::tags('/about', 'About {brand}',
                    'Our story and what {brand} stands for.');
            case '/blog':
                return self::tags('/blog', 'Journal — {brand}',
                    'News, ideas and updates from {brand}.');
            case '/contact':
                return self::tags('/contact', 'Contact {brand} — Enquire on WhatsApp',
                    'Contact {brand} by WhatsApp, phone, e-mail or social media.');
        }

        return null;
    }

    private static function redirectFor(string $path): ?string
    {
        $target = DB::table('slug_redirects')->where('source_path', $path)->value('target_path');

        return is_string($target) && $target !== '' && $target !== $path ? $target : null;
    }

    private static function unavailable(string $path, string $title, string $text, ?string $redirect): array
    {
        if ($redirect) {
            return ['status' => 301, 'redirect' => $redirect, 'meta' => ''];
        }

        return ['status' => 404, 'redirect' => null, 'meta' => self::tags($path, $title, $text, null, 'website', true)];
    }

    private static function product(string $slug, string $path): array
    {
        $p = DB::table('products')->where('slug', $slug)->where('published', 1)->whereNull('archived_at')->first();
        if (! $p) {
            return self::unavailable($path, 'Piece unavailable — {brand}', 'This {brand} piece is unavailable.', self::redirectFor($path));
        }

        $firstImage = DB::table('product_images')->where('product_id', $p->id)->orderBy('sort_order')->value('image_url');
        $title = trim((string) $p->seo_title) !== '' ? trim($p->seo_title) : "{$p->name} — ".self::price((float) $p->price).' | {brand}';
        $description = self::description($p->seo_description, $p->description ?: "{$p->name}, {$p->material} {$p->category} by {brand}. SKU {$p->sku}.");
        $image = $p->seo_image_url ?: $firstImage;
        $url = "/product/{$p->slug}";

        $product = [
            '@context' => 'https://schema.org', '@type' => 'Product', 'name' => $p->name, 'sku' => $p->sku,
            'description' => $description, 'material' => $p->material, 'category' => $p->category,
            'brand' => ['@type' => 'Brand', 'name' => '{brand}'], 'url' => self::absoluteUrl($url),
        ];
        if ($image) {
            $product['image'] = self::absoluteUrl($image);
        }

        return ['status' => 200, 'redirect' => null, 'meta' => self::tags($url, $title, $description, $image, 'product', false, [
            $product,
            self::breadcrumb([['Home', '/'], ['Shop', '/shop'], [$p->name, $url]]),
        ])];
    }

    /** A page made in the admin page builder. Drafts and unknown slugs are a 404. */
    private static function builtPage(string $slug, string $path): array
    {
        $p = DB::table('pages')->where('slug', $slug)->where('kind', 'page')->where('published', 1)->first();
        if (! $p) {
            return [
                'status' => 404,
                'redirect' => null,
                'meta' => self::tags($path, 'Page not found — {brand}', 'This {brand} page could not be found.', null, 'website', true),
            ];
        }
        $title = trim((string) $p->seo_title) !== '' ? trim($p->seo_title) : "{$p->title} — {brand}";
        $description = self::description($p->seo_description, "{$p->title} by {brand}.");

        return ['status' => 200, 'redirect' => null, 'meta' => self::tags("/pages/{$p->slug}", $title, $description, $p->seo_image_url ?: null, 'website', false, [
            self::breadcrumb([['Home', '/'], [$p->title, "/pages/{$p->slug}"]]),
        ])];
    }

    /** A policy page (terms, privacy, refund, shipping) made in the admin. Drafts and unknown slugs are a 404. */
    private static function policyPage(string $slug, string $path): array
    {
        $p = DB::table('pages')->where('slug', $slug)->where('kind', 'policy')->where('published', 1)->first();
        if (! $p) {
            return [
                'status' => 404,
                'redirect' => null,
                'meta' => self::tags($path, 'Page not found — {brand}', 'This {brand} page could not be found.', null, 'website', true),
            ];
        }
        $title = trim((string) $p->seo_title) !== '' ? trim($p->seo_title) : "{$p->title} — {brand}";
        $description = self::description($p->seo_description, "{$p->title} of {brand}.");

        return ['status' => 200, 'redirect' => null, 'meta' => self::tags("/policies/{$p->slug}", $title, $description, null, 'website', false, [
            self::breadcrumb([['Home', '/'], [$p->title, "/policies/{$p->slug}"]]),
        ])];
    }

    /** A blog post made in the admin. Drafts and unknown slugs are a 404. */
    private static function blogPost(string $slug, string $path): array
    {
        $p = DB::table('pages')->where('slug', $slug)->where('kind', 'post')->where('published', 1)->first();
        if (! $p) {
            return [
                'status' => 404,
                'redirect' => null,
                'meta' => self::tags($path, 'Post not found — {brand}', 'This {brand} post could not be found.', null, 'website', true),
            ];
        }
        $title = trim((string) $p->seo_title) !== '' ? trim($p->seo_title) : "{$p->title} — {brand}";
        $description = self::description($p->seo_description ?: $p->excerpt, "{$p->title} — from the {brand} journal.");
        $url = "/blog/{$p->slug}";

        return ['status' => 200, 'redirect' => null, 'meta' => self::tags($url, $title, $description, $p->seo_image_url ?: $p->cover_url ?: null, 'article', false, [
            self::breadcrumb([['Home', '/'], ['Journal', '/blog'], [$p->title, $url]]),
        ])];
    }

    private static function collection(string $slug, string $path): array
    {
        $c = DB::table('collections')->where('slug', $slug)->where('published', 1)->first();
        if (! $c) {
            return self::unavailable($path, 'Collection unavailable — {brand}', 'This {brand} collection is unavailable.', self::redirectFor($path));
        }
        $title = trim((string) $c->seo_title) !== '' ? trim($c->seo_title) : "{$c->name} — {brand}";
        $description = self::description($c->seo_description, $c->description ?: "Explore the {$c->name} collection by {brand}.");
        $url = "/collection/{$c->slug}";

        return ['status' => 200, 'redirect' => null, 'meta' => self::tags($url, $title, $description, $c->seo_image_url ?: $c->image, 'website', false, [
            self::breadcrumb([['Home', '/'], ['Collections', '/collections'], [$c->name, $url]]),
        ])];
    }

    private static function category(string $slug, string $path): array
    {
        $c = DB::table('categories')->where('slug', $slug)->where('published', 1)->first();
        if (! $c) {
            return self::unavailable($path, 'Category unavailable — {brand}', 'This {brand} category is unavailable.', self::redirectFor($path));
        }
        $title = trim((string) $c->seo_title) !== '' ? trim($c->seo_title) : "{$c->name} — {brand}";
        $description = self::description($c->seo_description, $c->description ?: 'Explore {brand} '.strtolower($c->name).' and enquire directly on WhatsApp.');
        $url = "/category/{$c->slug}";

        return ['status' => 200, 'redirect' => null, 'meta' => self::tags($url, $title, $description, $c->seo_image_url ?: $c->image, 'website', false, [
            self::breadcrumb([['Home', '/'], ['Shop', '/shop'], [$c->name, $url]]),
        ])];
    }

    private static function collectionsOfCategory(string $slug, string $path): array
    {
        $c = DB::table('categories')->where('slug', $slug)->where('published', 1)->first();
        if (! $c) {
            return self::unavailable($path, 'Category unavailable — {brand}', 'This {brand} category is unavailable.', null);
        }
        $title = trim((string) $c->seo_title) !== '' ? trim($c->seo_title) : "{$c->name} Collections — {brand}";
        $description = self::description($c->seo_description, $c->description ?: 'Browse every {brand} '.strtolower($c->name).' collection and find your piece faster.');
        $url = "/collections/{$c->slug}";

        return ['status' => 200, 'redirect' => null, 'meta' => self::tags($url, $title, $description, $c->seo_image_url ?: $c->image, 'website', false, [
            self::breadcrumb([['Home', '/'], ['Collections', '/collections'], [$c->name, $url]]),
        ])];
    }

    public static function defaultTitle(): string
    {
        return Brand::fill(self::DEFAULT_TITLE);
    }

    public static function defaultDescription(): string
    {
        return Brand::get('description');
    }
}
