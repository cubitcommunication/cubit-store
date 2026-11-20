<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Mail\EmailTemplates;
use App\Support\Mail\SmtpAccounts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Admin -> Emails -> Mail servers: the SMTP accounts e-mails are sent through, and which account each e-mail uses.
 * Main administrator only (the route group enforces it). A stored password is never returned: only whether one is set.
 */
class SmtpController extends Controller
{
    /** @return array<string, mixed> */
    private function present(object $a): array
    {
        return [
            'id' => $a->id, 'name' => $a->name, 'host' => $a->host, 'port' => (int) $a->port, 'security' => $a->security,
            'username' => $a->username, 'hasPassword' => (bool) $a->password, 'from_email' => $a->from_email, 'from_name' => $a->from_name,
            'is_default' => (bool) $a->is_default,
        ];
    }

    public function index(): JsonResponse
    {
        $assign = [];
        foreach (array_keys(EmailTemplates::defaults()) as $key) {
            $assign[$key] = (string) (DB::table('mail_settings')->where('key', 'smtp_for_'.$key)->value('value') ?? '');
        }

        return response()->json([
            'accounts' => array_map(fn ($a) => $this->present($a), SmtpAccounts::all()),
            'assignments' => $assign,
            'envFallback' => ! in_array((string) config('mail.default'), ['log', 'array'], true),
        ]);
    }

    private function rules(bool $creating): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            'host' => ['required', 'string', 'max:190', 'regex:/^[A-Za-z0-9.\-]+$/'],
            'port' => ['required', 'integer', 'between:1,65535'],
            'security' => ['required', 'in:ssl,tls'],
            'username' => ['nullable', 'string', 'max:190'],
            'password' => [$creating ? 'nullable' : 'sometimes', 'nullable', 'string', 'max:300'],
            'from_email' => ['required', 'email', 'max:190'],
            'from_name' => ['nullable', 'string', 'max:80'],
        ];
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules(true), ['host.regex' => 'The server name looks wrong. Use something like smtp.hostinger.com.']);
        $id = (string) Str::uuid();
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('smtp_accounts')->insert([
            'id' => $id, 'name' => trim($data['name']), 'host' => trim($data['host']), 'port' => (int) $data['port'], 'security' => $data['security'],
            'username' => trim((string) ($data['username'] ?? '')) ?: null,
            'password' => ($data['password'] ?? '') !== '' ? SmtpAccounts::encrypt($data['password']) : null,
            'from_email' => strtolower(trim($data['from_email'])), 'from_name' => trim((string) ($data['from_name'] ?? '')) ?: null,
            // The first account becomes the default.
            'is_default' => DB::table('smtp_accounts')->count() === 0 ? 1 : 0, 'created_at' => $now, 'updated_at' => $now,
        ]);

        return response()->json(['id' => $id]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $account = SmtpAccounts::find($id);
        if (! $account) {
            return response()->json(['message' => 'That mail account no longer exists.'], 404);
        }
        $data = $request->validate($this->rules(false), ['host.regex' => 'The server name looks wrong. Use something like smtp.hostinger.com.']);
        $row = [
            'name' => trim($data['name']), 'host' => trim($data['host']), 'port' => (int) $data['port'], 'security' => $data['security'],
            'username' => trim((string) ($data['username'] ?? '')) ?: null,
            'from_email' => strtolower(trim($data['from_email'])), 'from_name' => trim((string) ($data['from_name'] ?? '')) ?: null,
            'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
        ];
        // A blank password keeps the saved one; "clear_password" removes it.
        if (($data['password'] ?? '') !== '') {
            $row['password'] = SmtpAccounts::encrypt($data['password']);
        } elseif ($request->boolean('clear_password')) {
            $row['password'] = null;
        }
        DB::table('smtp_accounts')->where('id', $id)->update($row);

        return response()->json(['ok' => true]);
    }

    public function destroy(string $id): JsonResponse
    {
        $account = SmtpAccounts::find($id);
        if (! $account) {
            return response()->json(['message' => 'That mail account no longer exists.'], 404);
        }
        DB::transaction(function () use ($account) {
            DB::table('smtp_accounts')->where('id', $account->id)->delete();
            // E-mails that used it go back to the default account.
            DB::table('mail_settings')->where('key', 'like', 'smtp_for_%')->where('value', $account->id)->delete();
            if ($account->is_default) {
                $next = DB::table('smtp_accounts')->orderBy('created_at')->value('id');
                if ($next) {
                    DB::table('smtp_accounts')->where('id', $next)->update(['is_default' => 1]);
                }
            }
        });

        return response()->json(['ok' => true]);
    }

    public function makeDefault(string $id): JsonResponse
    {
        if (! SmtpAccounts::find($id)) {
            return response()->json(['message' => 'That mail account no longer exists.'], 404);
        }
        DB::transaction(function () use ($id) {
            DB::table('smtp_accounts')->update(['is_default' => 0]);
            DB::table('smtp_accounts')->where('id', $id)->update(['is_default' => 1]);
        });

        return response()->json(['ok' => true]);
    }

    /** Which account sends which e-mail. An empty account id means "use the default". */
    public function assign(Request $request): JsonResponse
    {
        $data = $request->validate(['template' => ['required', 'string', 'max:60'], 'account' => ['nullable', 'string', 'max:36']]);
        if (! isset(EmailTemplates::defaults()[$data['template']])) {
            return response()->json(['message' => 'Unknown e-mail.'], 404);
        }
        $key = 'smtp_for_'.$data['template'];
        if (($data['account'] ?? '') === '') {
            DB::table('mail_settings')->where('key', $key)->delete();
        } else {
            if (! SmtpAccounts::find($data['account'])) {
                return response()->json(['message' => 'That mail account no longer exists.'], 404);
            }
            DB::table('mail_settings')->updateOrInsert(['key' => $key], ['value' => $data['account'], 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
        }
        \App\Support\Mail\MailSettings::forget();

        return response()->json(['ok' => true]);
    }

    /** Sends a short message through one account so the owner can see the details are right. */
    public function test(Request $request, string $id): JsonResponse
    {
        $account = SmtpAccounts::find($id);
        if (! $account) {
            return response()->json(['message' => 'That mail account no longer exists.'], 404);
        }
        $to = (string) $request->validate(['to' => ['required', 'email', 'max:160']])['to'];

        try {
            SmtpAccounts::send($account, function ($m) use ($to, $account) {
                $m->to($to)->from($account->from_email, $account->from_name ?: \App\Support\Brand::name())->subject(\App\Support\Brand::name().' test e-mail');
                $m->text("This is a test message from your ".\App\Support\Brand::name()." admin panel.\n\nIf you can read this, the mail account “{$account->name}” works.");
            });
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => 'The mail server did not accept it: '.Str::limit($e->getMessage(), 300, '…')], 422);
        }

        return response()->json(['ok' => true]);
    }
}
