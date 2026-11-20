<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Mail\EmailTemplates;
use App\Support\Mail\Mailer;
use App\Support\Mail\MailSettings;
use App\Support\Mail\MailVars;
use App\Support\Mail\SmtpAccounts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Admin -> Emails: company addresses, the wording of every automatic e-mail, a preview, a test send and the sent log. */
class EmailController extends Controller
{
    private const SETTING_KEYS = ['from_name', 'orders_email', 'support_email', 'admin_emails', 'send_customer_emails', 'notify_admin_new_order', 'notify_admin_payment', 'notify_admin_cancel'];

    public function index(Request $request): JsonResponse
    {
        $super = \App\Support\AdminAuth::isSuper($request);
        $default = SmtpAccounts::default();
        $log = DB::table('email_log')->orderByDesc('created_at')->limit(60)->get()->map(fn ($r) => [
            'id' => $r->id, 'template' => $r->template, 'to' => $r->to_email, 'subject' => $r->subject, 'status' => $r->status, 'error' => $r->error,
            'at' => \Carbon\Carbon::parse($r->created_at, 'UTC')->format('Y-m-d\TH:i:s\Z'),
        ])->all();

        return response()->json([
            'settings' => array_intersect_key(MailSettings::all(), array_flip(self::SETTING_KEYS)),
            'templates' => EmailTemplates::all(),
            'common' => Mailer::common() ? array_keys(Mailer::common()) : [],
            // Whether e-mail can be sent. Server details are shown to the main administrator only.
            'smtp' => [
                'live' => SmtpAccounts::configured(),
                'isSuper' => $super,
                'accounts' => $super ? count(SmtpAccounts::all()) : null,
                'defaultName' => $super ? ($default->name ?? null) : null,
                'defaultHost' => $super ? ($default->host ?? null) : null,
            ],
            'log' => $log,
        ]);
    }

    public function settings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'values' => ['required', 'array'],
            'values.from_name' => ['nullable', 'string', 'max:80'],
            'values.orders_email' => ['nullable', 'email', 'max:160'], 'values.support_email' => ['nullable', 'email', 'max:160'],
            'values.admin_emails' => ['nullable', 'string', 'max:500'],
            'values.send_customer_emails' => ['nullable', 'in:0,1'], 'values.notify_admin_new_order' => ['nullable', 'in:0,1'],
            'values.notify_admin_payment' => ['nullable', 'in:0,1'], 'values.notify_admin_cancel' => ['nullable', 'in:0,1'],
        ], ['values.orders_email.email' => 'The orders e-mail is not a valid address.', 'values.support_email.email' => 'The support e-mail is not a valid address.']);
        $values = array_intersect_key($data['values'], array_flip(self::SETTING_KEYS));
        if (isset($values['admin_emails'])) {
            foreach (preg_split('/[\s,;]+/', $values['admin_emails'], -1, PREG_SPLIT_NO_EMPTY) ?: [] as $a) {
                if (! filter_var($a, FILTER_VALIDATE_EMAIL)) {
                    return response()->json(['message' => "“{$a}” is not a valid e-mail address."], 422);
                }
            }
        }
        MailSettings::save($values);
        // The public contact address on the site follows the support e-mail.
        if (! empty($values['support_email'])) {
            DB::table('site_settings')->where('key', 'email')->update(['value' => $values['support_email'], 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
        }

        return response()->json(['ok' => true]);
    }

    public function template(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:60'], 'reset' => ['nullable', 'boolean'],
            'subject' => ['required_unless:reset,true', 'string', 'max:200'], 'body' => ['required_unless:reset,true', 'string', 'max:8000'],
            'enabled' => ['nullable', 'boolean'],
        ]);
        if (! isset(EmailTemplates::defaults()[$data['key']])) {
            return response()->json(['message' => 'Unknown e-mail.'], 404);
        }
        if (! empty($data['reset'])) {
            DB::table('email_templates')->where('key', $data['key'])->delete();
        } else {
            DB::table('email_templates')->updateOrInsert(['key' => $data['key']], [
                'subject' => trim($data['subject']), 'body' => trim($data['body']), 'enabled' => (bool) ($data['enabled'] ?? true), 'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
            ]);
        }

        return response()->json(['ok' => true, 'template' => EmailTemplates::find($data['key'])]);
    }

    /** The e-mail as it will look, filled with made-up values. */
    public function preview(Request $request): JsonResponse
    {
        $t = $this->draft($request);
        if (! $t) {
            return response()->json(['message' => 'Unknown e-mail.'], 404);
        }
        $r = Mailer::render($t, MailVars::sample($t['key']));

        return response()->json(['subject' => $r['subject'], 'html' => $r['html']]);
    }

    /** Sends the sample e-mail to one address, so the owner can check delivery and look. */
    public function test(Request $request): JsonResponse
    {
        $request->validate(['to' => ['required', 'email', 'max:160']]);
        $t = $this->draft($request);
        if (! $t) {
            return response()->json(['message' => 'Unknown e-mail.'], 404);
        }
        if (! SmtpAccounts::configured()) {
            return response()->json(['message' => 'No mail server is set up yet. Ask the main administrator to add one under Emails → Mail servers.'], 422);
        }
        $ok = $this->sendDraft($t, (string) $request->input('to'));
        if (! $ok) {
            $err = DB::table('email_log')->where('to_email', (string) $request->input('to'))->where('status', 'failed')->orderByDesc('created_at')->value('error');

            return response()->json(['message' => 'The test e-mail could not be sent.'.($err ? ' The mail server said: '.$err : '')], 422);
        }

        return response()->json(['ok' => true]);
    }

    /** The saved template, overlaid with any unsaved subject/body from the editor. */
    private function draft(Request $request): ?array
    {
        $t = EmailTemplates::find((string) $request->input('key'));
        if (! $t) {
            return null;
        }
        if (is_string($request->input('subject')) && trim((string) $request->input('subject')) !== '') {
            $t['subject'] = (string) $request->input('subject');
        }
        if (is_string($request->input('body')) && trim((string) $request->input('body')) !== '') {
            $t['body'] = (string) $request->input('body');
        }

        return $t;
    }

    private function sendDraft(array $t, string $to): bool
    {
        // Send through the normal path but with the unsaved wording: temporarily store it in the request-scoped override.
        $r = Mailer::render($t, MailVars::sample($t['key']));
        $subject = '[Test] '.$r['subject'];

        try {
            $account = SmtpAccounts::forTemplate($t['key']);
            SmtpAccounts::send($account, function ($m) use ($to, $subject, $r, $account) {
                $m->to($to)->subject($subject);
                $from = $account->from_email ?? MailSettings::get('orders_email');
                if (filter_var($from, FILTER_VALIDATE_EMAIL)) {
                    $m->from($from, ($account->from_name ?? '') ?: (MailSettings::get('from_name') ?: \App\Support\Brand::name()));
                }
                $support = MailSettings::get('support_email');
                if (filter_var($support, FILTER_VALIDATE_EMAIL)) {
                    $m->replyTo($support);
                }
                $m->html($r['html']);
                $m->text($r['text']);
            });
            DB::table('email_log')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'template' => $t['key'], 'to_email' => $to, 'subject' => $subject, 'status' => 'sent', 'created_at' => now()->utc()->format('Y-m-d H:i:s')]);

            return true;
        } catch (\Throwable $e) {
            DB::table('email_log')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'template' => $t['key'], 'to_email' => $to, 'subject' => $subject, 'status' => 'failed', 'error' => \Illuminate\Support\Str::limit($e->getMessage(), 390, ''), 'created_at' => now()->utc()->format('Y-m-d H:i:s')]);

            return false;
        }
    }
}
