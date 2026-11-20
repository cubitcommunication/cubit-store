<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Customers from the offline shop. The same person is found again by e-mail or mobile number (so a repeat buyer is not
 * duplicated), and new ones are saved as ordinary customers with source "shop". From there they work like online
 * customers: the customer list, birthday reminders, marketing subscription and export. They have no password; if they
 * later register online with the same e-mail they take over this record and see their shop orders.
 */
final class ShopCustomers
{
    /** The last ten digits of a mobile number, so "+91 98765 43210" and "9876543210" match. */
    public static function digits(?string $phone): string
    {
        $d = preg_replace('/\D+/', '', (string) $phone) ?? '';

        return strlen($d) >= 10 ? substr($d, -10) : '';
    }

    /**
     * Finds or creates the customer for a shop sale and returns their id (null when nothing identifying was entered).
     *
     * @param  array{name?: string, phone?: string, email?: string, address?: string, dob?: string, marketing?: bool}  $c
     */
    public static function resolve(array $c): ?string
    {
        $name = trim((string) ($c['name'] ?? ''));
        $phone = trim((string) ($c['phone'] ?? ''));
        $email = strtolower(trim((string) ($c['email'] ?? '')));
        $address = trim((string) ($c['address'] ?? ''));
        $dob = trim((string) ($c['dob'] ?? ''));
        $marketing = ! empty($c['marketing']);
        // Without a name, mobile number or e-mail there is nobody to keep.
        if ($name === '' && $phone === '' && $email === '') {
            return null;
        }

        $found = null;
        if ($email !== '') {
            $found = DB::table('customers')->where('email', $email)->first();
        }
        if (! $found && ($last = self::digits($phone)) !== '') {
            $found = DB::table('customers')->whereNotNull('phone')->where('phone', 'like', '%'.substr($last, -4).'%')->get()
                ->first(fn ($row) => self::digits($row->phone) === $last);
        }

        $now = now()->utc()->format('Y-m-d H:i:s');
        if ($found) {
            // Only fill what is missing; never overwrite what the customer or the admin already has. Consent is only ever added.
            $fill = [];
            if (! $found->phone && $phone !== '') {
                $fill['phone'] = $phone;
            }
            if (! $found->email && $email !== '') {
                $fill['email'] = $email;
            }
            if (! $found->date_of_birth && $dob !== '') {
                $fill['date_of_birth'] = $dob;
            }
            if (! trim((string) $found->address) && $address !== '') {
                $fill['address'] = $address;
            }
            if ($marketing && ! $found->accepts_marketing) {
                $fill['accepts_marketing'] = 1;
            }
            if ($fill) {
                DB::table('customers')->where('id', $found->id)->update($fill + ['updated_at' => $now]);
            }

            return $found->id;
        }

        $id = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $id, 'name' => $name !== '' ? $name : 'Shop customer', 'email' => $email !== '' ? $email : null, 'phone' => $phone !== '' ? $phone : null,
            'address' => $address !== '' ? $address : null, 'password_hash' => '', 'accepts_marketing' => $marketing ? 1 : 0,
            'source' => 'shop', 'date_of_birth' => $dob !== '' ? $dob : null, 'created_at' => $now, 'updated_at' => $now,
        ]);

        return $id;
    }
}
