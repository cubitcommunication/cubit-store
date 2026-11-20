<?php

namespace App\Http\Controllers;

use App\Support\Shiprocket;
use App\Support\ShiprocketException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * "Can you deliver to my PIN code, and how soon?" on the product page. Answers come from Shiprocket and are kept for a
 * few hours per PIN code, so a busy page cannot run up the number of calls. Nothing about the shop's account is shown.
 */
class DeliveryCheckController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $pin = (string) $request->query('pincode', '');
        if (! preg_match('/^[1-9][0-9]{5}$/', $pin)) {
            return response()->json(['enabled' => true, 'message' => 'Please enter a valid 6-digit PIN code.'], 422);
        }
        if (! Shiprocket::enabled()) {
            return response()->json(['enabled' => false]);
        }

        $result = Cache::remember('delivery_check_'.$pin, now()->addHours(6), function () use ($pin) {
            $from = Shiprocket::pickupPincode();
            if (! $from) {
                return ['serviceable' => null];
            }
            try {
                $weight = max(50, (int) (Shiprocket::setting('shiprocket_default_weight_g') ?: 300)) / 1000;
                $list = Shiprocket::couriers($from, $pin, $weight, false)['couriers'];
            } catch (ShiprocketException) {
                return ['serviceable' => null];
            }
            $days = array_values(array_filter(array_map(fn ($c) => $c['days'], $list), fn ($d) => $d !== null && $d > 0));

            return $list ? ['serviceable' => true, 'days' => $days ? min($days) : null, 'daysMax' => $days ? max($days) : null] : ['serviceable' => false];
        });

        // Unknown (Shiprocket unreachable) is not cached for long, so a hiccup does not stick.
        if (($result['serviceable'] ?? null) === null) {
            Cache::forget('delivery_check_'.$pin);
        }

        return response()->json(['enabled' => true, 'pincode' => $pin] + $result);
    }
}
