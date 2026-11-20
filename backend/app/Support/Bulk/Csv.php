<?php

namespace App\Support\Bulk;

/**
 * Shared CSV contract for the admin bulk product import / export.
 *
 * The column names are the stable, documented interface: the export, the blank
 * template, the single-product download and the importer all use exactly these
 * headers, in this order (identical to frontend/src/lib/csv.ts).
 */
final class Csv
{
    public const COLUMNS = [
        'Product Name', 'SKU', 'Slug', 'Price', 'Category', 'Material', 'Collection', 'Subcategory',
        'Short Description', 'Description', 'Where to Wear', 'Occasions', 'Visibility', 'Featured',
        'New Arrival', 'SEO Title', 'SEO Description', 'Social Image URL',
        'Primary Image URL', 'Additional Image URLs', 'Image Alt Text', 'WhatsApp Enquiry Message',
    ];

    /** Rows whose product name starts with this marker are never imported. */
    public const EXAMPLE_MARKER = 'EXAMPLE';

    /** RFC 4180 parser: handles quotes, escaped quotes, embedded newlines, CRLF. */
    public static function parse(string $input): array
    {
        $text = str_starts_with($input, "\xEF\xBB\xBF") ? substr($input, 3) : $input;
        $rows = [];
        $row = [];
        $value = '';
        $quoted = false;
        $length = strlen($text);

        for ($i = 0; $i < $length; $i++) {
            $char = $text[$i];
            if ($quoted) {
                if ($char === '"') {
                    if (($text[$i + 1] ?? '') === '"') {
                        $value .= '"';
                        $i++;
                    } else {
                        $quoted = false;
                    }
                } else {
                    $value .= $char;
                }

                continue;
            }
            if ($char === '"') {
                $quoted = true;

                continue;
            }
            if ($char === ',') {
                $row[] = $value;
                $value = '';

                continue;
            }
            if ($char === "\n" || $char === "\r") {
                if ($char === "\r" && ($text[$i + 1] ?? '') === "\n") {
                    $i++;
                }
                $row[] = $value;
                $value = '';
                $rows[] = $row;
                $row = [];

                continue;
            }
            $value .= $char;
        }
        $row[] = $value;
        $rows[] = $row;

        return array_values(array_filter($rows, fn ($r) => (bool) array_filter($r, fn ($cell) => trim($cell) !== '')));
    }

    /** @return array{records: array<int, array<string,string>>, missingColumns: string[], unknownColumns: string[]} */
    public static function parseRecords(string $input): array
    {
        $matrix = self::parse($input);
        $header = array_map('trim', $matrix[0] ?? []);
        $records = [];
        foreach (array_slice($matrix, 1) as $cells) {
            $record = [];
            foreach ($header as $index => $key) {
                $record[$key] = trim($cells[$index] ?? '');
            }
            $records[] = $record;
        }

        return [
            'records' => $records,
            'missingColumns' => array_values(array_filter(self::COLUMNS, fn ($c) => ! in_array($c, $header, true))),
            'unknownColumns' => array_values(array_filter($header, fn ($h) => $h !== '' && ! in_array($h, self::COLUMNS, true))),
        ];
    }

    /** Neutralises spreadsheet formula injection: a leading = + - @ tab or CR gets an apostrophe. */
    public static function sanitizeCell(mixed $value): string
    {
        if ($value === null) {
            $raw = '';
        } elseif (is_array($value)) {
            $raw = array_is_list($value) ? implode(', ', $value) : json_encode($value);
        } elseif (is_bool($value)) {
            $raw = $value ? 'true' : 'false';
        } else {
            $raw = (string) $value;
        }
        if (preg_match('/^[=+\-@\t\r]/', $raw)) {
            $raw = "'".$raw;
        }

        return '"'.str_replace('"', '""', $raw).'"';
    }

    public static function build(array $records): string
    {
        $lines = [implode(',', array_map([self::class, 'sanitizeCell'], self::COLUMNS))];
        foreach ($records as $record) {
            $lines[] = implode(',', array_map(fn ($c) => self::sanitizeCell($record[$c] ?? null), self::COLUMNS));
        }

        return implode("\r\n", $lines);
    }

    public static function parseBoolean(?string $value): ?bool
    {
        $text = strtolower(trim((string) $value));
        if ($text === '') {
            return false;
        }
        if (in_array($text, ['true', 'yes', 'y', '1'], true)) {
            return true;
        }
        if (in_array($text, ['false', 'no', 'n', '0'], true)) {
            return false;
        }

        return null;
    }

    public static function parseVisibility(?string $value): ?bool
    {
        $text = strtolower(trim((string) $value));
        if ($text === '' || $text === 'draft') {
            return false;
        }
        if ($text === 'published') {
            return true;
        }

        return null;
    }

    /** @return string[] */
    public static function splitList(?string $value): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/[,|]/', (string) $value) ?: []), fn ($v) => $v !== ''));
    }

    public static function isValidHttpUrl(string $value): bool
    {
        if (str_starts_with($value, '/api/public/img/') || str_starts_with($value, '/images/')) {
            return true;
        }
        $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));

        return in_array($scheme, ['http', 'https'], true) && filter_var($value, FILTER_VALIDATE_URL) !== false;
    }

    public static function slugify(string $value): string
    {
        $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower(trim($value)));

        return trim((string) $slug, '-');
    }
}
