<?php

namespace App\Support;

/** Turns a browser's user-agent text into something a person can recognise: "Chrome on Windows". */
final class DeviceLabel
{
    /** @return array{device: string, mobile: bool} */
    public static function describe(?string $ua): array
    {
        $ua = (string) $ua;
        if ($ua === '') {
            return ['device' => 'Unknown device', 'mobile' => false];
        }

        $browser = match (true) {
            (bool) preg_match('/Edg(e|A|iOS)?\//i', $ua) => 'Edge',
            (bool) preg_match('/OPR\/|Opera/i', $ua) => 'Opera',
            (bool) preg_match('/SamsungBrowser/i', $ua) => 'Samsung Internet',
            (bool) preg_match('/Firefox|FxiOS/i', $ua) => 'Firefox',
            (bool) preg_match('/CriOS|Chrome\//i', $ua) => 'Chrome',
            (bool) preg_match('/Safari\//i', $ua) && preg_match('/Version\//i', $ua) => 'Safari',
            default => 'Browser',
        };
        $os = match (true) {
            (bool) preg_match('/iPhone/i', $ua) => 'iPhone',
            (bool) preg_match('/iPad/i', $ua) => 'iPad',
            (bool) preg_match('/Android/i', $ua) => 'Android',
            (bool) preg_match('/Windows/i', $ua) => 'Windows',
            (bool) preg_match('/Macintosh|Mac OS X/i', $ua) => 'Mac',
            (bool) preg_match('/CrOS/i', $ua) => 'ChromeOS',
            (bool) preg_match('/Linux/i', $ua) => 'Linux',
            default => '',
        };

        return [
            'device' => $browser.($os !== '' ? ' on '.$os : ''),
            'mobile' => in_array($os, ['iPhone', 'iPad', 'Android'], true) || (bool) preg_match('/Mobile/i', $ua),
        ];
    }
}
