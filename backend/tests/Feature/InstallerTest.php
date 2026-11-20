<?php

namespace Tests\Feature;

use App\Support\Installer;
use Dotenv\Dotenv;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class InstallerTest extends TestCase
{
    private string $env;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = sys_get_temp_dir().DIRECTORY_SEPARATOR.'installer_'.uniqid().'.env';
        Installer::useEnvPath($this->env); // a site without a settings file yet
    }

    protected function tearDown(): void
    {
        Installer::useEnvPath(null);
        @unlink($this->env);
        @unlink(storage_path('framework/release.txt'));
        parent::tearDown();
    }

    private function input(array $over = []): array
    {
        return array_merge([
            'siteName' => 'Acme Gems', 'siteUrl' => 'https://acme.test', 'tagline' => 'Gems for all', 'phone' => '+91 98765 43210',
            'supportEmail' => 'hello@acme.test', 'dbName' => 'acme', 'dbUser' => 'acme_user', 'dbPassword' => 'p@ss\'w\\ord"$1',
            'adminEmail' => 'Owner@Acme.test', 'adminPassword' => 'a-long-password',
        ], $over);
    }

    private function sqlite(): array
    {
        return ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true];
    }

    public function test_the_installer_exists_only_while_the_site_has_no_env_file(): void
    {
        $this->getJson('/api/install/status')->assertOk()->assertJsonPath('needed', true)->assertJsonStructure(['requirements', 'siteUrl']);

        file_put_contents($this->env, "APP_KEY=x\n");

        $this->getJson('/api/install/status')->assertNotFound();
        $this->postJson('/api/install', $this->input())->assertNotFound();
    }

    public function test_a_new_site_shows_the_installer_page_instead_of_the_shop(): void
    {
        $html = '';
        $this->withAppShell(function () use (&$html) {
            $html = $this->get('/shop')->assertOk()->getContent();
        });

        $this->assertStringContainsString('window.__INSTALL__=true', $html);
        $this->assertStringContainsString('noindex', $html);
    }

    public function test_invalid_details_are_refused_with_a_plain_message(): void
    {
        $this->postJson('/api/install', $this->input(['adminPassword' => 'short']))
            ->assertStatus(422)->assertJsonPath('message', 'The password must be at least 10 characters.');
        $this->postJson('/api/install', $this->input(['dbName' => 'bad name; drop']))->assertStatus(422);
        $this->assertFileDoesNotExist($this->env);
    }

    public function test_a_database_that_cannot_be_reached_leaves_nothing_behind(): void
    {
        $this->postJson('/api/install', $this->input(['dbName' => 'no_such_database_zz', 'dbUser' => 'no_such_user_zz']))
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_starts_with($m, 'Could not connect to the database'));

        $this->assertFileDoesNotExist($this->env);
    }

    public function test_installing_creates_tables_the_owner_and_a_brand_neutral_env_file(): void
    {
        $result = Installer::install($this->input(), $this->sqlite());

        $this->assertFalse($result['existing']);
        $admin = DB::connection('installer')->table('admin_users')->first();
        $this->assertSame('owner@acme.test', $admin->email);
        $this->assertSame('super', $admin->role);

        $env = Dotenv::parse((string) file_get_contents($this->env));
        $this->assertSame('Acme Gems', $env['BRAND_NAME']);
        $this->assertSame('919876543210', $env['BRAND_PHONE_E164']);
        $this->assertSame('owner@acme.test', $env['SUPER_ADMIN_EMAIL']);
        $this->assertSame('https://acme.test', $env['SITE_URL']);
        $this->assertSame('', $env['BRAND_INSTAGRAM_URL']); // nothing inherited from another store
        $this->assertStringStartsWith('base64:', $env['APP_KEY']);
        $this->assertSame($this->input()['dbPassword'], $env['DB_PASSWORD']); // quotes, backslash and $ survive
        $this->assertStringNotContainsStringIgnoringCase('prihika', (string) file_get_contents($this->env));

        $this->assertFalse(Installer::needed());
        $this->expectExceptionMessage('already installed');
        Installer::install($this->input(), $this->sqlite());
    }

    public function test_a_database_that_already_holds_a_store_is_refused_untouched(): void
    {
        $file = (string) tempnam(sys_get_temp_dir(), 'store');
        $sqlite = ['driver' => 'sqlite', 'database' => $file, 'prefix' => '', 'foreign_key_constraints' => true]; // a real file, so what is in it survives
        // Something already lives there: a table of another store.
        config(['database.connections.installer' => $sqlite]);
        \Illuminate\Support\Facades\DB::purge('installer');
        \Illuminate\Support\Facades\Schema::connection('installer')->create('products', fn ($t) => $t->string('id'));
        \Illuminate\Support\Facades\DB::connection('installer')->table('products')->insert(['id' => 'keep-me']);

        try {
            Installer::install($this->input(), $sqlite);
            $this->fail('A database that already holds a store must be refused.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('already contains a store', $e->getMessage());
        }

        $this->assertFileDoesNotExist($this->env);
        $this->assertSame(1, \Illuminate\Support\Facades\DB::connection('installer')->table('products')->count());
        \Illuminate\Support\Facades\DB::purge('installer');
        @unlink($file);
    }
}
