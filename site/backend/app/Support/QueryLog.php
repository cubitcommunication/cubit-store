<?php

namespace App\Support;

use App\Support\Data\Schema;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Writes an activity-log entry for every change an admin makes through the generic data API
 * (products, collections, discounts, settings, pages...). It looks at the rows before they change so the log can
 * show "price: 999 → 899" rather than just "changed a product".
 */
final class QueryLog
{
    private const WRITES = ['insert', 'update', 'upsert', 'delete'];

    /** Tables whose changes are bookkeeping noise, not something an admin did. */
    private const QUIET = ['site_media_versions', 'order_events', 'coupon_redemptions'];

    private const LABELS = ['name', 'title', 'code', 'slug', 'key', 'label', 'email', 'number'];

    private const THINGS = [
        'products' => 'product', 'product_images' => 'product photo', 'product_variants' => 'product option', 'categories' => 'category',
        'collections' => 'collection', 'site_settings' => 'setting', 'site_nav' => 'menu item', 'site_media' => 'website picture',
        'slug_redirects' => 'redirect', 'orders' => 'order', 'order_items' => 'order item', 'customers' => 'customer', 'coupons' => 'discount',
        'pages' => 'page', 'reels' => 'reel', 'newsletter_subscribers' => 'subscriber', 'customer_addresses' => 'address',
    ];

    /** Does this request change data (and is it worth logging)? */
    public static function wants(array $d): bool
    {
        $table = (string) ($d['table'] ?? '');

        return in_array($d['action'] ?? 'select', self::WRITES, true) && isset(Schema::tables()[$table]) && ! in_array($table, self::QUIET, true);
    }

    /**
     * The rows an update or delete is about to touch (at most 5), read before the change.
     *
     * @return list<array<string, mixed>>
     */
    public static function before(array $d): array
    {
        if (! self::wants($d) || ! in_array($d['action'], ['update', 'delete'], true)) {
            return [];
        }
        try {
            $query = DB::table((string) $d['table']);
            $usable = false;
            foreach ((array) ($d['filters'] ?? []) as $f) {
                $col = (string) ($f['col'] ?? '');
                if (! isset(Schema::tables()[$d['table']]['columns'][$col])) {
                    continue;
                }
                if (($f['op'] ?? '') === 'eq' && is_scalar($f['value'] ?? null)) {
                    $query->where($col, $f['value']);
                    $usable = true;
                } elseif (($f['op'] ?? '') === 'in' && is_array($f['value'] ?? null) && $f['value']) {
                    $query->whereIn($col, array_slice($f['value'], 0, 200));
                    $usable = true;
                }
            }

            return $usable ? $query->limit(5)->get()->map(fn ($r) => (array) $r)->all() : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** Records the change once the data API has accepted it. */
    public static function record(Request $request, array $admin, array $d, array $before, array $result): void
    {
        if (! self::wants($d) || ($result['error'] ?? null) !== null) {
            return;
        }
        try {
            $table = (string) $d['table'];
            $action = (string) $d['action'];
            $thing = self::THINGS[$table] ?? str_replace('_', ' ', $table);
            $values = (array) ($d['values'] ?? []);
            $rows = array_is_list($values) && $values !== [] ? $values : [$values];

            if ($action === 'update') {
                $keys = array_values(array_diff(array_keys($values), ['updated_at']));
                $label = $before ? self::labelOf($before[0]) : null;
                $summary = 'Changed '.$thing.($label ? " “{$label}”" : '').($keys ? ' ('.implode(', ', array_slice($keys, 0, 6)).(count($keys) > 6 ? '…' : '').')' : '');
                $changes = [];
                foreach ($keys as $k) {
                    $new = $values[$k];
                    $old = count($before) === 1 ? ($before[0][$k] ?? null) : null;
                    $changes[$k] = count($before) === 1 ? ['from' => $old, 'to' => $new] : $new;
                }
                $details = ['table' => $table, 'records' => self::records($before), 'changes' => $changes];
            } elseif ($action === 'delete') {
                $label = $before ? self::labelOf($before[0]) : null;
                $summary = $before && count($before) > 1 ? 'Deleted '.count($before).' '.$thing.'s' : 'Deleted '.$thing.($label ? " “{$label}”" : '');
                $details = ['table' => $table, 'records' => self::records($before)];
            } else {
                $labels = array_values(array_filter(array_map(fn ($r) => self::labelOf((array) $r), $rows)));
                $verb = $action === 'insert' ? 'Added' : 'Saved';
                $summary = $verb.' '.$thing.(count($rows) > 1 ? 's' : '').($labels ? ': '.implode(', ', array_slice($labels, 0, 4)).(count($labels) > 4 ? '…' : '') : '');
                $details = ['table' => $table, 'rows' => array_map(fn ($r) => (array) $r, array_slice($rows, 0, 20))];
            }

            $first = $before[0] ?? (array) ($rows[0] ?? []);
            Activity::log($request, $admin, $action === 'delete' ? 'delete' : ($action === 'insert' ? 'create' : 'update'), $table, $summary, $details, $table, isset($first['id']) ? (string) $first['id'] : null);
        } catch (\Throwable) {
            // Logging never blocks the change.
        }
    }

    private static function labelOf(array $row): ?string
    {
        foreach (self::LABELS as $c) {
            if (isset($row[$c]) && is_scalar($row[$c]) && trim((string) $row[$c]) !== '') {
                return mb_substr(trim((string) $row[$c]), 0, 80);
            }
        }

        return null;
    }

    /** @return list<array{id: mixed, label: ?string}> */
    private static function records(array $rows): array
    {
        return array_map(fn ($r) => ['id' => $r['id'] ?? null, 'label' => self::labelOf($r)], $rows);
    }
}
