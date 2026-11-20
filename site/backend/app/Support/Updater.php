<?php

namespace App\Support;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;

/**
 * Finishes an update by itself, so nobody has to log in over SSH after a deploy.
 *
 * The build writes the commit it was built from into backend/RELEASE. The first request after Hostinger has pulled a new
 * release notices that storage/framework/release.txt holds an older value and then, once:
 *   - clears the cached config / routes / views (they describe the previous release),
 *   - runs any new database migrations,
 *   - makes sure the uploads folder exists and cannot run code,
 *   - records the release, so later requests skip all of this.
 * On a developer machine there is no RELEASE file, so nothing happens (use php artisan as usual).
 * If a migration fails the old state is kept, the error is logged and the update is tried again after five minutes.
 */
final class Updater
{
    private const RETRY_AFTER_SECONDS = 300;

    public static function release(): string
    {
        $file = base_path('RELEASE');

        return is_file($file) ? trim((string) @file_get_contents($file)) : '';
    }

    private static function marker(): string
    {
        return storage_path('framework/release.txt');
    }

    /** True when this release has not been set up yet. */
    public static function pending(): bool
    {
        $release = self::release();
        if ($release === '' || ! is_file(base_path('.env'))) {
            return false; // developer machine, or the site is not installed yet (the installer comes first)
        }
        $done = is_file(self::marker()) ? trim((string) @file_get_contents(self::marker())) : '';
        if ($done === $release) {
            return false;
        }
        $failed = storage_path('framework/update-failed.txt');

        return ! (is_file($failed) && (time() - (int) @filemtime($failed)) < self::RETRY_AFTER_SECONDS);
    }

    /** Runs the update when it is due. Never throws. */
    public static function runIfPending(): void
    {
        try {
            if (! self::pending()) {
                return;
            }
            @mkdir(storage_path('framework'), 0755, true);
            $lock = @fopen(storage_path('framework/update.lock'), 'c');
            if (! $lock || ! flock($lock, LOCK_EX | LOCK_NB)) {
                return; // another request is already doing it
            }
            try {
                self::run();
            } finally {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        } catch (\Throwable $e) {
            Log::error('Automatic update failed: '.$e->getMessage());
        }
    }

    /** @return array{ok: bool, output: string} */
    public static function run(): array
    {
        $release = self::release();
        $failed = storage_path('framework/update-failed.txt');
        try {
            foreach (['framework/cache/data', 'framework/sessions', 'framework/views', 'logs', 'app'] as $dir) {
                if (! is_dir(storage_path($dir))) {
                    @mkdir(storage_path($dir), 0755, true);
                }
            }
            foreach (['config:clear', 'route:clear', 'view:clear', 'event:clear'] as $command) {
                Artisan::call($command);
            }
            Artisan::call('migrate', ['--force' => true]);
            $output = trim(Artisan::output());
            self::prepareUploads();
            @file_put_contents(self::marker(), $release);
            @unlink($failed);
            Log::info('Updated to release '.$release);

            return ['ok' => true, 'output' => $output];
        } catch (\Throwable $e) {
            @file_put_contents($failed, $e->getMessage());
            Log::error('Update to release '.$release.' failed: '.$e->getMessage());

            return ['ok' => false, 'output' => $e->getMessage()];
        }
    }

    /** The uploads folder must exist and must never execute code (the rule file ships in the release as media.htaccess). */
    public static function prepareUploads(): void
    {
        $dir = public_path('media');
        if (! is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $rules = base_path('media.htaccess');
        if (is_file($rules) && is_dir($dir)) {
            $target = $dir.'/.htaccess';
            if (! is_file($target) || @md5_file($target) !== md5_file($rules)) {
                @copy($rules, $target);
            }
        }
    }
}
