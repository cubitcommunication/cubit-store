<?php

namespace App\Support;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * The browser installer (like WordPress): a new site has no backend/.env yet, so its first visit opens a form that asks
 * for the database, the store's name and the owner's admin account, then writes the .env, creates the tables and the admin.
 *
 * It is open ONLY while backend/.env does not exist, and it writes that file last, so a failed attempt leaves nothing
 * behind and can be repeated. It needs the database password, which a stranger does not have, and it only ever connects
 * to the server's own MySQL (127.0.0.1): it can never be pointed at somebody else's database.
 * An existing site already has an .env, so for it the installer does not exist.
 */
final class Installer
{
    private static ?string $envPath = null;

    /** Tests point this at a temporary file. */
    public static function useEnvPath(?string $path): void
    {
        self::$envPath = $path;
    }

    public static function envPath(): string
    {
        return self::$envPath ?? base_path('.env');
    }

    public static function needed(): bool
    {
        return ! is_file(self::envPath());
    }

    /** @return list<array{label: string, ok: bool, hint: string}> */
    public static function requirements(): array
    {
        $rows = [['PHP 8.2 or newer (this server: '.PHP_VERSION.')', version_compare(PHP_VERSION, '8.2.0', '>='), 'Choose PHP 8.2 or newer in hPanel → Advanced → PHP Configuration.']];
        foreach (['pdo_mysql', 'mbstring', 'fileinfo', 'gd', 'openssl'] as $ext) {
            $rows[] = ["PHP extension {$ext}", extension_loaded($ext), "Tick {$ext} in hPanel → Advanced → PHP Configuration."];
        }
        $dir = dirname(self::envPath());
        $rows[] = ['The site folder can be written to (to save the settings file)', is_writable($dir), 'Ask the host to make the backend folder writable.'];
        $rows[] = ['The storage folder can be written to', is_writable(storage_path()), 'Make backend/storage writable (permissions 755 or 775).'];

        return array_map(fn ($r) => ['label' => $r[0], 'ok' => (bool) $r[1], 'hint' => $r[2]], $rows);
    }

    /**
     * Sets the site up. Throws RuntimeException (message safe to show) when something is wrong; nothing is saved then.
     *
     * @param  array<string,string>  $in  siteName, siteUrl, tagline, phone, supportEmail, dbName, dbUser, dbPassword, adminEmail, adminPassword
     * @param  array<string,mixed>|null  $connection  Laravel connection config; null = the server's own MySQL from $in (tests pass sqlite)
     * @return array{existing: bool} existing = always false now: a database that already holds a store is refused
     */
    public static function install(array $in, ?array $connection = null): array
    {
        if (! self::needed()) {
            throw new RuntimeException('This site is already installed.');
        }
        foreach (self::requirements() as $r) {
            if (! $r['ok'] && ! ($connection && str_contains($r['label'], 'pdo_mysql'))) {
                throw new RuntimeException($r['label'].' is not available. '.$r['hint']);
            }
        }

        // The first migrations write starting texts (policies, e-mails) that name the store: tell them who it is.
        config([
            'brand.name' => $in['siteName'], 'brand.tagline' => $in['tagline'] ?? '', 'brand.support_email' => trim((string) ($in['supportEmail'] ?? '')),
            'brand.phone_display' => trim((string) ($in['phone'] ?? '')), 'shop.site_url' => rtrim((string) $in['siteUrl'], '/'),
        ]);

        $connection ??= [
            'driver' => 'mysql', 'host' => '127.0.0.1', 'port' => '3306', 'database' => $in['dbName'], 'username' => $in['dbUser'],
            'password' => $in['dbPassword'], 'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'prefix' => '', 'strict' => true,
        ];
        config(['database.connections.installer' => $connection, 'database.default' => 'installer']);
        DB::purge('installer');
        try {
            DB::connection('installer')->getPdo();
        } catch (\Throwable $e) {
            throw new RuntimeException('Could not connect to the database. Check the database name, user and password you created in hPanel. ('.Str::limit(self::plainError($e->getMessage()), 160, '').')');
        }

        // Every site needs its own database. One that already holds a store (this template's or another project's) would be
        // read, changed by the migrations and shown as this site's own data, so it is refused before anything is touched.
        $schema = Schema::connection('installer');
        if ($schema->hasTable('migrations') && DB::connection('installer')->table('migrations')->exists() || $schema->hasTable('admin_users') || $schema->hasTable('products')) {
            throw new RuntimeException('This database already contains a store. Every site needs its own new, empty database: create one in hPanel → Databases and enter its details here.');
        }

        try {
            Artisan::call('migrate', ['--force' => true, '--database' => 'installer']);
        } catch (\Throwable $e) {
            throw new RuntimeException('The database tables could not be created: '.Str::limit(self::plainError($e->getMessage()), 200, ''));
        }

        $email = strtolower(trim($in['adminEmail']));
        $existing = DB::connection('installer')->table('admin_users')->exists();
        if (! $existing) {
            $now = now()->utc()->format('Y-m-d H:i:s');
            DB::connection('installer')->table('admin_users')->insert([
                'id' => (string) Str::uuid(), 'email' => $email, 'password_hash' => AdminAuth::hashPassword($in['adminPassword']),
                'role' => 'super', 'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        // The settings file goes last: only now does the site count as installed.
        $path = self::envPath();
        $tmp = $path.'.tmp';
        if (@file_put_contents($tmp, self::envContents($in), LOCK_EX) === false || ! @rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException('The settings file could not be saved. Make the backend folder writable and try again.');
        }
        @chmod($path, 0640);

        // This release is already set up (the Updater would only repeat the work).
        if (($release = Updater::release()) !== '') {
            @file_put_contents(storage_path('framework/release.txt'), $release);
        }
        foreach (['config:clear', 'route:clear'] as $c) {
            try {
                Artisan::call($c);
            } catch (\Throwable) {
            }
        }

        return ['existing' => $existing];
    }

    /** Generates a fresh application key (what the secrets stored in the admin are encrypted with). */
    public static function newKey(): string
    {
        return 'base64:'.base64_encode(random_bytes(32));
    }

    /** The text of the new .env. Every BRAND_* line is written, so the site never inherits another store's defaults. */
    public static function envContents(array $in): string
    {
        $phone = preg_replace('/\D+/', '', (string) ($in['phone'] ?? '')) ?? '';
        $url = rtrim((string) $in['siteUrl'], '/');
        $support = trim((string) ($in['supportEmail'] ?? ''));
        $lines = [
            '# Written by the installer. Keep this file private: it holds the database password and the application key.',
            'APP_NAME='.self::q($in['siteName']),
            'APP_ENV=production',
            'APP_KEY='.($in['appKey'] ?? self::newKey()),
            'APP_DEBUG=false',
            'APP_URL='.self::q($url),
            'SITE_URL='.self::q($url),
            '',
            'LOG_CHANNEL=daily',
            'LOG_LEVEL=warning',
            '',
            'DB_CONNECTION=mysql',
            'DB_HOST=127.0.0.1',
            'DB_PORT=3306',
            'DB_DATABASE='.self::q($in['dbName'] ?? ''),
            'DB_USERNAME='.self::q($in['dbUser'] ?? ''),
            'DB_PASSWORD='.self::q($in['dbPassword'] ?? ''),
            '',
            'SESSION_DRIVER=file',
            'CACHE_STORE=file',
            'QUEUE_CONNECTION=sync',
            '',
            'SUPER_ADMIN_EMAIL='.self::q(strtolower(trim($in['adminEmail']))),
            '',
            'BRAND_NAME='.self::q($in['siteName']),
            'BRAND_TAGLINE='.self::q($in['tagline'] ?? ''),
            'BRAND_DESCRIPTION='.self::q($in['tagline'] ?? ''),
            'BRAND_FOUNDED_LABEL=\'\'',
            'BRAND_PHONE_DISPLAY='.self::q(trim((string) ($in['phone'] ?? ''))),
            'BRAND_PHONE_E164='.self::q($phone),
            'BRAND_SUPPORT_EMAIL='.self::q($support),
            'BRAND_ORDERS_EMAIL='.self::q($support),
            'BRAND_INSTAGRAM_HANDLE=\'\'',
            'BRAND_INSTAGRAM_URL=\'\'',
            'BRAND_FACEBOOK_LABEL=\'\'',
            'BRAND_FACEBOOK_URL=\'\'',
            'BRAND_CURRENCY_SYMBOL='.self::q((string) config('brand.currency_symbol')),
            'BRAND_CURRENCY_CODE='.self::q((string) config('brand.currency_code')),
            'BRAND_LOCALE='.self::q((string) config('brand.locale')),
            'BRAND_TIMEZONE='.self::q((string) config('brand.timezone')),
            'BRAND_COUNTRY='.self::q((string) config('brand.country')),
            '',
        ];

        return implode("\n", $lines);
    }

    /** A .env value in double quotes. Inside them only the backslash, the double quote and $ (variable expansion) are special. */
    private static function q(string $value): string
    {
        $value = str_replace(["\r", "\n"], ' ', $value);

        return '"'.str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $value).'"';
    }

    /** Database drivers put long technical text in their errors; keep the first useful sentence. */
    private static function plainError(string $message): string
    {
        $message = preg_replace('/\s*\(Connection:.*$/s', '', $message) ?? $message;
        $message = preg_replace('/^SQLSTATE\[[^\]]*\]:?\s*(\[\d+\]\s*)?/', '', $message) ?? $message;

        return trim($message);
    }
}
