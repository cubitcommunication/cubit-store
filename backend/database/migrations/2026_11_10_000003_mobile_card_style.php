<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Product card design used on phones only (Admin → Product cards → Card design on phones). */
return new class extends Migration
{
    public function up(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        DB::table('site_settings')->insertOrIgnore([
            'id' => (string) Str::uuid(), 'key' => 'ui_card_mobile_style', 'value' => 'bag', 'group_name' => 'appearance',
            'label' => 'Product card design on phones', 'help' => 'same | bag | bar | float | price', 'multiline' => 0,
            'sort_order' => 15, 'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'ui_card_mobile_style')->delete();
    }
};
