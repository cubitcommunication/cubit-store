<?php

namespace Tests\Feature;

use App\Support\Data\QueryEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReelTest extends TestCase
{
    use RefreshDatabase;

    private array $uploaded = [];

    protected function tearDown(): void
    {
        foreach ($this->uploaded as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    private function adminCookie(): string
    {
        $adminId = '50000000-0000-0000-0000-000000000001';
        DB::table('admin_users')->insert(['id' => $adminId, 'email' => 'a@b.co', 'password_hash' => 'x']);
        DB::table('admin_sessions')->insert([
            'id' => '50000000-0000-0000-0000-000000000002', 'admin_id' => $adminId, 'token_hash' => hash('sha256', 'reel-token'),
            'expires_at' => now()->addDay()->format('Y-m-d H:i:s'),
        ]);

        return 'reel-token';
    }

    private function upload(?string $cookie, UploadedFile $file)
    {
        $cookies = $cookie ? [config('shop.session_cookie') => $cookie] : [];

        return $this->call('POST', '/api/admin/reels/video', [], $cookies, ['video' => $file], [
            'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json',
        ]);
    }

    private function fakeMp4(string $name = 'reel.mp4'): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'reel');
        file_put_contents($path, "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom".str_repeat('x', 2048));

        return new UploadedFile($path, $name, 'video/mp4', null, true);
    }

    public function test_only_an_admin_can_upload_and_only_real_videos_are_kept(): void
    {
        $this->upload(null, $this->fakeMp4())->assertStatus(401);

        $cookie = $this->adminCookie();
        $res = $this->upload($cookie, $this->fakeMp4())->assertOk();
        $url = $res->json('url');
        $this->assertStringStartsWith('/api/public/img/'.now('Asia/Kolkata')->format('Y-m').'/reels/', $url);
        $this->assertStringEndsWith('.mp4', $url);
        $file = public_path('media/'.substr($url, strlen('/api/public/img/')));
        $this->uploaded[] = $file;
        $this->assertFileExists($file);

        // Served back with a video type.
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'video/mp4');

        // A script renamed to .mp4 is refused.
        $path = tempnam(sys_get_temp_dir(), 'bad');
        file_put_contents($path, '<?php echo 1;');
        $this->upload($cookie, new UploadedFile($path, 'evil.mp4', 'video/mp4', null, true))->assertStatus(422);
    }

    public function test_reels_are_public_only_when_active_and_only_the_admin_can_change_them(): void
    {
        $row = ['id' => '61000000-0000-0000-0000-000000000001', 'title' => 'A', 'video_url' => '/api/public/img/reels/a.mp4', 'link_label' => 'Shop', 'active' => 1, 'sort_order' => 1];
        DB::table('reels')->insert($row);
        DB::table('reels')->insert(['id' => '61000000-0000-0000-0000-000000000002', 'active' => 0] + $row);
        $select = ['table' => 'reels', 'action' => 'select', 'fields' => '*', 'filters' => [], 'orders' => [], 'returning' => true, 'count' => false, 'head' => false];

        $this->assertCount(1, (new QueryEngine(false))->execute($select)['data']);
        $this->assertCount(2, (new QueryEngine(true))->execute($select)['data']);

        $write = (new QueryEngine(false))->execute(['action' => 'delete', 'filters' => [['op' => 'eq', 'col' => 'id', 'value' => $row['id']]]] + $select);
        $this->assertSame('Not authorised', $write['error']['message']);
        $this->assertSame(2, DB::table('reels')->count());
    }

    public function test_a_video_is_kept_while_a_reel_still_uses_it(): void
    {
        DB::table('reels')->insert(['id' => '61000000-0000-0000-0000-000000000003', 'title' => '', 'video_url' => '/api/public/img/reels/keep.mp4', 'link_label' => 'Shop', 'active' => 1, 'sort_order' => 1]);
        $this->assertSame(1, \App\Support\Media::countReferences('/api/public/img/reels/keep.mp4'));
    }
}
