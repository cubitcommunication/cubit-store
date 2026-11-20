<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Activity;
use App\Support\AdminAuth;
use App\Support\Secrets;
use App\Support\StorefrontGate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Switch the storefront password on or off and set it. Main administrator only (route middleware). Never returns the password. */
class StorefrontPasswordController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json($this->state());
    }

    public function save(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'password' => ['sometimes', 'nullable', 'string', 'min:4', 'max:100'],
            'message' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $changes = [];
        if (! empty($data['password'])) {
            Secrets::set(StorefrontGate::PASSWORD, (string) $data['password']);
            $changes[] = 'changed the password';
        }
        if (array_key_exists('enabled', $data) && $data['enabled'] && ! StorefrontGate::passwordSet()) {
            return response()->json(['message' => 'Set a password first, then turn protection on.'], 422);
        }
        if (array_key_exists('message', $data)) {
            $this->put('storefront_password_message', trim((string) $data['message']), 'Message on the password page', 20);
        }
        if (array_key_exists('enabled', $data)) {
            $this->put('storefront_password_enabled', $data['enabled'] ? '1' : '0', 'Password protection', 10);
            $changes[] = $data['enabled'] ? 'turned password protection on' : 'turned password protection off';
        }
        StorefrontGate::forget();

        if ($changes) {
            Activity::log($request, AdminAuth::current($request), 'update', 'Password protection', ucfirst(implode(' and ', $changes)));
        }

        return response()->json($this->state());
    }

    private function state(): array
    {
        $rows = DB::table('site_settings')->whereIn('key', ['storefront_password_enabled', 'storefront_password_message'])->pluck('value', 'key');

        return [
            'enabled' => ($rows['storefront_password_enabled'] ?? '0') === '1',
            'passwordSet' => StorefrontGate::passwordSet(),
            'message' => (string) ($rows['storefront_password_message'] ?? ''),
        ];
    }

    private function put(string $key, string $value, string $label, int $sort): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        if (DB::table('site_settings')->where('key', $key)->exists()) {
            DB::table('site_settings')->where('key', $key)->update(['value' => $value, 'updated_at' => $now]);
        } else {
            DB::table('site_settings')->insert(['id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => 'integrations', 'label' => $label, 'help' => '', 'multiline' => 0, 'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now]);
        }
    }
}
