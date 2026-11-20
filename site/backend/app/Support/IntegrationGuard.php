<?php

namespace App\Support;

use App\Support\Data\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Integration settings (Google Analytics, Tag Manager, Clarity, Meta Pixel, search verification, reCAPTCHA key) are stored in
 * `site_settings`, which the generic data API lets any admin write. This stops every admin except the main administrator from
 * changing them, whatever the browser sends.
 */
final class IntegrationGuard
{
    /** Does this data-API request write one of the integration settings? */
    public static function touches(array $d): bool
    {
        if (($d['table'] ?? '') !== 'site_settings' || ! in_array($d['action'] ?? 'select', ['insert', 'update', 'upsert', 'delete'], true)) {
            return false;
        }
        $guarded = Tracking::KEYS;
        try {
            $guarded = array_merge($guarded, DB::table('site_settings')->where('group_name', 'integrations')->pluck('key')->all());
        } catch (\Throwable) {
            // keep the built-in list
        }

        $keys = [];
        $ids = [];
        foreach ((array) ($d['filters'] ?? []) as $f) {
            $col = (string) ($f['col'] ?? '');
            $vals = is_array($f['value'] ?? null) ? $f['value'] : [$f['value'] ?? null];
            if ($col === 'key') {
                array_push($keys, ...$vals);
            } elseif ($col === 'id') {
                array_push($ids, ...$vals);
            } elseif ($col === 'group_name' && in_array('integrations', $vals, true)) {
                return true;
            }
        }
        $values = (array) ($d['values'] ?? []);
        foreach (array_is_list($values) && $values !== [] ? $values : [$values] as $row) {
            $row = (array) $row;
            if (isset($row['key'])) {
                $keys[] = $row['key'];
            }
            if (($row['group_name'] ?? null) === 'integrations') {
                return true;
            }
        }
        if ($ids) {
            try {
                array_push($keys, ...DB::table('site_settings')->whereIn('id', array_map('strval', array_slice($ids, 0, 200)))->pluck('key')->all());
            } catch (\Throwable) {
                // ignore
            }
        }

        return array_intersect(array_map('strval', $keys), $guarded) !== [];
    }
}
