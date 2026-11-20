<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Storefront password protection: off by default. (The password itself lives encrypted in secure_settings.) */
return new class extends Migration
{
    public function up(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        foreach ([
            ['storefront_password_enabled', '0', 'Password protection', 10],
            ['storefront_password_message', '', 'Message on the password page', 20],
        ] as [$key, $value, $label, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => 'integrations', 'label' => $label, 'help' => '',
                'multiline' => 0, 'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', ['storefront_password_enabled', 'storefront_password_message'])->delete();
        DB::table('secure_settings')->where('key', 'storefront_password')->delete();
    }
};
