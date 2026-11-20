<?php

namespace App\Support\Mail;

use App\Support\Brand;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Sends the store's automatic e-mails: fills a template (Admin -> Emails) with the order or cart details, wraps it in
 * the store layout, sends it through the SMTP account in the server .env, and records the result in the e-mail log.
 * Sending never throws: a mail problem must not undo or block an order.
 */
final class Mailer
{
    /** Which switch in Admin -> Emails controls an alert to the store. */
    private const ADMIN_SWITCH = [
        'admin_new_order' => 'notify_admin_new_order',
        'admin_payment_received' => 'notify_admin_payment',
        'admin_order_cancelled' => 'notify_admin_cancel',
        'admin_abandoned_cart' => 'abandoned_notify_admin',
    ];

    public static function siteUrl(): string
    {
        return Brand::siteUrl();
    }

    /** Values every template can use. @return array<string, string|Raw> */
    public static function common(): array
    {
        return ['store_name' => Brand::name(), 'support_email' => MailSettings::get('support_email'), 'site_url' => self::siteUrl()];
    }

    /** @return array{subject: string, html: string, text: string} */
    public static function render(array $template, array $vars): array
    {
        $vars = $vars + self::common();
        $subject = trim(preg_replace('/\s+/', ' ', strip_tags(self::fill((string) $template['subject'], $vars, false))) ?? '');

        $blocks = [];
        $plain = [];
        foreach (preg_split('/\R{2,}/', trim((string) $template['body'])) ?: [] as $para) {
            $para = trim($para);
            if ($para === '') {
                continue;
            }
            $html = self::fill($para, $vars, true);
            $text = trim(html_entity_decode(strip_tags(preg_replace('#<br\s*/?>#i', "\n", preg_replace('#</(tr|p|div)>#i', "\n", preg_replace('#</td>#i', '   ', $html) ?? '') ?? '') ?? ''), ENT_QUOTES | ENT_HTML5));
            if ($text === '' && ! str_contains($html, '<table')) {
                continue; // a paragraph that was only an empty token (for example no discount code)
            }
            $blocks[] = str_starts_with(ltrim($html), '<table') || str_starts_with(ltrim($html), '<div') ? $html : '<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#333;">'.nl2br($html, false).'</p>';
            $plain[] = $text;
        }

        return ['subject' => $subject, 'html' => self::layout(implode("\n", $blocks), $subject), 'text' => implode("\n\n", $plain)."\n\n— ".Brand::name()."\n".self::siteUrl()];
    }

    /** Replaces {{tokens}}. In HTML mode the template text is escaped and **bold** works; Raw values are kept as HTML. */
    private static function fill(string $text, array $vars, bool $html): string
    {
        if ($html) {
            $text = e($text);
            $text = preg_replace('/\*\*(.+?)\*\*/s', '<strong>$1</strong>', $text) ?? $text;
        }

        return preg_replace_callback('/\{\{\s*([a-z0-9_]+)\s*\}\}/i', function ($m) use ($vars, $html) {
            $v = $vars[$m[1]] ?? '';
            if ($v instanceof Raw) {
                return $html ? $v->html : trim(strip_tags($v->html));
            }

            return $html ? e((string) $v) : (string) $v;
        }, $text) ?? $text;
    }

    /**
     * The brand logo (Admin -> Settings -> Store details) as an absolute address for e-mail, or null to show
     * the store name as text. SVG is skipped because Gmail and Outlook do not display it.
     */
    private static function logoUrl(): ?string
    {
        $logo = trim((string) DB::table('site_settings')->where('key', 'brand_logo_url')->value('value'));
        if ($logo === '' || preg_match('/\.svg($|\?)/i', $logo)) {
            return null;
        }
        if (str_starts_with($logo, \App\Support\Media::URL_PREFIX) && preg_match('#^/[\w\-./]+$#', $logo)) {
            return self::siteUrl().$logo;
        }

        return preg_match('#^https://[\w\-./%?=&:]+$#', $logo) ? $logo : null;
    }

    private static function layout(string $inner, string $title): string
    {
        $support = e(MailSettings::get('support_email'));
        $logo = self::logoUrl();
        $brand = $logo
            ? '<a href="'.e(self::siteUrl()).'" style="text-decoration:none;"><img src="'.e($logo).'" alt="'.e(Brand::name()).'" height="44" style="display:block;border:0;height:44px;width:auto;max-width:240px;"></a>'
            : '<span style="font-family:Georgia,serif;font-size:26px;letter-spacing:.14em;color:#111;">'.e(Brand::name()).'</span>';

        return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.e($title).'</title></head>'
            .'<body style="margin:0;padding:0;background:#f6f2ee;">'
            .'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2ee;padding:24px 12px;"><tr><td align="center">'
            .'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">'
            .'<tr><td style="padding:26px 32px 18px;border-bottom:1px solid #eee;">'.$brand.'</td></tr>'
            .'<tr><td style="padding:28px 32px 8px;">'.$inner.'</td></tr>'
            .'<tr><td style="padding:18px 32px 28px;font-size:12px;line-height:1.6;color:#888;border-top:1px solid #eee;">Questions? Reply to this e-mail or write to <a href="mailto:'.$support.'" style="color:#888;">'.$support.'</a>.<br>'.e(Brand::name()).' · '.e(Brand::domainLabel()).'</td></tr>'
            .'</table></td></tr></table></body></html>';
    }

    /** A button for an e-mail. */
    public static function button(string $label, string $url): Raw
    {
        return new Raw('<div style="margin:6px 0 20px;"><a href="'.e($url).'" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;letter-spacing:.06em;text-transform:uppercase;padding:14px 26px;border-radius:10px;">'.e($label).'</a></div>');
    }

    /** Sends one e-mail. Returns true when it was handed to the mail server. */
    public static function send(string $key, string $to, array $vars, ?string $orderId = null, bool $force = false): bool
    {
        try {
            $template = EmailTemplates::find($key);
            if (! $template || ! filter_var($to, FILTER_VALIDATE_EMAIL)) {
                return false;
            }
            if (! $force) {
                if (! $template['enabled']) {
                    return false;
                }
                $switch = self::ADMIN_SWITCH[$key] ?? null;
                if ($switch ? ! MailSettings::on($switch) : ! MailSettings::on('send_customer_emails')) {
                    return false;
                }
            }
            $r = self::render($template, $vars);
            // Each e-mail goes out through the mail account chosen for it (Admin -> Emails -> Mail servers), else the default one.
            $account = SmtpAccounts::forTemplate($key);
            $from = $account->from_email ?? MailSettings::get('orders_email');
            $name = ($account->from_name ?? '') ?: (MailSettings::get('from_name') ?: Brand::name());
            $support = MailSettings::get('support_email');

            try {
                SmtpAccounts::send($account, function ($m) use ($to, $r, $from, $name, $support) {
                    $m->to($to)->subject($r['subject']);
                    if (filter_var($from, FILTER_VALIDATE_EMAIL)) {
                        $m->from($from, $name);
                    }
                    if (filter_var($support, FILTER_VALIDATE_EMAIL)) {
                        $m->replyTo($support, $name);
                    }
                    $m->html($r['html']);
                    $m->text($r['text']);
                });
                self::log($key, $to, $r['subject'], 'sent', null, $orderId);

                return true;
            } catch (\Throwable $e) {
                self::log($key, $to, $r['subject'], 'failed', $e->getMessage(), $orderId);
                Log::error("[mail] {$key} to {$to} failed: ".$e->getMessage());

                return false;
            }
        } catch (\Throwable $e) {
            Log::error("[mail] {$key} could not be prepared: ".$e->getMessage());

            return false;
        }
    }

    /** Sends an alert to every address in "Alert e-mails". */
    public static function toAdmins(string $key, array $vars, ?string $orderId = null): void
    {
        foreach (MailSettings::adminEmails() as $to) {
            self::send($key, $to, $vars, $orderId);
        }
    }

    private static function log(string $key, string $to, string $subject, string $status, ?string $error, ?string $orderId): void
    {
        try {
            DB::table('email_log')->insert([
                'id' => (string) Str::uuid(), 'template' => $key, 'to_email' => $to, 'subject' => Str::limit($subject, 240, ''),
                'status' => $status, 'error' => $error ? Str::limit($error, 390, '') : null, 'order_id' => $orderId,
                'created_at' => now()->utc()->format('Y-m-d H:i:s'),
            ]);
            // Keep the log small: only the newest 500 rows are needed.
            if (random_int(1, 40) === 1) {
                $cut = DB::table('email_log')->orderByDesc('created_at')->skip(500)->limit(1)->value('created_at');
                if ($cut) {
                    DB::table('email_log')->where('created_at', '<', $cut)->delete();
                }
            }
        } catch (\Throwable) {
            // logging is best-effort
        }
    }
}
