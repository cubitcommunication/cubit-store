<?php

namespace App\Support;

/** Product tags: trimmed, one spelling per tag (case-insensitive), short, and a sensible number per product. */
final class Tags
{
    public const MAX_LENGTH = 30;

    public const MAX_PER_PRODUCT = 30;

    /** One tag cleaned up, or null when nothing usable is left. */
    public static function one(mixed $tag): ?string
    {
        if (! is_string($tag) && ! is_numeric($tag)) {
            return null;
        }
        $tag = trim((string) preg_replace('/\s+/u', ' ', str_replace([',', ';', "\n", "\r", "\t"], ' ', (string) $tag)));
        if ($tag === '') {
            return null;
        }

        return mb_substr($tag, 0, self::MAX_LENGTH);
    }

    /**
     * @return list<string>
     */
    public static function clean(mixed $tags): array
    {
        $out = [];
        $seen = [];
        foreach ((array) ($tags ?? []) as $raw) {
            $tag = self::one($raw);
            if ($tag === null || isset($seen[mb_strtolower($tag)])) {
                continue;
            }
            $seen[mb_strtolower($tag)] = true;
            $out[] = $tag;
            if (count($out) >= self::MAX_PER_PRODUCT) {
                break;
            }
        }

        return $out;
    }

    /**
     * Reads the stored value of a product's tags column.
     *
     * @return list<string>
     */
    public static function decode(mixed $stored): array
    {
        if (is_array($stored)) {
            return self::clean($stored);
        }
        $data = is_string($stored) && $stored !== '' ? json_decode($stored, true) : [];

        return self::clean(is_array($data) ? $data : []);
    }

    public static function encode(array $tags): string
    {
        return json_encode(self::clean($tags), JSON_UNESCAPED_UNICODE);
    }

    /** True when the list already has this tag (any capitalisation). */
    public static function has(array $tags, string $tag): bool
    {
        return in_array(mb_strtolower($tag), array_map('mb_strtolower', $tags), true);
    }
}
