<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\CustomerAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Editing a customer's details and setting a new password (customers are read-only in the generic data endpoint). */
class CustomerController extends Controller
{
    /** Subscribe or unsubscribe several customers from marketing e-mail at once. */
    public function bulkMarketing(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['string', 'max:36'],
            'acceptsMarketing' => ['required', 'boolean'],
        ]);
        $count = DB::table('customers')->whereIn('id', $data['ids'])->update([
            'accepts_marketing' => $data['acceptsMarketing'] ? 1 : 0,
            'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
        ]);

        return response()->json(['updated' => $count]);
    }

    /** Removes newsletter subscribers (the generic data endpoint cannot write to that table). */
    public function deleteSubscribers(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:1000'], 'ids.*' => ['string', 'max:36']]);

        return response()->json(['deleted' => DB::table('newsletter_subscribers')->whereIn('id', $data['ids'])->delete()]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'email' => ['sometimes', 'nullable', 'email', 'max:160'],
            'phone' => ['sometimes', 'nullable', 'regex:/^[0-9+\-\s]{10,15}$/'],
            'address' => ['sometimes', 'nullable', 'string', 'max:300'],
            'acceptsMarketing' => ['sometimes', 'boolean'],
            'dateOfBirth' => ['nullable', 'date_format:Y-m-d', 'before:tomorrow', 'after:1900-01-01'],
            'giftNote' => ['nullable', 'string', 'max:500'],
            'birthdayGiftSent' => ['nullable', 'boolean'],
        ], ['dateOfBirth.before' => 'Please enter a valid date of birth.', 'dateOfBirth.date_format' => 'Please enter a valid date of birth.']);

        if (! DB::table('customers')->where('id', $id)->exists()) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        $fields = ['updated_at' => now()->utc()->format('Y-m-d H:i:s')];
        if (array_key_exists('name', $data)) {
            $fields['name'] = trim($data['name']);
        }
        if (array_key_exists('email', $data)) {
            $email = strtolower(trim((string) $data['email']));
            if ($email !== '' && DB::table('customers')->where('email', $email)->where('id', '!=', $id)->exists()) {
                return response()->json(['message' => 'That e-mail address is already used by another customer.'], 422);
            }
            // A customer from the shop may have no e-mail; an online account needs one to sign in.
            if ($email === '' && DB::table('customers')->where('id', $id)->where('source', 'online')->where('password_hash', '!=', '')->exists()) {
                return response()->json(['message' => 'This customer signs in with their e-mail, so it cannot be empty.'], 422);
            }
            $fields['email'] = $email !== '' ? $email : null;
        }
        if (array_key_exists('address', $data)) {
            $fields['address'] = trim((string) $data['address']) ?: null;
        }
        if (array_key_exists('phone', $data)) {
            $fields['phone'] = $data['phone'] ?: null;
        }
        if (array_key_exists('acceptsMarketing', $data)) {
            $fields['accepts_marketing'] = $data['acceptsMarketing'] ? 1 : 0;
        }
        if (array_key_exists('dateOfBirth', $data)) {
            $fields['date_of_birth'] = $data['dateOfBirth'];
        }
        if (array_key_exists('giftNote', $data)) {
            $fields['gift_note'] = trim((string) $data['giftNote']) ?: null;
        }
        if (array_key_exists('birthdayGiftSent', $data)) {
            // Remembers the year a gift went out, so next year's list shows them again.
            $fields['birthday_gift_year'] = $data['birthdayGiftSent'] ? (int) now()->setTimezone(\App\Support\Brand::timezone())->format('Y') : null;
        }
        DB::table('customers')->where('id', $id)->update($fields);

        return response()->json(['ok' => true]);
    }

    /** Sets a new password for a customer (for example one who cannot use the reset e-mail) and signs them out everywhere. */
    public function setPassword(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'min:8', 'max:200', 'confirmed'],
        ], ['password.confirmed' => 'The two passwords do not match.', 'password.min' => 'Please use a password of at least 8 characters.']);

        if (! DB::table('customers')->where('id', $id)->exists()) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        DB::table('customers')->where('id', $id)->update([
            'password_hash' => CustomerAuth::hash($data['password']),
            'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
        ]);
        CustomerAuth::endAll($id);

        return response()->json(['ok' => true]);
    }
}
