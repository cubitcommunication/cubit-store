<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\OrderService;
use App\Support\Shiprocket;
use App\Support\ShiprocketException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Admin -> Orders -> an order -> Shipping: sends the order to Shiprocket, books a courier, schedules the pickup, gets the
 * label and keeps the tracking status. Any admin who looks after orders can use these; connecting Shiprocket itself
 * (the login, the pickup address) is for the main administrator in Integrations.
 */
class ShippingController extends Controller
{
    private function find(string $id): ?object
    {
        return DB::table('orders')->where('id', $id)->first() ?: null;
    }

    private function fail(string $message, int $status = 422): JsonResponse
    {
        return response()->json(['message' => $message], $status);
    }

    private function touch(string $id, array $fields): void
    {
        DB::table('orders')->where('id', $id)->update($fields + ['updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
    }

    /** Why this order cannot be shipped right now, or null. */
    private function blocker(object $o): ?string
    {
        if (! Shiprocket::enabled()) {
            return 'Shiprocket is not switched on. The main administrator can connect it in Integrations.';
        }
        if ($o->status === 'cancelled') {
            return 'This order is cancelled.';
        }
        if ($o->payment_method !== 'cod' && $o->payment_status !== 'paid') {
            return 'The online payment has not been received yet, so this order should not be shipped.';
        }

        return null;
    }

    /**
     * The parcel: weight from each product (or the default), size from the biggest product with the heights stacked.
     *
     * @return array{grams: int, kg: float, length: float, breadth: float, height: float, defaults: bool}
     */
    private function parcel(object $order): array
    {
        $def = [
            'g' => max(1, (int) (Shiprocket::setting('shiprocket_default_weight_g') ?: 300)),
            'l' => max(1.0, (float) (Shiprocket::setting('shiprocket_default_length_cm') ?: 15)),
            'b' => max(1.0, (float) (Shiprocket::setting('shiprocket_default_breadth_cm') ?: 12)),
            'h' => max(1.0, (float) (Shiprocket::setting('shiprocket_default_height_cm') ?: 5)),
        ];
        $items = DB::table('order_items')->where('order_id', $order->id)->get();
        $products = DB::table('products')->whereIn('id', $items->pluck('product_id')->filter()->all())->get()->keyBy('id');

        $grams = 0;
        $length = 0.0;
        $breadth = 0.0;
        $height = 0.0;
        $usedDefault = false;
        foreach ($items as $i) {
            $p = $products->get($i->product_id);
            $qty = max(1, (int) $i->quantity);
            $w = $p && (int) $p->weight_grams > 0 ? (int) $p->weight_grams : null;
            $usedDefault = $usedDefault || $w === null;
            $grams += ($w ?? $def['g']) * $qty;
            $length = max($length, $p && (float) $p->length_cm > 0 ? (float) $p->length_cm : $def['l']);
            $breadth = max($breadth, $p && (float) $p->breadth_cm > 0 ? (float) $p->breadth_cm : $def['b']);
            $height += ($p && (float) $p->height_cm > 0 ? (float) $p->height_cm : $def['h']) * min($qty, 3);
        }
        $grams = max($grams, 50);

        return ['grams' => $grams, 'kg' => round($grams / 1000, 3), 'length' => $length ?: $def['l'], 'breadth' => $breadth ?: $def['b'], 'height' => min($height ?: $def['h'], 100.0), 'defaults' => $usedDefault];
    }

    private function present(object $o): array
    {
        $parcel = $this->parcel($o);
        $blocker = $this->blocker($o);

        return [
            'enabled' => Shiprocket::enabled(),
            'pickupLocation' => Shiprocket::setting('shiprocket_pickup_location') ?: null,
            'canShip' => $blocker === null,
            'reason' => $blocker,
            'cod' => $o->payment_method === 'cod',
            'parcel' => ['weightKg' => $parcel['kg'], 'length' => $parcel['length'], 'breadth' => $parcel['breadth'], 'height' => $parcel['height'], 'usesDefaults' => $parcel['defaults']],
            'shipment' => [
                'orderId' => $o->shiprocket_order_id, 'shipmentId' => $o->shiprocket_shipment_id, 'awb' => $o->awb_code, 'courier' => $o->courier_name,
                'trackingUrl' => $o->tracking_url, 'status' => $o->shipping_status, 'labelUrl' => $o->label_url, 'pickup' => $o->pickup_info,
            ],
        ];
    }

    public function show(string $id): JsonResponse
    {
        $o = $this->find($id);

        return $o ? response()->json($this->present($o)) : $this->fail('Order not found.', 404);
    }

    /** Couriers and prices for this order's parcel and address. */
    public function couriers(string $id): JsonResponse
    {
        $o = $this->find($id);
        if (! $o) {
            return $this->fail('Order not found.', 404);
        }
        if ($why = $this->blocker($o)) {
            return $this->fail($why);
        }
        $address = (array) json_decode((string) $o->shipping_address, true);
        $pickup = Shiprocket::pickupPincode();
        if (! $pickup) {
            return $this->fail('The pickup address has no PIN code. Check the pickup location in Integrations → Shiprocket.');
        }

        try {
            $list = Shiprocket::couriers($pickup, (string) ($address['pincode'] ?? ''), $this->parcel($o)['kg'], $o->payment_method === 'cod');
        } catch (ShiprocketException $e) {
            return $this->fail($e->getMessage());
        }

        return response()->json($list);
    }

    /** Sends the order to Shiprocket (it then appears there as a ready-to-ship order). */
    public function create(string $id): JsonResponse
    {
        $o = $this->find($id);
        if (! $o) {
            return $this->fail('Order not found.', 404);
        }
        if ($why = $this->blocker($o)) {
            return $this->fail($why);
        }
        if ($o->shiprocket_order_id) {
            return $this->fail('This order was already sent to Shiprocket.');
        }
        $pickupName = Shiprocket::setting('shiprocket_pickup_location');
        if ($pickupName === '') {
            return $this->fail('Choose the pickup address in Integrations → Shiprocket first.');
        }
        $address = (array) json_decode((string) $o->shipping_address, true);
        $phone = substr(preg_replace('/\D/', '', (string) ($address['phone'] ?? $o->phone)) ?? '', -10);
        if (! preg_match('/^[1-9][0-9]{5}$/', (string) ($address['pincode'] ?? '')) || strlen($phone) !== 10 || trim((string) ($address['line1'] ?? '')) === '') {
            return $this->fail('The shipping address is incomplete (street, PIN code or a 10-digit phone). Edit the address on this order first.');
        }

        $items = DB::table('order_items')->where('order_id', $o->id)->orderBy('created_at')->get();
        $parcel = $this->parcel($o);
        [$first, $last] = array_pad(explode(' ', trim((string) ($address['name'] ?? $o->name)), 2), 2, '');

        $payload = [
            'order_id' => (string) $o->number,
            'order_date' => \Carbon\Carbon::parse($o->created_at, 'UTC')->timezone(\App\Support\Brand::timezone())->format('Y-m-d H:i'),
            'pickup_location' => $pickupName,
            'billing_customer_name' => $first ?: 'Customer', 'billing_last_name' => $last,
            'billing_address' => (string) $address['line1'], 'billing_address_2' => (string) ($address['line2'] ?? ''),
            'billing_city' => (string) ($address['city'] ?? ''), 'billing_pincode' => (string) $address['pincode'],
            'billing_state' => (string) ($address['state'] ?? ''), 'billing_country' => 'India',
            'billing_email' => (string) $o->email, 'billing_phone' => $phone,
            'shipping_is_billing' => true,
            'order_items' => $items->map(fn ($i) => [
                'name' => trim($i->name.($i->variant_title ? ' ('.$i->variant_title.')' : '')), 'sku' => (string) $i->sku,
                'units' => (int) $i->quantity, 'selling_price' => (float) $i->price,
            ])->values()->all(),
            'payment_method' => $o->payment_method === 'cod' ? 'COD' : 'Prepaid',
            // Shiprocket adds these up: sub_total + shipping_charges - total_discount is the order value (and the COD amount).
            'sub_total' => round((float) $items->sum('line_total'), 2),
            'shipping_charges' => round((float) $o->shipping_total + (float) $o->cod_fee, 2),
            'total_discount' => round((float) $o->discount_total, 2),
            'giftwrap_charges' => 0, 'transaction_charges' => 0,
            'length' => $parcel['length'], 'breadth' => $parcel['breadth'], 'height' => $parcel['height'], 'weight' => $parcel['kg'],
        ];

        try {
            $res = Shiprocket::createOrder($payload);
        } catch (ShiprocketException $e) {
            return $this->fail($e->getMessage());
        }

        $this->touch($o->id, [
            'shiprocket_order_id' => (string) $res['order_id'], 'shiprocket_shipment_id' => (string) $res['shipment_id'],
            'shipping_status' => 'Order created in Shiprocket',
        ]);
        OrderService::event($o->id, 'Sent to Shiprocket (shipment '.$res['shipment_id'].')');

        return response()->json($this->present($this->find($id)));
    }

    /** Books a courier (the chosen one, or Shiprocket's pick) and gets the tracking number. Then the customer is told. */
    public function assign(Request $request, string $id): JsonResponse
    {
        $o = $this->find($id);
        if (! $o || ! $o->shiprocket_shipment_id) {
            return $this->fail('Send the order to Shiprocket first.');
        }
        if ($why = $this->blocker($o)) {
            return $this->fail($why);
        }
        if ($o->awb_code) {
            return $this->fail('A courier is already booked for this order.');
        }
        $courier = $request->validate(['courier_id' => ['nullable', 'integer', 'min:1']])['courier_id'] ?? null;

        try {
            $r = Shiprocket::assignAwb($o->shiprocket_shipment_id, $courier !== null ? (int) $courier : null);
        } catch (ShiprocketException $e) {
            return $this->fail($e->getMessage());
        }

        $this->touch($o->id, [
            'awb_code' => $r['awb'], 'courier_name' => $r['courier'] ?: null, 'shipping_status' => 'Courier booked',
            'tracking_url' => 'https://shiprocket.co/tracking/'.rawurlencode($r['awb']),
        ]);
        OrderService::event($o->id, 'Courier booked: '.($r['courier'] ?: 'courier').', tracking number '.$r['awb']);
        // Booking the courier is the point the order counts as shipped: mark it and tell the customer (with the tracking number).
        if ($o->fulfillment_status !== 'fulfilled') {
            $this->touch($o->id, ['fulfillment_status' => 'fulfilled', 'fulfilled_at' => now()->utc()->format('Y-m-d H:i:s')]);
            OrderService::event($o->id, 'Marked as fulfilled (shipped)');
            OrderService::notifyShipped($o->id);
        }

        return response()->json($this->present($this->find($id)));
    }

    public function pickup(string $id): JsonResponse
    {
        $o = $this->find($id);
        if (! $o || ! $o->shiprocket_shipment_id || ! $o->awb_code) {
            return $this->fail('Book a courier first.');
        }
        try {
            $when = Shiprocket::schedulePickup($o->shiprocket_shipment_id);
        } catch (ShiprocketException $e) {
            return $this->fail($e->getMessage());
        }
        $this->touch($o->id, ['pickup_info' => mb_substr($when, 0, 120), 'shipping_status' => 'Pickup scheduled']);
        OrderService::event($o->id, 'Pickup scheduled with the courier ('.$when.')');

        return response()->json($this->present($this->find($id)));
    }

    public function label(string $id): JsonResponse
    {
        $o = $this->find($id);
        if (! $o || ! $o->shiprocket_shipment_id || ! $o->awb_code) {
            return $this->fail('Book a courier first.');
        }
        try {
            $url = Shiprocket::label($o->shiprocket_shipment_id);
        } catch (ShiprocketException $e) {
            return $this->fail($e->getMessage());
        }
        $this->touch($o->id, ['label_url' => $url]);

        return response()->json($this->present($this->find($id)));
    }

    /** Asks Shiprocket where the parcel is now. */
    public function track(string $id): JsonResponse
    {
        $o = $this->find($id);
        if (! $o || ! $o->awb_code) {
            return $this->fail('There is no tracking number yet.');
        }
        try {
            $t = Shiprocket::track($o->awb_code);
        } catch (ShiprocketException $e) {
            return $this->fail($e->getMessage());
        }
        if ($t['status'] !== (string) $o->shipping_status) {
            OrderService::event($o->id, 'Courier status: '.$t['status']);
            \App\Support\Notifier::shipment($o, $t['status']);
        }
        $this->touch($o->id, ['shipping_status' => $t['status']] + ($t['url'] ? ['tracking_url' => $t['url']] : []));

        return response()->json($this->present($this->find($id)));
    }

    /** Cancels the shipment in Shiprocket (before the courier collects it). The order itself stays open. */
    public function cancel(string $id): JsonResponse
    {
        $o = $this->find($id);
        if (! $o || ! $o->shiprocket_order_id) {
            return $this->fail('This order has no Shiprocket shipment.');
        }
        try {
            Shiprocket::cancel($o->shiprocket_order_id);
        } catch (ShiprocketException $e) {
            return $this->fail($e->getMessage());
        }
        $this->touch($o->id, [
            'shiprocket_order_id' => null, 'shiprocket_shipment_id' => null, 'awb_code' => null, 'courier_name' => null,
            'tracking_url' => null, 'label_url' => null, 'pickup_info' => null, 'shipping_status' => null,
        ]);
        OrderService::event($o->id, 'Shiprocket shipment cancelled'.($o->awb_code ? ' (tracking number '.$o->awb_code.')' : ''));

        return response()->json($this->present($this->find($id)));
    }

    /* ----------------------------------------------------------- Integrations page (main administrator) */

    /** Signs in with the saved login and returns the pickup addresses, so the owner can choose one. */
    public function test(): JsonResponse
    {
        try {
            $locations = Shiprocket::testConnection();
        } catch (ShiprocketException $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()]);
        }

        return response()->json(['ok' => true, 'locations' => $locations, 'message' => 'Connected to Shiprocket.'.($locations ? '' : ' No pickup address was found: add one in Shiprocket → Settings → Pickup addresses.')]);
    }
}
