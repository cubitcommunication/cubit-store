<?php

namespace Tests;

use App\Support\Installer;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    private string $installedMarker = '';

    /** A machine without a backend/.env (a fresh checkout) must not make every page test look like a site waiting for the installer. */
    protected function setUp(): void
    {
        parent::setUp();
        $this->installedMarker = (string) tempnam(sys_get_temp_dir(), 'env');
        Installer::useEnvPath($this->installedMarker);
    }

    protected function tearDown(): void
    {
        Installer::useEnvPath(null);
        @unlink($this->installedMarker);
        parent::tearDown();
    }

    /**
     * Runs $run with a minimal app.html in place and afterwards puts back whatever
     * was there (a real frontend build must survive the test run).
     */
    protected function withAppShell(callable $run): void
    {
        $file = public_path('app.html');
        $backup = is_file($file) ? file_get_contents($file) : null;
        file_put_contents($file, '<html><head><!--SHOP_HEAD--></head><body></body></html>');
        try {
            $run();
        } finally {
            if ($backup === null) {
                @unlink($file);
            } else {
                file_put_contents($file, $backup);
            }
        }
    }
}
