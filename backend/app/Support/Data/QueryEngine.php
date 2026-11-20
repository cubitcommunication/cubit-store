<?php

namespace App\Support\Data;

use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Turns a request description (sent by the React app) into MySQL queries and
 * enforces access: signed-out visitors can only read the tables and rows the
 * public website is allowed to show; every write needs an admin session.
 *
 * Identifiers are validated against a whitelist and every value is bound as a
 * parameter, so no part of the request is ever concatenated into SQL.
 */
final class QueryEngine
{
    private const BIG_LIMIT = '18446744073709551615';

    public function __construct(private readonly bool $isAdmin)
    {
    }

    /** @return array{data: mixed, error: ?array{message: string, code?: string}, count: ?int} */
    public function execute(array $d): array
    {
        try {
            return DB::connection()->transactionLevel() === 0 && ($d['action'] ?? 'select') !== 'select'
                ? DB::transaction(fn () => $this->run($d))
                : $this->run($d);
        } catch (QueryError $e) {
            return ['data' => null, 'error' => ['message' => $e->getMessage()], 'count' => null];
        } catch (QueryException $e) {
            $info = $e->errorInfo ?? [];
            if (($info[1] ?? null) === 1062) {
                // Same wording and code the web app already understands for duplicates.
                return ['data' => null, 'error' => ['message' => 'duplicate key value violates unique constraint', 'code' => '23505'], 'count' => null];
            }
            Log::error('[data] '.($d['table'] ?? '?').' '.($d['action'] ?? '?').': '.$e->getMessage());

            return ['data' => null, 'error' => ['message' => 'Database error'], 'count' => null];
        } catch (\Throwable $e) {
            Log::error('[data] '.$e->getMessage());

            return ['data' => null, 'error' => ['message' => 'Database error'], 'count' => null];
        }
    }

    private function run(array $d): array
    {
        $action = (string) ($d['action'] ?? '');
        if (! in_array($action, ['select', 'insert', 'update', 'delete', 'upsert'], true)) {
            throw new QueryError('Unsupported action');
        }
        $tableName = $this->ident((string) ($d['table'] ?? ''));
        $spec = Schema::table($tableName);

        if (! $this->isAdmin) {
            if ($action !== 'select' || ! $spec['publicReadable']) {
                throw new QueryError('Not authorised');
            }
        }
        if ($action !== 'select' && ! $spec['writable']) {
            throw new QueryError('Not authorised');
        }

        $filters = is_array($d['filters'] ?? null) ? $d['filters'] : [];

        return match ($action) {
            'select' => $this->select($tableName, $spec, $d, $filters),
            'insert', 'upsert' => $this->insert($tableName, $spec, $d, $action === 'upsert'),
            'update' => $this->update($tableName, $spec, $d, $filters),
            default => $this->delete($tableName, $spec, $filters),
        };
    }

    /* ----------------------------------------------------------------- helpers */

    private function ident(string $name): string
    {
        if (! preg_match('/^[a-z_][a-z0-9_]*$/', $name)) {
            throw new QueryError("Invalid identifier: {$name}");
        }

        return $name;
    }

    /** Quoted identifier, safe for reserved words such as `key`. */
    private function q(string $name): string
    {
        return '`'.$this->ident($name).'`';
    }

    private function columnType(array $spec, string $name): string
    {
        $type = $spec['columns'][$this->ident($name)] ?? null;
        if ($type === null) {
            throw new QueryError("Unknown column: {$name}");
        }

        return $type;
    }

    /**
     * Text columns that may never be NULL. Laravel turns an empty form field into NULL before it gets here, so a
     * setting the owner cleared would otherwise be refused by the database; it is stored as empty text instead.
     */
    private const NOT_NULL_TEXT = ['site_settings' => ['value']];

    /** Encodes a value for writing to a column, keeping NOT NULL text columns filled. */
    private function writeValue(string $table, array $spec, string $col, mixed $value): mixed
    {
        if ($value === null && in_array($col, self::NOT_NULL_TEXT[$table] ?? [], true)) {
            return '';
        }

        return $this->encode($this->columnType($spec, $col), $value);
    }

    private function encode(string $type, mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        return match ($type) {
            'bool' => is_string($value) ? (in_array(strtolower($value), ['1', 'true'], true) ? 1 : 0) : ($value ? 1 : 0),
            'int' => (int) $value,
            'real' => (float) $value,
            'json' => is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'ts' => $this->toDatabaseTime($value),
            default => is_bool($value) ? ($value ? 'true' : 'false') : (is_scalar($value) ? (string) $value : json_encode($value)),
        };
    }

    private function toDatabaseTime(mixed $value): string
    {
        try {
            return Carbon::parse((string) $value)->utc()->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            throw new QueryError('Invalid date value');
        }
    }

    private function decodeRow(array $spec, array $row): array
    {
        $out = [];
        foreach ($row as $key => $value) {
            $type = $spec['columns'][$key] ?? null;
            if ($type === null || $value === null) {
                $out[$key] = $value;

                continue;
            }
            $out[$key] = match ($type) {
                'bool' => (bool) (int) $value,
                'int' => (int) $value,
                'real' => (float) $value,
                'json' => $this->safeJson((string) $value),
                'ts' => Carbon::parse((string) $value, 'UTC')->utc()->format('Y-m-d\TH:i:s\Z'),
                default => $value,
            };
        }

        return $out;
    }

    private function safeJson(string $value): mixed
    {
        $decoded = json_decode($value, false);

        return json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
    }

    /** Splits "a,b,rel(c,d)" on top-level commas only. */
    private function splitTopLevel(string $input): array
    {
        $parts = [];
        $depth = 0;
        $current = '';
        foreach (str_split($input) as $char) {
            if ($char === '(') {
                $depth++;
            }
            if ($char === ')') {
                $depth--;
            }
            if ($char === ',' && $depth === 0) {
                $parts[] = trim($current);
                $current = '';

                continue;
            }
            $current .= $char;
        }
        if (trim($current) !== '') {
            $parts[] = trim($current);
        }

        return $parts;
    }

    /** @return array{columns: string[], embeds: array<int, array{name: string, fields: string}>} */
    private function parseFields(array $spec, string $table, string $fields): array
    {
        $columns = [];
        $embeds = [];
        foreach ($this->splitTopLevel((string) preg_replace('/\s+/', '', $fields)) as $part) {
            if (preg_match('/^([a-z_][a-z0-9_]*)\((.*)\)$/', $part, $m)) {
                $relation = Schema::relations()[$table][$m[1]] ?? null;
                if (! $relation) {
                    throw new QueryError("Unknown relation: {$m[1]}");
                }
                $embeds[] = ['name' => $m[1], 'fields' => $m[2] !== '' ? $m[2] : '*'];

                continue;
            }
            if ($part === '*') {
                array_push($columns, ...array_keys($spec['columns']));

                continue;
            }
            $this->columnType($spec, $part);
            $columns[] = $part;
        }
        if (! $columns) {
            $columns[] = 'id';
        }
        if ($embeds && ! in_array('id', $columns, true)) {
            $columns[] = 'id';
        }

        return ['columns' => array_values(array_unique($columns)), 'embeds' => $embeds];
    }

    private function filterSql(array $spec, array $filter, array &$params): string
    {
        $op = (string) ($filter['op'] ?? '');

        if ($op === 'or') {
            $clauses = [];
            foreach ($this->splitTopLevel((string) ($filter['parts'] ?? '')) as $part) {
                $pieces = explode('.', $part);
                $col = $pieces[0] ?? '';
                $subOp = $pieces[1] ?? '';
                $raw = implode('.', array_slice($pieces, 2));
                $type = $this->columnType($spec, $col);
                if ($subOp === 'eq') {
                    $params[] = $this->encode($type, $raw);
                    $clauses[] = $this->q($col).' = ?';
                } elseif ($subOp === 'ilike' || $subOp === 'like') {
                    $params[] = $raw;
                    $clauses[] = 'LOWER('.$this->q($col).') LIKE LOWER(?)';
                } elseif ($subOp === 'is') {
                    $clauses[] = $this->q($col).' IS '.($raw === 'null' ? 'NULL' : ($raw === 'true' ? 'TRUE' : 'FALSE'));
                } else {
                    throw new QueryError("Unsupported filter: {$part}");
                }
            }
            if (! $clauses) {
                throw new QueryError('Empty filter');
            }

            return '('.implode(' OR ', $clauses).')';
        }

        $col = (string) ($filter['col'] ?? '');
        $type = $this->columnType($spec, $col);
        $name = $this->q($col);
        $value = $filter['value'] ?? null;

        switch ($op) {
            case 'is':
            case 'not_is':
                $target = $value === null ? 'NULL' : ($value === true ? 'TRUE' : 'FALSE');

                return $name.' IS '.($op === 'not_is' ? 'NOT ' : '').$target;
            case 'in':
                if (! is_array($value) || ! $value) {
                    return '0 = 1';
                }
                foreach ($value as $item) {
                    $params[] = $this->encode($type, $item);
                }

                return $name.' IN ('.implode(',', array_fill(0, count($value), '?')).')';
            case 'ilike':
            case 'like':
                $params[] = (string) $value;

                return 'LOWER('.$name.') LIKE LOWER(?)';
            case 'eq':
            case 'neq':
            case 'gt':
            case 'gte':
            case 'lt':
            case 'lte':
                $operators = ['eq' => '=', 'neq' => '!=', 'gt' => '>', 'gte' => '>=', 'lt' => '<', 'lte' => '<='];
                if ($value === null && $op === 'eq') {
                    return $name.' IS NULL';
                }
                $params[] = $this->encode($type, $value);

                return $name.' '.$operators[$op].' ?';
            default:
                throw new QueryError('Unsupported filter');
        }
    }

    private function whereClause(array $spec, array $filters, array &$params): string
    {
        // A plain loop on purpose: arrow functions capture $params by value and would drop the bindings.
        $clauses = [];
        foreach ($filters as $filter) {
            $clauses[] = $this->filterSql($spec, (array) $filter, $params);
        }
        if (! $this->isAdmin && $spec['publicRead']) {
            $clauses[] = '('.$spec['publicRead'].')';
        }

        return $clauses ? ' WHERE '.implode(' AND ', $clauses) : '';
    }

    private function now(): string
    {
        return Carbon::now('UTC')->format('Y-m-d H:i:s');
    }

    /** @return array<int, array<string, mixed>> */
    private function fetch(string $sql, array $params = []): array
    {
        return array_map(fn ($row) => (array) $row, DB::select($sql, $params));
    }

    /* ------------------------------------------------------------------- select */

    private function select(string $table, array $spec, array $d, array $filters): array
    {
        $parsed = $this->parseFields($spec, $table, (string) ($d['fields'] ?? '*'));
        $params = [];
        $where = $this->whereClause($spec, $filters, $params);

        $count = null;
        if (! empty($d['count'])) {
            $countParams = [];
            $countWhere = $this->whereClause($spec, $filters, $countParams);
            $rows = $this->fetch('SELECT COUNT(*) AS c FROM '.$this->q($table).$countWhere, $countParams);
            $count = (int) ($rows[0]['c'] ?? 0);
        }
        if (! empty($d['head'])) {
            return ['data' => [], 'error' => null, 'count' => $count];
        }

        $order = '';
        $orders = is_array($d['orders'] ?? null) ? $d['orders'] : [];
        if ($orders) {
            $order = ' ORDER BY '.implode(', ', array_map(function ($o) use ($spec) {
                $o = (array) $o;
                $this->columnType($spec, (string) ($o['col'] ?? ''));

                return $this->q((string) $o['col']).(($o['ascending'] ?? true) === false ? ' DESC' : ' ASC');
            }, $orders));
        }

        $limit = '';
        if (isset($d['limit'])) {
            $limit = ' LIMIT '.max(0, (int) $d['limit']).' OFFSET '.max(0, (int) ($d['offset'] ?? 0));
        } elseif (isset($d['offset'])) {
            $limit = ' LIMIT '.self::BIG_LIMIT.' OFFSET '.max(0, (int) $d['offset']);
        }

        $sql = 'SELECT '.implode(', ', array_map(fn ($c) => $this->q($c), $parsed['columns']))
            .' FROM '.$this->q($table).$where.$order.$limit;
        $rows = array_map(fn ($row) => $this->decodeRow($spec, $row), $this->fetch($sql, $params));

        foreach ($parsed['embeds'] as $embed) {
            $relation = Schema::relations()[$table][$embed['name']];
            $childSpec = Schema::table($relation['table']);
            $parsedChild = $this->parseFields($childSpec, $relation['table'], $embed['fields']);
            $keys = array_values(array_filter(array_map(fn ($r) => $r['id'] ?? null, $rows), fn ($v) => $v !== null));
            $childColumns = array_values(array_unique([...$parsedChild['columns'], $relation['foreignKey']]));

            $childRows = [];
            if ($keys) {
                $childSql = 'SELECT '.implode(', ', array_map(fn ($c) => $this->q($c), $childColumns))
                    .' FROM '.$this->q($relation['table'])
                    .' WHERE '.$this->q($relation['foreignKey']).' IN ('.implode(',', array_fill(0, count($keys), '?')).')'
                    .(isset($childSpec['columns']['sort_order']) ? ' ORDER BY `sort_order` ASC' : '');
                $childRows = array_map(fn ($row) => $this->decodeRow($childSpec, $row), $this->fetch($childSql, $keys));
            }

            $grouped = [];
            foreach ($childRows as $child) {
                $grouped[$child[$relation['foreignKey']]][] = $child;
            }
            foreach ($rows as &$row) {
                $mine = $grouped[$row['id']] ?? [];
                if (! in_array($relation['foreignKey'], $parsedChild['columns'], true)) {
                    $mine = array_map(function ($c) use ($relation) {
                        unset($c[$relation['foreignKey']]);

                        return $c;
                    }, $mine);
                }
                $row[$embed['name']] = $mine;
            }
            unset($row);
        }

        $single = $d['single'] ?? null;
        if ($single) {
            if (! $rows) {
                return $single === 'one'
                    ? ['data' => null, 'error' => ['message' => 'No rows found'], 'count' => $count]
                    : ['data' => null, 'error' => null, 'count' => $count];
            }

            return ['data' => $rows[0], 'error' => null, 'count' => $count];
        }

        return ['data' => $rows, 'error' => null, 'count' => $count];
    }

    /* ------------------------------------------------------------------- insert */

    private function insert(string $table, array $spec, array $d, bool $upsert): array
    {
        $values = $d['values'] ?? [];
        $inputs = (is_array($values) && array_is_list($values) && $values !== []) ? $values : [$values];
        $returning = ! empty($d['returning']);
        $conflict = $this->ident((string) ($d['onConflict'] ?? 'id'));
        $inserted = [];

        foreach ($inputs as $input) {
            $row = (array) $input;
            if (isset($spec['columns']['id']) && ! array_key_exists('id', $row)) {
                $row['id'] = (string) Str::uuid();
            }
            if (isset($spec['columns']['created_at']) && ! array_key_exists('created_at', $row)) {
                $row['created_at'] = $this->now();
            }
            if (isset($spec['columns']['updated_at'])) {
                $row['updated_at'] = $this->now();
            }

            $cols = array_keys($row);
            $params = [];
            foreach ($cols as $col) {
                $params[] = $this->writeValue($table, $spec, $col, $row[$col]);
            }
            $sql = 'INSERT INTO '.$this->q($table).' ('.implode(', ', array_map(fn ($c) => $this->q($c), $cols)).') VALUES ('
                .implode(', ', array_fill(0, count($cols), '?')).')';

            if ($upsert) {
                $updates = array_values(array_filter($cols, fn ($c) => ! in_array($c, [$conflict, 'created_at', 'id'], true)));
                $assign = $updates
                    ? implode(', ', array_map(fn ($c) => $this->q($c).' = VALUES('.$this->q($c).')', $updates))
                    : $this->q($conflict).' = '.$this->q($conflict);
                $sql .= ' ON DUPLICATE KEY UPDATE '.$assign;
            }

            DB::statement($sql, $params);

            if ($returning) {
                // MySQL has no RETURNING: read the row back by the key we wrote.
                $keyColumn = $upsert && array_key_exists($conflict, $row) ? $conflict : 'id';
                $found = $this->fetch(
                    'SELECT * FROM '.$this->q($table).' WHERE '.$this->q($keyColumn).' = ? LIMIT 1',
                    [$this->encode($this->columnType($spec, $keyColumn), $row[$keyColumn])],
                );
                if ($found) {
                    $inserted[] = $this->decodeRow($spec, $found[0]);
                }
            }
        }

        if (! $returning) {
            return ['data' => null, 'error' => null, 'count' => null];
        }
        if (! empty($d['single'])) {
            return ['data' => $inserted[0] ?? null, 'error' => null, 'count' => null];
        }

        return ['data' => $inserted, 'error' => null, 'count' => null];
    }

    /* ------------------------------------------------------------------- update */

    private function update(string $table, array $spec, array $d, array $filters): array
    {
        if (! $filters) {
            throw new QueryError('Refusing to update every row');
        }
        $row = (array) ($d['values'] ?? []);
        unset($row['id']);
        if (isset($spec['columns']['updated_at'])) {
            $row['updated_at'] = $this->now();
        }
        $cols = array_keys($row);
        if (! $cols) {
            throw new QueryError('Nothing to update');
        }

        $returning = ! empty($d['returning']);
        $ids = [];
        if ($returning) {
            $idParams = [];
            $idWhere = $this->whereClause($spec, $filters, $idParams);
            $ids = array_map(fn ($r) => $r['id'], $this->fetch('SELECT `id` FROM '.$this->q($table).$idWhere, $idParams));
        }

        $params = [];
        foreach ($cols as $col) {
            $params[] = $this->writeValue($table, $spec, $col, $row[$col]);
        }
        $where = $this->whereClause($spec, $filters, $params);
        DB::statement(
            'UPDATE '.$this->q($table).' SET '.implode(', ', array_map(fn ($c) => $this->q($c).' = ?', $cols)).$where,
            $params,
        );

        if (! $returning) {
            return ['data' => null, 'error' => null, 'count' => null];
        }
        $decoded = [];
        if ($ids) {
            $decoded = array_map(
                fn ($r) => $this->decodeRow($spec, $r),
                $this->fetch('SELECT * FROM '.$this->q($table).' WHERE `id` IN ('.implode(',', array_fill(0, count($ids), '?')).')', $ids),
            );
        }

        return ['data' => ! empty($d['single']) ? ($decoded[0] ?? null) : $decoded, 'error' => null, 'count' => null];
    }

    /* ------------------------------------------------------------------- delete */

    private function delete(string $table, array $spec, array $filters): array
    {
        if (! $filters) {
            throw new QueryError('Refusing to delete every row');
        }
        $params = [];
        $where = $this->whereClause($spec, $filters, $params);
        DB::statement('DELETE FROM '.$this->q($table).$where, $params);

        return ['data' => null, 'error' => null, 'count' => null];
    }
}
