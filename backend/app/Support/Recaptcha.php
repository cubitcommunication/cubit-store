<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Google reCAPTCHA v3 (invisible). The public site key is set in Admin -> Integrations; the secret key lives only
 * in the server .env (RECAPTCHA_SECRET_KEY). Checking switches on only when both exist, so nothing can lock the
 * shop out by accident.
 */
final class Recaptcha
{
    public static function secret(): ?string
    {
        $s = Secrets::get(Secrets::RECAPTCHA_SECRET);

        return $s !== '' ? $s : null;
    }

    public static function active(): bool
    {
        return self::secret() !== null && Tracking::ids()['recaptcha'] !== null;
    }

    /**
     * @return string|null  null when the visitor passes; otherwise a message for the visitor.
     */
    public static function check(Request $request, string $action, float $minScore): ?string
    {
        $token = trim((string) $request->header('X-Recaptcha-Token', ''));
        if ($token === '') {
            return 'Please reload the page and try again.';
        }

        try {
            $res = Http::asForm()->timeout(6)->post('https://www.google.com/recaptcha/api/siteverify', [
                'secret' => self::secret(), 'response' => $token, 'remoteip' => $request->ip(),
            ]);
        } catch (\Throwable $e) {
            // Google unreachable: never turn a network problem into a lost customer.
            Log::warning('[recaptcha] verification service unreachable: '.$e->getMessage());

            return null;
        }
        if (! $res->successful()) {
            Log::warning('[recaptcha] verification service answered '.$res->status());

            return null;
        }

        $body = $res->json();
        $ok = ($body['success'] ?? false) === true
            && (float) ($body['score'] ?? 0) >= $minScore
            && ($body['action'] ?? $action) === $action;

        return $ok ? null : 'We could not confirm you are a real person. Please try again.';
    }
}
