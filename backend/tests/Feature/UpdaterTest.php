<?php

namespace Tests\Feature;

use App\Support\Updater;
use Tests\TestCase;

class UpdaterTest extends TestCase
{
    private string $release;

    private string $marker;

    private string $env;

    private bool $madeEnv = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->release = base_path('RELEASE');
        $this->marker = storage_path('framework/release.txt');
        $this->env = base_path('.env');
        @unlink($this->release);
        @unlink($this->marker);
        if (! is_file($this->env)) {
            file_put_contents($this->env, "APP_ENV=testing\n");
            $this->madeEnv = true;
        }
    }

    protected function tearDown(): void
    {
        @unlink($this->release);
        @unlink($this->marker);
        @unlink(storage_path('framework/update-failed.txt'));
        if ($this->madeEnv) {
            @unlink($this->env);
        }
        parent::tearDown();
    }

    public function test_nothing_is_due_on_a_developer_machine(): void
    {
        $this->assertFalse(Updater::pending()); // no RELEASE file
    }

    public function test_a_new_release_is_due_until_it_has_been_applied(): void
    {
        file_put_contents($this->release, "abc123\n");
        $this->assertTrue(Updater::pending());

        $this->assertTrue(Updater::run()['ok']);

        $this->assertFalse(Updater::pending());
        $this->assertSame('abc123', trim((string) file_get_contents($this->marker)));

        file_put_contents($this->release, "def456\n");
        $this->assertTrue(Updater::pending());
    }

    public function test_the_site_is_left_alone_until_it_has_an_env_file(): void
    {
        if ($this->madeEnv) {
            @unlink($this->env);
        } else {
            $this->markTestSkipped('A real .env exists here; it must not be moved.');
        }
        file_put_contents($this->release, "abc123\n");

        $this->assertFalse(Updater::pending()); // the installer has to run first
    }
}
