<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** The "From" address printed on shipping labels and packing slips. */
return new class extends Migration
{
    public function up(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('site_settings')->insertOrIgnore([
            'id' => (string) Str::uuid(), 'key' => 'return_address', 'value' => '', 'group_name' => 'contact', 'label' => 'Return address (for shipping labels)',
            'help' => 'Printed under "FROM" on shipping labels and packing slips. Not shown on the website.', 'multiline' => 1,
            'sort_order' => 1020, 'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'return_address')->delete();
    }
};
