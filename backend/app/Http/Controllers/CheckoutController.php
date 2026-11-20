<?php

namespace App\Http\Controllers;

use App\Support\Commerce;
use App\Support\Coupons;
use App\Support\CustomerAuth;
use Illuminate\Support\Facades\RateLimiter;
use App\Support\OrderService;
use App\Support\Secrets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** Cart pricing, checkout, online-payment confirmation and the thank-you page lookup. */
class CheckoutController extends Controller
{
    /** Live prices / stock / totals for the cart. The browser never supplies a price. */
    public function quote(Request $request): JsonResponse
    {
        if (! Commerce::cartEnabled()) {
            return response()->json(['message' => 'The cart is not enabled.'], 403);
        }
        $data = $request->validate([
            'items' => ['required', 'array', 'max:50'],
            'paymentMethod' => ['nullable', 'in:cod,razorpay'],
            'coupon' => ['nullable', 'string', 'max:60'],
            'state' => ['nullable', 'string', 'max:120'],
        ]);

        // Slow down anyone guessing codes: only wrong guesses count.
        $key = 'coupon-guess|'.$request->ip();
        $code = Coupons::normalise($data['coupon'] ?? null);
        if ($code !== '' && RateLimiter::tooManyAttempts($key, 12)) {
            return response()->json(['message' => 'Too many attempts. Please wait a minute and try again.'], 429);
        }

        $customer = CustomerAuth::current($request);
        $quote = Commerce::quote($data['items'], $data['paymentMethod'] ?? 'cod', false, $code, $customer->email ?? null, $customer->id ?? null, $data['state'] ?? null);
        if ($code !== '' && $quote['couponError']) {
            RateLimiter::hit($key, 60);
        }

        return response()->json($quote + [
            'checkoutEnabled' => Commerce::checkoutEnabled(),
            'paymentMethods' => Commerce::paymentMethods(),
        ]);
    }

    /** Offers the store has switched on to show shoppers (Admin -> Discounts -> "Show on website"). */
    public function promotions(): JsonResponse
    {
        return response()->json(Commerce::cartEnabled() ? Coupons::promoted() : []);
    }

    public function place(Request $request): JsonResponse
    {
        if (! Commerce::checkoutEnabled()) {
            return response()->json(['message' => 'Online ordering is not available right now. Please enquire on WhatsApp.'], 403);
        }

        $customerRow = CustomerAuth::current($request);
        if (! $customerRow && ! Commerce::on('commerce_guest_checkout')) {
            return response()->json(['message' => 'Please sign in to place an order.'], 401);
        }

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'paymentMethod' => ['required', 'in:cod,razorpay'],
            'customer.name' => ['required', 'string', 'max:120'],
            'customer.email' => ['required', 'email', 'max:160'],
            'customer.phone' => ['required', 'regex:/^[0-9+\-\s]{10,15}$/'],
            'address.name' => ['required', 'string', 'max:120'],
            'address.phone' => ['required', 'regex:/^[0-9+\-\s]{10,15}$/'],
            'address.line1' => ['required', 'string', 'max:200'],
            'address.line2' => ['nullable', 'string', 'max:200'],
            'address.city' => ['required', 'string', 'max:120'],
            'address.state' => ['required', 'string', 'max:120'],
            'address.pincode' => ['required', 'regex:/^[1-9][0-9]{5}$/'],
            'notes' => ['nullable', 'string', 'max:500'],
            'coupon' => ['nullable', 'string', 'max:60'],
        ], ['address.pincode.regex' => 'Please enter a valid 6-digit PIN code.', 'customer.phone.regex' => 'Please enter a valid phone number.']);

        $method = $data['paymentMethod'];
        if (! in_array($method, Commerce::paymentMethods(), true)) {
            return response()->json(['message' => 'That payment method is not available.'], 422);
        }

        $address = $data['address'] + ['line2' => null, 'country' => 'India'];
        $result = OrderService::place($data['items'], $data['customer'], $address, $method, $data['notes'] ?? null, $customerRow->id ?? null, $data['coupon'] ?? null);
        if (! $result['order']) {
            return response()->json(['message' => $result['problems'][0] ?? 'Could not place the order.', 'problems' => $result['problems']], 422);
        }
        $order = $result['order'];
        try {
            \App\Support\AbandonedCarts::orderPlaced($order->email, $order->id, (float) $order->total);
        } catch (\Throwable $e) {
            report($e);
        }
        $payload = ['number' => (int) $order->number, 'token' => $order->access_token, 'paymentMethod' => $method];
        if ($method === 'cod') {
            OrderService::notify($order);
        }

        if ($method === 'razorpay') {
            try {
                $response = Http::withBasicAuth(Secrets::razorpay()['key_id'], Secrets::razorpay()['key_secret'])
                    ->timeout(20)->post('https://api.razorpay.com/v1/orders', [
                        'amount' => (int) round(((float) $order->total) * 100), 'currency' => \App\Support\Brand::get('currency_code'), 'receipt' => 'order_'.$order->number,
                    ]);
                if (! $response->successful() || ! $response->json('id')) {
                    throw new \RuntimeException('Razorpay returned '.$response->status());
                }
                DB::table('orders')->where('id', $order->id)->update(['razorpay_order_id' => $response->json('id')]);
                OrderService::event($order->id, 'Online payment started');
                $payload['razorpay'] = [
                    'key' => Secrets::razorpay()['key_id'], 'orderId' => $response->json('id'),
                    'amount' => (int) round(((float) $order->total) * 100), 'currency' => \App\Support\Brand::get('currency_code'),
                    'name' => \App\Support\Brand::name(), 'prefill' => ['name' => $order->name, 'email' => $order->email, 'contact' => $order->phone],
                ];
            } catch (\Throwable $e) {
                Log::error('[checkout] razorpay order failed: '.$e->getMessage());
                OrderService::cancel($order->id, 'Cancelled — the payment gateway could not be reached', false);

                return response()->json(['message' => 'The payment service is unavailable right now. Please try again, or choose Cash on Delivery.'], 502);
            }
        }

        return response()->json($payload, 201);
    }

    /** Called by the browser after Razorpay's popup succeeds; the signature proves the payment is genuine. */
    public function verifyPayment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'number' => ['required', 'integer'], 'token' => ['required', 'string'],
            'razorpay_order_id' => ['required', 'string'], 'razorpay_payment_id' => ['required', 'string'],
            'razorpay_signature' => ['required', 'string'],
        ]);

        $order = DB::table('orders')->where('number', $data['number'])->first();
        if (! $order || ! hash_equals((string) $order->access_token, $data['token']) || $order->razorpay_order_id !== $data['razorpay_order_id']) {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        $expected = hash_hmac('sha256', $data['razorpay_order_id'].'|'.$data['razorpay_payment_id'], Secrets::razorpay()['key_secret']);
        if (! hash_equals($expected, $data['razorpay_signature'])) {
            DB::table('orders')->where('id', $order->id)->update(['payment_status' => 'failed']);
            OrderService::event($order->id, 'Online payment could not be verified');
            \App\Support\Notifier::orderEvent('payment_failed', $order, 'Payment could not be verified');

            return response()->json(['message' => 'We could not verify the payment.'], 422);
        }
        if ($order->payment_status !== 'paid') {
            OrderService::markPaid($order->id, $data['razorpay_payment_id'], 'Payment received online');
            OrderService::notify(DB::table('orders')->where('id', $order->id)->first());
        }

        return response()->json(['ok' => true, 'number' => (int) $order->number]);
    }

    /** Thank-you page data: needs the order's private token (guests) or the owner's login. */
    public function show(Request $request, int $number): JsonResponse
    {
        $order = DB::table('orders')->where('number', $number)->first();
        $customer = CustomerAuth::current($request);
        $token = (string) $request->query('token', '');
        $allowed = $order && (($token !== '' && hash_equals((string) $order->access_token, $token)) || ($customer && $order->customer_id === $customer->id));
        if (! $allowed) {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        return response()->json(OrderService::present($order));
    }
}
