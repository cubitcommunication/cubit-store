<?php

namespace App\Http\Controllers;

use App\Support\OrderService;
use App\Support\Secrets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Shiprocket tells the server when a parcel's status changes (picked up, out for delivery, delivered...), so the order
 * shows it without anyone pressing "Refresh". Every call must carry the token saved in Integrations in the
 * x-api-key header; anything else is refused. Handling is idempotent: the same event may arrive more than once.
 *
 * Set up in Shiprocket: Settings -> API -> Webhooks. URL: https://example.com/api/webhooks/shiprocket, with the token.
 */
class ShiprocketWebhookController extends Controller
{
    public const CACHE_KEY = 'shiprocket_webhook_last_received';

    public function __invoke(Request $request): JsonResponse
    {
        $token = Secrets::get(Secrets::SHIPROCKET_WEBHOOK_TOKEN);
        if ($token === '') {
            return response()->json(['message' => 'The webhook token is not set on the server.'], 503);
        }
        if (! hash_equals($token, (string) $request->header('x-api-key'))) {
            return response()->json(['message' => 'Not allowed.'], 401);
        }

        $awb = trim((string) $request->input('awb', ''));
        $status = trim((string) ($request->input('current_status') ?? $request->input('shipment_status') ?? ''));
        if ($awb === '' || $status === '') {
            return response()->json(['ok' => true]);
        }
        Cache::put(self::CACHE_KEY, now()->utc()->format('Y-m-d\TH:i:s\Z'), now()->addDays(60));

        $order = DB::table('orders')->where('awb_code', $awb)->first();
        if (! $order) {
            return response()->json(['ok' => true]);
        }
        $status = mb_substr($status, 0, 80);
        if ($status !== (string) $order->shipping_status) {
            DB::table('orders')->where('id', $order->id)->update(['shipping_status' => $status, 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
            OrderService::event($order->id, 'Courier status: '.$status);
            \App\Support\Notifier::shipment($order, $status);
        }

        return response()->json(['ok' => true]);
    }
}
