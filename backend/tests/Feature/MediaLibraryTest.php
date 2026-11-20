<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MediaLibraryTest extends TestCase
{
    use RefreshDatabase;

    private array $files = [];

    protected function tearDown(): void
    {
        foreach ($this->files as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    private function cookies(): array
    {
        $adminId = '50000000-0000-0000-0000-000000000011';
        if (! DB::table('admin_users')->where('id', $adminId)->exists()) {
            DB::table('admin_users')->insert(['id' => $adminId, 'email' => 'lib@b.co', 'password_hash' => 'x']);
            DB::table('admin_sessions')->insert([
                'id' => '50000000-0000-0000-0000-000000000012', 'admin_id' => $adminId, 'token_hash' => hash('sha256', 'lib-token'),
                'expires_at' => now()->addDay()->format('Y-m-d H:i:s'),
            ]);
        }

        return [config('shop.session_cookie') => 'lib-token'];
    }

    private function send(string $method, string $uri, array $params = [], array $files = [], bool $admin = true)
    {
        return $this->call($method, $uri, $params, $admin ? $this->cookies() : [], $files, [
            'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json',
        ]);
    }

    private function temp(string $bytes, string $name, string $mime): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'lib');
        file_put_contents($path, $bytes);

        return new UploadedFile($path, $name, $mime, null, true);
    }

    private function track(string $url): string
    {
        $path = public_path('media/'.substr($url, strlen('/api/public/img/')));
        $this->files[] = $path;

        return $path;
    }

    public function test_new_uploads_go_into_a_folder_for_the_month_and_old_paths_are_untouched(): void
    {
        $month = now('Asia/Kolkata')->format('Y-m');
        $this->assertSame($month.'/products/a.webp', \App\Support\Media::withMonth('products/a.webp'));
        $this->assertSame('2026-03/products/a.webp', \App\Support\Media::withMonth('2026-03/products/a.webp'));
        $this->assertTrue(\App\Support\Media::isSafeKey($month.'/library/x.png'));
    }

    public function test_only_an_admin_can_use_the_library(): void
    {
        $this->send('GET', '/api/admin/media', [], [], false)->assertStatus(401);
        $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp('%PDF-1.4 x', 'a.pdf', 'application/pdf')], false)->assertStatus(401);
    }

    public function test_pdf_svg_and_png_upload_are_listed_and_real_types_are_enforced(): void
    {
        $pdf = $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp('%PDF-1.4 hello', 'Size Guide.pdf', 'application/pdf')])->assertOk();
        $this->track($pdf->json('url'));
        $this->assertStringStartsWith('/api/public/img/'.now('Asia/Kolkata')->format('Y-m').'/library/size-guide-', $pdf->json('url'));
        $this->assertStringEndsWith('.pdf', $pdf->json('url'));

        $svg = $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>', 'mark.svg', 'image/svg+xml')])->assertOk();
        $svgPath = $this->track($svg->json('url'));
        $this->assertFileExists($svgPath);

        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
        $img = $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp($png, 'dot.png', 'image/png')])->assertOk();
        $this->track($img->json('url'));

        $list = $this->send('GET', '/api/admin/media', ['kind' => 'pdf'])->assertOk();
        $this->assertSame(1, $list->json('total'));
        $this->assertSame('pdf', $list->json('items.0.kind'));
        $this->assertGreaterThanOrEqual(3, $list->json('stats.files'));

        $found = $this->send('GET', '/api/admin/media', ['q' => 'dot-'])->assertOk();
        $this->assertSame(1, $found->json('total'));
        $this->assertSame(1, $found->json('items.0.width'));

        // A PHP file renamed to .png is refused, and so is an SVG with a script in it.
        $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp('<?php echo 1;', 'x.png', 'image/png')])->assertStatus(422);
        $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'bad.svg', 'image/svg+xml')])->assertStatus(422);
        $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"></svg>', 'bad2.svg', 'image/svg+xml')])->assertStatus(422);

        // An SVG is served with a policy that stops anything inside it from running.
        $this->get($svg->json('url'))->assertOk()->assertHeader('Content-Type', 'image/svg+xml')->assertHeader('Content-Security-Policy');
    }

    public function test_files_can_be_filtered_by_where_they_are_used(): void
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
        $urls = [];
        foreach (['reel', 'post', 'home', 'spare'] as $name) {
            $res = $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp($png, "$name.png", 'image/png')])->assertOk();
            $urls[$name] = $res->json('url');
            $this->track($urls[$name]);
        }

        DB::table('reels')->insert(['id' => '61000000-0000-0000-0000-000000000009', 'title' => '', 'video_url' => '/api/public/img/reels/none.mp4', 'poster_url' => $urls['reel'], 'link_label' => 'Shop', 'active' => 1, 'sort_order' => 1]);
        DB::table('pages')->insert(['id' => '71000000-0000-0000-0000-000000000002', 'title' => 'Journal entry', 'slug' => 'entry', 'kind' => 'post', 'published' => 1, 'blocks' => '[]', 'cover_url' => $urls['post']]);
        DB::table('pages')->insert(['id' => '71000000-0000-0000-0000-000000000003', 'title' => 'Home page', 'slug' => 'home', 'kind' => 'home', 'published' => 1, 'blocks' => json_encode([['type' => 'image', 'image' => $urls['home']]], JSON_UNESCAPED_SLASHES)]);

        $names = fn (string $usage): array => array_map(
            fn ($i) => explode('-', $i['name'])[0],
            $this->send('GET', '/api/admin/media', ['usage' => $usage])->assertOk()->json('items'),
        );

        $this->assertSame(['reel'], $names('reels'));
        $this->assertSame(['post'], $names('blog'));
        $this->assertSame(['home'], $names('pages'));
        $this->assertSame(['home'], $names('page:71000000-0000-0000-0000-000000000003'));
        $unused = $names('unused');
        $this->assertContains('spare', $unused);
        $this->assertEmpty(array_intersect(['reel', 'post', 'home'], $unused));

        $stats = $this->send('GET', '/api/admin/media')->json('stats');
        $this->assertSame('Home page', $stats['pages'][0]['title']);
        $this->assertSame(1, $stats['uses']['reels']);
    }

    public function test_files_the_website_uses_but_the_server_lacks_are_reported(): void
    {
        DB::table('reels')->insert(['id' => '61000000-0000-0000-0000-000000000077', 'title' => '', 'video_url' => '/api/public/img/reels/gone-for-good.mp4', 'poster_url' => null, 'link_label' => 'Shop', 'active' => 1, 'sort_order' => 1]);

        $this->send('GET', '/api/admin/media/missing')->assertOk()->assertJsonPath('missing.0', '/api/public/img/reels/gone-for-good.mp4');
        $list = $this->send('GET', '/api/admin/media')->assertOk();
        $this->assertSame('gone-for-good.mp4', $list->json('missing.0.name'));
        $this->assertSame(['reels'], $list->json('missing.0.uses'));
    }

    public function test_uploads_are_never_kept_inside_the_application_folder_when_a_real_web_root_exists(): void
    {
        $base = sys_get_temp_dir().'/shop-root-'.uniqid();
        mkdir($base.'/app/public/media', 0777, true);
        mkdir($base.'/web/media', 0777, true);

        // The default folder sits inside the app and the web root has a media folder: use the web root's.
        $this->assertSame($base.'/web/media', \App\Support\Media::resolveRoot(null, $base.'/web', $base.'/app/public/media', $base.'/app'));
        // An explicit setting always wins.
        $this->assertSame('/custom/place', \App\Support\Media::resolveRoot('/custom/place', $base.'/web', $base.'/app/public/media', $base.'/app'));
        // No web root with a media folder: keep the default.
        $this->assertSame($base.'/app/public/media', \App\Support\Media::resolveRoot(null, $base.'/nowhere', $base.'/app/public/media', $base.'/app'));
        // Already outside the app: nothing to fix.
        $this->assertSame($base.'/web/media', \App\Support\Media::resolveRoot(null, $base.'/other', $base.'/web/media', $base.'/app'));

        @rmdir($base.'/app/public/media');
        @rmdir($base.'/app/public');
        @rmdir($base.'/app');
        @rmdir($base.'/web/media');
        @rmdir($base.'/web');
        @rmdir($base);
    }

    public function test_a_file_that_something_uses_is_never_deleted(): void
    {
        $up = $this->send('POST', '/api/admin/media/upload', [], ['file' => $this->temp('%PDF-1.4 guide', 'guide.pdf', 'application/pdf')])->assertOk();
        $url = $up->json('url');
        $path = $this->track($url);

        DB::table('pages')->insert([
            'id' => '71000000-0000-0000-0000-000000000001', 'title' => 'Care', 'slug' => 'care', 'kind' => 'page', 'published' => 1,
            'blocks' => json_encode([['type' => 'image', 'url' => $url]], JSON_UNESCAPED_SLASHES),
        ]);

        $usage = $this->send('POST', '/api/admin/media/usage', ['url' => $url])->assertOk();
        $this->assertSame('Pages and blog posts', $usage->json('uses.0.label'));

        $blocked = $this->send('POST', '/api/admin/media/delete', ['urls' => [$url]])->assertOk();
        $this->assertSame([], $blocked->json('deleted'));
        $this->assertSame($url, $blocked->json('blocked.0.url'));
        $this->assertFileExists($path);

        DB::table('pages')->where('slug', 'care')->delete();
        $done = $this->send('POST', '/api/admin/media/delete', ['urls' => [$url]])->assertOk();
        $this->assertSame([$url], $done->json('deleted'));
        $this->assertFileDoesNotExist($path);
    }
}
