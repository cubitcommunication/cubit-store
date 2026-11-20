<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** A video for a product and for each variation: only our own uploaded videos are accepted, and old ones are cleaned up. */
class ProductVideoTest extends TestCase
{
    use RefreshDatabase;

    private array $files = [];

    protected function tearDown(): void
    {
        foreach ($this->files as $f) {
            @unlink($f);
        }
        parent::tearDown();
    }

    private function cookies(): array
    {
        DB::table('admin_users')->insert(['id' => '90000000-0000-0000-0000-000000000001', 'email' => 'v@b.co', 'password_hash' => 'x']);
        DB::table('admin_sessions')->insert(['id' => '90000000-0000-0000-0000-000000000002', 'admin_id' => '90000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'vid'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')]);

        return [config('shop.session_cookie') => 'vid'];
    }

    private function upload(array $c, string $folder): string
    {
        $path = tempnam(sys_get_temp_dir(), 'vid');
        file_put_contents($path, "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom".str_repeat('x', 2048));
        $res = $this->call('POST', '/api/admin/reels/video', ['folder' => $folder], $c, ['video' => new UploadedFile($path, 'v.mp4', 'video/mp4', null, true)], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json'])->assertOk();
        $url = $res->json('url');
        $this->files[] = public_path('media/'.substr($url, strlen('/api/public/img/')));

        return $url;
    }

    private function save(array $c, array $payload, array $variants = [], ?string $id = null)
    {
        $body = ['payload' => $payload + [
            'name' => 'Ring', 'slug' => 'ring', 'sku' => 'RING', 'price' => 500, 'category' => 'Rings', 'material' => 'Brass',
            'occasion' => [], 'options' => $variants ? [['name' => 'Colour', 'values' => ['Red', 'Blue']]] : [],
        ], 'images' => [], 'removedImages' => [], 'variants' => $variants] + ($id ? ['id' => $id, 'previousSlug' => 'ring'] : []);

        return $this->call('POST', '/api/admin/products/save', [], $c, [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], json_encode($body));
    }

    public function test_a_product_and_a_variation_can_each_have_a_video_stored_in_the_products_folder(): void
    {
        $c = $this->cookies();
        $a = $this->upload($c, 'products');
        $b = $this->upload($c, 'products');
        $this->assertStringStartsWith('/api/public/img/'.now('Asia/Kolkata')->format('Y-m').'/products/', $a);
        $reel = $this->upload($c, 'reels');
        $this->assertStringStartsWith('/api/public/img/'.now('Asia/Kolkata')->format('Y-m').'/reels/', $reel);   // the default is still the reels folder

        $res = $this->save($c, ['video_url' => $a], [
            ['options' => ['Colour' => 'Red'], 'video_url' => $b, 'price' => null, 'stock_quantity' => null, 'sku' => null],
            ['options' => ['Colour' => 'Blue']],
        ])->assertOk();

        $id = $res->json('id');
        $this->assertSame($a, DB::table('products')->where('id', $id)->value('video_url'));
        $this->assertSame($b, DB::table('product_variants')->where('product_id', $id)->where('title', 'Red')->value('video_url'));
        $this->assertNull(DB::table('product_variants')->where('product_id', $id)->where('title', 'Blue')->value('video_url'));

        // The Media library knows where each video is used, and will not delete one that is in use.
        $this->assertSame('Product videos', \App\Support\Media::references($a)[0]['label']);
        $this->assertSame(1, \App\Support\Media::countReferences($b));
        $this->assertFalse(\App\Support\Media::deleteIfUnreferenced($a));
    }

    public function test_only_our_own_videos_are_accepted(): void
    {
        $c = $this->cookies();
        $id = $this->save($c, ['video_url' => 'https://evil.example.com/x.mp4'])->assertOk()->json('id');
        $this->assertNull(DB::table('products')->where('id', $id)->value('video_url'));

        $this->save($c, ['video_url' => '/api/public/img/products/not-a-video.jpg'], [], $id)->assertOk();
        $this->assertNull(DB::table('products')->where('id', $id)->value('video_url'));

        $this->save($c, ['video_url' => '/api/public/img/products/../../.env'], [], $id)->assertOk();
        $this->assertNull(DB::table('products')->where('id', $id)->value('video_url'));
    }

    public function test_replacing_or_removing_a_video_deletes_the_old_file_when_nothing_else_uses_it(): void
    {
        $c = $this->cookies();
        $old = $this->upload($c, 'products');
        $new = $this->upload($c, 'products');
        $id = $this->save($c, ['video_url' => $old])->assertOk()->json('id');
        $oldFile = public_path('media/'.substr($old, strlen('/api/public/img/')));
        $this->assertFileExists($oldFile);

        $this->save($c, ['video_url' => $new], [], $id)->assertOk();
        $this->assertFileDoesNotExist($oldFile);
        $this->assertFileExists(public_path('media/'.substr($new, strlen('/api/public/img/'))));

        $this->save($c, ['video_url' => null], [], $id)->assertOk();
        $this->assertFileDoesNotExist(public_path('media/'.substr($new, strlen('/api/public/img/'))));
        $this->assertNull(DB::table('products')->where('id', $id)->value('video_url'));
    }
}
