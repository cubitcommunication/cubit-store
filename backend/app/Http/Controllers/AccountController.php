<?php

namespace App\Http\Controllers;

use App\Support\Commerce;
use App\Support\CustomerAuth;
use App\Support\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/** Shopper accounts: sign-up, sign-in, profile, saved addresses, order history, wishlist, password reset. */
class AccountController extends Controller
{
    private function accountsOn(): ?JsonResponse
    {
        return Commerce::on('commerce_accounts_enabled') ? null : response()->json(['message' => 'Customer accounts are not enabled.'], 403);
    }

    private function me(Request $request): object
    {
        $customer = CustomerAuth::current($request);
        if (! $customer) {
            abort(response()->json(['message' => 'Please sign in.'], 401));
        }

        return $customer;
    }

    public function session(Request $request): JsonResponse
    {
        $customer = Commerce::on('commerce_accounts_enabled') ? CustomerAuth::current($request) : null;

        return response()->json(['customer' => $customer ? CustomerAuth::present($customer) : null]);
    }

    public function register(Request $request): JsonResponse
    {
        if ($off = $this->accountsOn()) {
            return $off;
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:160'],
            'phone' => ['nullable', 'regex:/^[0-9+\-\s]{10,15}$/'],
            'password' => ['required', 'string', 'min:8', 'max:200'],
            'dateOfBirth' => ['nullable', 'date_format:Y-m-d', 'before:tomorrow', 'after:1900-01-01'],
        ], ['dateOfBirth.before' => 'Please enter a valid date of birth.', 'dateOfBirth.date_format' => 'Please enter a valid date of birth.']);
        $email = strtolower(trim($data['email']));
        $existing = DB::table('customers')->where('email', $email)->first();
        if ($existing && $existing->password_hash !== '') {
            return response()->json(['ok' => false, 'message' => 'An account with this e-mail already exists. Try signing in.']);
        }
        if ($existing) {
            // Someone who bought in the shop (no password yet): they take over that record and keep their shop orders.
            DB::table('customers')->where('id', $existing->id)->update(array_filter([
                'password_hash' => CustomerAuth::hash($data['password']), 'phone' => $existing->phone ?: ($data['phone'] ?? null),
                'date_of_birth' => $existing->date_of_birth ?: ($data['dateOfBirth'] ?? null), 'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
            ], fn ($v) => $v !== null));
            DB::table('orders')->where('email', $email)->whereNull('customer_id')->update(['customer_id' => $existing->id]);

            return response()->json(['ok' => true])->withCookie(CustomerAuth::start($existing->id, $request));
        }

        $id = (string) Str::uuid();
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('customers')->insert([
            'id' => $id, 'name' => trim($data['name']), 'email' => $email, 'phone' => $data['phone'] ?? null,
            'password_hash' => CustomerAuth::hash($data['password']), 'date_of_birth' => $data['dateOfBirth'] ?? null,
            'created_at' => $now, 'updated_at' => $now,
        ]);
        \App\Support\Notifier::send('new_customer', 'New customer account', trim($data['name']).' ('.$email.')', '/admin/customers', 'customer:'.$id);
        // Link earlier guest orders placed with the same e-mail.
        DB::table('orders')->where('email', $email)->whereNull('customer_id')->update(['customer_id' => $id]);

        return response()->json(['ok' => true])->withCookie(CustomerAuth::start($id, $request));
    }

    public function signIn(Request $request): JsonResponse
    {
        if ($off = $this->accountsOn()) {
            return $off;
        }
        $data = $request->validate(['email' => ['required', 'string', 'max:160'], 'password' => ['required', 'string', 'max:200']]);
        $row = DB::table('customers')->where('email', strtolower(trim($data['email'])))->first();
        if (! $row || ! CustomerAuth::check($data['password'], $row->password_hash)) {
            return response()->json(['ok' => false, 'message' => 'E-mail or password is incorrect.']);
        }

        return response()->json(['ok' => true])->withCookie(CustomerAuth::start($row->id, $request));
    }

    public function signOut(Request $request): JsonResponse
    {
        CustomerAuth::end($request);

        return response()->json(['ok' => true])->withCookie(CustomerAuth::forgetCookie($request));
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:160'],
            'currentPassword' => ['nullable', 'string', 'max:200'],
            'phone' => ['nullable', 'regex:/^[0-9+\-\s]{10,15}$/'],
            'acceptsMarketing' => ['boolean'],
            'dateOfBirth' => ['nullable', 'date_format:Y-m-d', 'before:tomorrow', 'after:1900-01-01'],
            'giftNote' => ['nullable', 'string', 'max:500'],
        ], ['dateOfBirth.before' => 'Please enter a valid date of birth.', 'dateOfBirth.date_format' => 'Please enter a valid date of birth.']);

        $fields = [
            'name' => trim($data['name']), 'phone' => $data['phone'] ?? null,
            'accepts_marketing' => ! empty($data['acceptsMarketing']) ? 1 : 0,
            'date_of_birth' => $data['dateOfBirth'] ?? null, 'gift_note' => trim((string) ($data['giftNote'] ?? '')) ?: null,
            'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
        ];

        // The e-mail is the sign-in name, so changing it needs the current password and must be unused.
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        if ($email !== '' && $email !== strtolower((string) $me->email)) {
            $hash = DB::table('customers')->where('id', $me->id)->value('password_hash');
            if (! CustomerAuth::check((string) ($data['currentPassword'] ?? ''), (string) $hash)) {
                return response()->json(['message' => 'Enter your current password to change your e-mail address.'], 422);
            }
            if (DB::table('customers')->where('email', $email)->where('id', '!=', $me->id)->exists()) {
                return response()->json(['message' => 'That e-mail address is already used by another account.'], 422);
            }
            $fields['email'] = $email;
        }

        DB::table('customers')->where('id', $me->id)->update($fields);

        return response()->json(['ok' => true]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $data = $request->validate(['currentPassword' => ['required', 'string'], 'newPassword' => ['required', 'string', 'min:8', 'max:200']]);
        $hash = DB::table('customers')->where('id', $me->id)->value('password_hash');
        if (! CustomerAuth::check($data['currentPassword'], (string) $hash)) {
            return response()->json(['ok' => false, 'message' => 'Your current password is not correct.']);
        }
        DB::table('customers')->where('id', $me->id)->update(['password_hash' => CustomerAuth::hash($data['newPassword']), 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
        CustomerAuth::endAll($me->id);

        return response()->json(['ok' => true])->withCookie(CustomerAuth::forgetCookie($request));
    }

    /* ------------------------------------------------------------ addresses */

    public function addresses(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $rows = DB::table('customer_addresses')->where('customer_id', $me->id)->orderByDesc('is_default')->orderBy('created_at')->get();

        return response()->json(['addresses' => $rows->map(fn ($a) => $this->address($a))->all()]);
    }

    private function address(object $a): array
    {
        return ['id' => $a->id, 'name' => $a->name, 'phone' => $a->phone, 'line1' => $a->line1, 'line2' => $a->line2, 'city' => $a->city,
            'state' => $a->state, 'pincode' => $a->pincode, 'country' => $a->country, 'isDefault' => (bool) $a->is_default];
    }

    public function saveAddress(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $data = $request->validate([
            'id' => ['nullable', 'string'], 'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'regex:/^[0-9+\-\s]{10,15}$/'], 'line1' => ['required', 'string', 'max:200'],
            'line2' => ['nullable', 'string', 'max:200'], 'city' => ['required', 'string', 'max:120'],
            'state' => ['required', 'string', 'max:120'], 'pincode' => ['required', 'regex:/^[1-9][0-9]{5}$/'],
            'isDefault' => ['boolean'],
        ], ['pincode.regex' => 'Please enter a valid 6-digit PIN code.']);

        $now = now()->utc()->format('Y-m-d H:i:s');
        $row = [
            'name' => $data['name'], 'phone' => $data['phone'], 'line1' => $data['line1'], 'line2' => $data['line2'] ?? null,
            'city' => $data['city'], 'state' => $data['state'], 'pincode' => $data['pincode'], 'updated_at' => $now,
        ];
        DB::transaction(function () use ($me, $data, $row, $now) {
            $isFirst = ! DB::table('customer_addresses')->where('customer_id', $me->id)->exists();
            $default = ! empty($data['isDefault']) || $isFirst;
            if ($default) {
                DB::table('customer_addresses')->where('customer_id', $me->id)->update(['is_default' => 0]);
            }
            $existing = ! empty($data['id']) ? DB::table('customer_addresses')->where('id', $data['id'])->where('customer_id', $me->id)->first() : null;
            if ($existing) {
                DB::table('customer_addresses')->where('id', $existing->id)->update($row + ($default ? ['is_default' => 1] : []));
            } else {
                DB::table('customer_addresses')->insert($row + [
                    'id' => (string) Str::uuid(), 'customer_id' => $me->id, 'country' => 'India', 'is_default' => $default ? 1 : 0, 'created_at' => $now,
                ]);
            }
        });

        return $this->addresses($request);
    }

    public function deleteAddress(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $id = (string) $request->input('id');
        DB::table('customer_addresses')->where('id', $id)->where('customer_id', $me->id)->delete();

        return $this->addresses($request);
    }

    /* --------------------------------------------------------------- orders */

    public function orders(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $orders = DB::table('orders')->where('customer_id', $me->id)->orderByDesc('number')->get();

        return response()->json(['orders' => $orders->map(fn ($o) => OrderService::present($o))->all()]);
    }

    public function order(Request $request, int $number): JsonResponse
    {
        $me = $this->me($request);
        $order = DB::table('orders')->where('number', $number)->where('customer_id', $me->id)->first();
        if (! $order) {
            return response()->json(['message' => 'Order not found.'], 404);
        }
        $events = DB::table('order_events')->where('order_id', $order->id)->orderBy('created_at')->get(['message', 'created_at']);

        return response()->json(OrderService::present($order) + ['returns' => \App\Support\Returns::forOrder($order), 'events' => $events->map(fn ($e) => [
            'message' => $e->message, 'at' => \Carbon\Carbon::parse($e->created_at, 'UTC')->format('Y-m-d\TH:i:s\Z'),
        ])->all()]);
    }

    /** The customer asks to return pieces from one of their shipped orders (Admin -> Store features -> Returns). */
    public function requestReturn(Request $request, int $number): JsonResponse
    {
        $me = $this->me($request);
        $order = DB::table('orders')->where('number', $number)->where('customer_id', $me->id)->first();
        if (! $order) {
            return response()->json(['message' => 'Order not found.'], 404);
        }
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:30'],
            'items.*.id' => ['required', 'string', 'max:36'],
            'items.*.qty' => ['required', 'integer', 'min:1', 'max:100'],
            'reason' => ['required', 'in:'.implode(',', array_keys(\App\Support\Returns::REASONS))],
            'details' => ['nullable', 'string', 'max:800'],
        ]);
        $result = \App\Support\Returns::create($order, $data['items'], $data['reason'], $data['details'] ?? null);
        if (! $result['request']) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json(['returns' => \App\Support\Returns::forOrder($order)], 201);
    }

    /* ------------------------------------------------------------- wishlist */

    private function wishlistIds(string $customerId): array
    {
        return DB::table('wishlist_items')->where('customer_id', $customerId)->orderByDesc('created_at')->pluck('product_id')->all();
    }

    public function wishlist(Request $request): JsonResponse
    {
        $me = $this->me($request);

        return response()->json(['ids' => $this->wishlistIds($me->id)]);
    }

    /** Merges the guest wishlist (kept in the browser) into the account, then returns the full list. */
    public function mergeWishlist(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $ids = array_slice(array_filter((array) $request->input('ids', []), 'is_string'), 0, 200);
        $valid = DB::table('products')->whereIn('id', $ids)->where('published', 1)->whereNull('archived_at')->pluck('id')->all();
        foreach ($valid as $pid) {
            DB::table('wishlist_items')->insertOrIgnore(['id' => (string) Str::uuid(), 'customer_id' => $me->id, 'product_id' => $pid, 'created_at' => now()->utc()->format('Y-m-d H:i:s')]);
        }

        return response()->json(['ids' => $this->wishlistIds($me->id)]);
    }

    public function toggleWishlist(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $pid = (string) $request->input('productId');
        $existing = DB::table('wishlist_items')->where('customer_id', $me->id)->where('product_id', $pid);
        if ($existing->exists()) {
            $existing->delete();
        } elseif (DB::table('products')->where('id', $pid)->where('published', 1)->exists()) {
            DB::table('wishlist_items')->insert(['id' => (string) Str::uuid(), 'customer_id' => $me->id, 'product_id' => $pid, 'created_at' => now()->utc()->format('Y-m-d H:i:s')]);
        }

        return response()->json(['ids' => $this->wishlistIds($me->id)]);
    }

    /* ------------------------------------------------------- password reset */

    public function forgotPassword(Request $request): JsonResponse
    {
        if ($off = $this->accountsOn()) {
            return $off;
        }
        $email = strtolower(trim((string) $request->validate(['email' => ['required', 'email']])['email']));
        // Same answer whether or not the address exists, so accounts cannot be enumerated.
        if (DB::table('customers')->where('email', $email)->exists()) {
            $token = bin2hex(random_bytes(24));
            DB::table('customer_password_resets')->updateOrInsert(['email' => $email], ['token_hash' => hash('sha256', $token), 'created_at' => now()->utc()->format('Y-m-d H:i:s')]);
            $link = \App\Support\Brand::siteUrl().'/reset-password?email='.urlencode($email).'&token='.$token;
            try {
                $account = \App\Support\Mail\SmtpAccounts::default();
                \App\Support\Mail\SmtpAccounts::send($account, function ($m) use ($email, $link, $account) {
                    $m->to($email)->subject('Reset your '.\App\Support\Brand::name().' password');
                    if ($account && filter_var($account->from_email, FILTER_VALIDATE_EMAIL)) {
                        $m->from($account->from_email, $account->from_name ?: \App\Support\Brand::name());
                    }
                    $m->text("Hello,\n\nUse this link to choose a new ".\App\Support\Brand::name()." password (valid for 1 hour):\n{$link}\n\nIf you did not ask for this, you can ignore this message.");
                });
            } catch (\Throwable $e) {
                Log::error('[account] reset mail failed: '.$e->getMessage());
            }
        }

        return response()->json(['ok' => true]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'token' => ['required', 'string'], 'password' => ['required', 'string', 'min:8', 'max:200']]);
        $email = strtolower(trim($data['email']));
        $row = DB::table('customer_password_resets')->where('email', $email)->first();
        $fresh = $row && strtotime($row->created_at.' UTC') > time() - 3600;
        if (! $fresh || ! hash_equals($row->token_hash, hash('sha256', $data['token']))) {
            return response()->json(['ok' => false, 'message' => 'This reset link is invalid or has expired.']);
        }
        $customer = DB::table('customers')->where('email', $email)->first();
        if (! $customer) {
            return response()->json(['ok' => false, 'message' => 'This reset link is invalid or has expired.']);
        }
        DB::table('customers')->where('id', $customer->id)->update(['password_hash' => CustomerAuth::hash($data['password']), 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
        DB::table('customer_password_resets')->where('email', $email)->delete();
        CustomerAuth::endAll($customer->id);

        return response()->json(['ok' => true]);
    }
}
