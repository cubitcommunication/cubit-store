<?php

namespace App\Support\Mail;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * The mail accounts (SMTP logins) the main administrator adds in Admin -> Emails -> Mail servers. Each automatic
 * e-mail is sent through the account chosen for it, or through the default account. When no account exists the
 * server's .env mail settings are used, as before. Passwords are stored encrypted and never leave the server.
 */
final class SmtpAccounts
{
    /** @return list<object> */
    public static function all(): array
    {
        try {
            return DB::table('smtp_accounts')->orderByDesc('is_default')->orderBy('created_at')->get()->all();
        } catch (\Throwable) {
            return [];
        }
    }

    public static function find(?string $id): ?object
    {
        if (! $id) {
            return null;
        }
        try {
            return DB::table('smtp_accounts')->where('id', $id)->first() ?: null;
        } catch (\Throwable) {
            return null;
        }
    }

    /** The account used when an e-mail has none of its own: the one marked default, else the first. */
    public static function default(): ?object
    {
        $all = self::all();

        return $all[0] ?? null;
    }

    /** The account a given automatic e-mail is sent through (its own choice, else the default). */
    public static function forTemplate(?string $key): ?object
    {
        if ($key) {
            $chosen = self::find(MailSettings::get('smtp_for_'.$key) ?: null);
            if ($chosen) {
                return $chosen;
            }
        }

        return self::default();
    }

    /** Is any way of sending real e-mail set up (an account here, or a live mailer in .env)? */
    public static function configured(): bool
    {
        return self::default() !== null || ! in_array((string) config('mail.default'), ['log', 'array'], true);
    }

    public static function password(object $account): ?string
    {
        if (! $account->password) {
            return null;
        }
        try {
            return Crypt::decryptString((string) $account->password);
        } catch (DecryptException) {
            return null;
        }
    }

    public static function encrypt(string $password): string
    {
        return Crypt::encryptString($password);
    }

    /** Sends through the given account (null = the server's .env mailer). Throws when the mail server refuses. */
    public static function send(?object $account, callable $message): void
    {
        if ($account === null) {
            Mail::send([], [], $message);

            return;
        }
        Mail::build([
            'transport' => 'smtp',
            // "smtps" = encrypted from the first byte (port 465); "smtp" = upgrades with STARTTLS (port 587).
            'scheme' => $account->security === 'ssl' ? 'smtps' : 'smtp',
            'host' => $account->host,
            'port' => (int) $account->port,
            'username' => $account->username ?: null,
            'password' => self::password($account),
            'timeout' => 20,
        ])->send([], [], $message);
    }
}
