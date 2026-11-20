<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Analytics / tag IDs from the previous website, editable in Admin -> Website content -> SEO. */
return new class extends Migration
{
    public function up(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        $rows = [
            ['ga4_measurement_id', 'Google Analytics 4 measurement ID', 'G-4CE5N44PGB', 'Looks like G-XXXXXXXXXX. Leave empty to turn Analytics off. If Analytics is already set up inside your Tag Manager container, leave this empty so visits are not counted twice.', 900],
            ['gtm_container_id', 'Google Tag Manager container ID', 'GTM-NM967FPR', 'Looks like GTM-XXXXXXX. Leave empty to turn Tag Manager off. If this container already contains a Google Analytics tag for the same property, empty the Analytics field above so visits are not counted twice.', 910],
            ['clarity_project_id', 'Microsoft Clarity project ID', 'ylt7uihcpe', 'The short code from your Clarity project (Settings → Overview). Leave empty to turn Clarity off.', 920],
        ];
        foreach ($rows as [$key, $label, $value, $help, $sort]) {
            DB::table('site_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'key' => $key, 'value' => $value, 'group_name' => 'seo', 'label' => $label, 'help' => $help,
                'multiline' => 0, 'sort_order' => $sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', ['ga4_measurement_id', 'gtm_container_id', 'clarity_project_id'])->delete();
    }
};
