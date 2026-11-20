<?php

namespace App\Support;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Secret keys that the main administrator enters in the admin panel (Razorpay, reCAPTCHA). They are stored encrypted
 * with the app key in `secure_settings`; when nothing is saved there the matching .env value is used, so a server that
 * was set up through .env keeps working. No endpoint ever returns a stored secret: the panel only learns whether one is set.
 */
final class Secrets
{
    public const RAZORPAY_KEY_ID = 'razorpay_key_id';
    public const RAZORPAY_KEY_SECRET = 'razorpay_key_secret';
    public const RAZORPAY_WEBHOOK_SECRET = 'razorpay_webhook_secret';
    public const RECAPTCHA_SECRET = 'recaptcha_secret';
    public const SHIPROCKET_EMAIL = 'shiprocket_email';
    public const VAPID_PUBLIC = 'vapid_public_key';
    public const VAPID_PRIVATE = 'vapid_private_key';
    public const SHIPROCKET_PASSWORD = 'shiprocket_password';
    public const SHIPROCKET_WEBHOOK_TOKEN = 'shiprocket_webhook_token';

    /** key => config path that is used when nothing is saved in the database. */
    private const ENV = [
        self::RAZORPAY_KEY_ID => 'services.razorpay.key_id',
        self::RAZORPAY_KEY_SECRET => 'services.razorpay.key_secret',
        self::RAZORPAY_WEBHOOK_SECRET => 'services.razorpay.webhook_secret',
        self::RECAPTCHA_SECRET => 'services.recaptcha.secret',
        self::SHIPROCKET_EMAIL => 'services.shiprocket.email',
        self::SHIPROCKET_PASSWORD => 'services.shiprocket.password',
        self::SHIPROCKET_WEBHOOK_TOKEN => 'services.shiprocket.webhook_token',
    ];

    /** @var array<string, string|null>|null */
    private static ?array $cache = null;

    public static function forget(): void
    {
        self::$cache = null;
    }

    /** @return array<string, string|null> decrypted values saved in the database */
    private static function stored(): array
    {
        if (self::$cache === null) {
            self::$cache = [];
            try {
                foreach (DB::table('secure_settings')->pluck('value', 'key') as $key => $cipher) {
                    try {
                        self::$cache[$key] = Crypt::decryptString((string) $cipher);
                    } catch (DecryptException) {
                        // Saved under a different app key: treat as not set rather than failing the page.
                        self::$cache[$key] = null;
                    }
                }
            } catch (\Throwable) {
                // The table does not exist yet (before the migration): fall back to .env.
            }
        }

        return self::$cache;
    }

    /** The value in use: the one saved in the admin, else the .env one, else ''. */
    public static function get(string $key): string
    {
        $saved = self::stored()[$key] ?? null;
        if ($saved !== null && $saved !== '') {
            return $saved;
        }

        return isset(self::ENV[$key]) ? (string) config(self::ENV[$key]) : '';
    }

    /** Where the value in use comes from: "admin", "env" or null when it is not set anywhere. */
    public static function source(string $key): ?string
    {
        $saved = self::stored()[$key] ?? null;
        if ($saved !== null && $saved !== '') {
            return 'admin';
        }

        return isset(self::ENV[$key]) && (string) config(self::ENV[$key]) !== '' ? 'env' : null;
    }

    public static function set(string $key, string $value): void
    {
        DB::table('secure_settings')->updateOrInsert(['key' => $key], ['value' => Crypt::encryptString($value), 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
        self::forget();
    }

    /** Removes the saved value, so the .env one (if any) applies again. */
    public static function clear(string $key): void
    {
        DB::table('secure_settings')->where('key', $key)->delete();
        self::forget();
    }

    /** @return array{key_id: string, key_secret: string, webhook_secret: string} */
    public static function razorpay(): array
    {
        return [
            'key_id' => self::get(self::RAZORPAY_KEY_ID),
            'key_secret' => self::get(self::RAZORPAY_KEY_SECRET),
            'webhook_secret' => self::get(self::RAZORPAY_WEBHOOK_SECRET),
        ];
    }
}
