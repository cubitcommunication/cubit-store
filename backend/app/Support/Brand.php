<?php

namespace App\Support;

/**
 * The store's identity (name, contact details, social links, web address), read from config/brand.php and SITE_URL.
 * Everything that prints the brand on the server goes through here, never a typed-in name.
 */
final class Brand
{
    public static function name(): string
    {
        return (string) config('brand.name');
    }

    public static function get(string $key): string
    {
        return (string) config('brand.'.$key);
    }

    public static function timezone(): string
    {
        return self::get('timezone') ?: 'UTC';
    }

    public static function currencySymbol(): string
    {
        return self::get('currency_symbol');
    }

    /** Public address, no trailing slash. */
    public static function siteUrl(): string
    {
        return (string) config('shop.site_url');
    }

    /** Address without the scheme, for printing (e.g. example.com). */
    public static function domainLabel(): string
    {
        return (string) preg_replace('#^https?://#', '', self::siteUrl());
    }

    /** Replaces the {brand} placeholder in a text with the store name. */
    public static function fill(string $text): string
    {
        return str_replace('{brand}', self::name(), $text);
    }

    /** Same, for a text that will be placed inside a JSON string. */
    public static function fillJson(string $json): string
    {
        return str_replace('{brand}', trim((string) json_encode(self::name(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP), '"'), $json);
    }

    /** What the web app needs, handed to the page as window.__BRAND__ (public facts only). */
    public static function forBrowser(): array
    {
        return [
            'name' => self::name(),
            'tagline' => self::get('tagline'),
            'description' => self::get('description'),
            'foundedLabel' => self::get('founded_label'),
            'phoneDisplay' => self::get('phone_display'),
            'phoneE164' => self::get('phone_e164'),
            'email' => self::get('support_email'),
            'instagramHandle' => self::get('instagram_handle'),
            'instagramUrl' => self::get('instagram_url'),
            'facebookLabel' => self::get('facebook_label'),
            'facebookUrl' => self::get('facebook_url'),
            'websiteLabel' => self::domainLabel(),
            'currencySymbol' => self::get('currency_symbol'),
            'locale' => self::get('locale'),
            'timezone' => self::timezone(),
            'country' => self::get('country'),
            'siteUrl' => self::siteUrl(),
            'storefrontUrl' => self::get('storefront_url'),
        ];
    }

    /** The <script> that carries forBrowser() into the page. */
    public static function script(): string
    {
        $json = json_encode(self::forBrowser(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

        return '<script>window.__BRAND__='.$json.';</script>'."\n";
    }
}
