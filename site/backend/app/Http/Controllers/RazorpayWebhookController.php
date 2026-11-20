<?php

namespace App\Http\Controllers;

use App\Support\OrderService;
use App\Support\Secrets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Razorpay tells the server about payments directly (a "webhook"), so an order is marked paid even when the
 * customer's browser was closed before the confirmation reached us.
 *
 * Every call is checked with the webhook secret (RAZORPAY_WEBHOOK_SECRET in the server .env): anything not signed by
 * Razorpay is refused. All handling is idempotent: Razorpay may send the same event several times.
 *
 * Set up in the Razorpay dashboard: Settings -> Webhooks -> Add new webhook
 *   URL:    https://example.com/api/webhooks/razorpay
 *   Events: payment.captured, payment.failed, order.paid, refund.processed
 */
class RazorpayWebhookController extends Controller
{
    public const CACHE_KEY = 'razorpay_webhook_last_received';

    public function __invoke(Request $request): JsonResponse
    {
        $secret = Secrets::razorpay()['webhook_secret'];
        if ($secret === '') {
            // A non-2xx answer makes Razorpay show the problem and retry, so it is noticed.
            return response()->json(['message' => 'The webhook secret is not set on the server.'], 503);
        }

        $body = $request->getContent();
        $signature = (string) $request->header('X-Razorpay-Signature', '');
        if ($signature === '' || ! hash_equals(hash_hmac('sha256', $body, $secret), $signature)) {
            Log::warning('[razorpay-webhook] refused a call with a missing or wrong signature');

            return response()->json(['message' => 'Invalid signature.'], 400);
        }

        $event = json_decode($body, true);
        if (! is_array($event) || ! is_string($event['event'] ?? null)) {
            return response()->json(['message' => 'Unreadable event.'], 400);
        }

        Cache::put(self::CACHE_KEY, now()->utc()->format('Y-m-d\TH:i:s\Z'), now()->addDays(60));
        $payment = $event['payload']['payment']['entity'] ?? [];
        $razorpayOrderId = (string) ($payment['order_id'] ?? ($event['payload']['order']['entity']['id'] ?? ''));

        $notify = null;
        $outcome = DB::transaction(function () use ($event, $payment, $razorpayOrderId, &$notify) {
            $order = $razorpayOrderId !== '' ? DB::table('orders')->where('razorpay_order_id', $razorpayOrderId)->lockForUpdate()->first() : null;
            if (! $order) {
                return 'ignored: no matching order';
            }

            switch ($event['event']) {
                case 'payment.captured':
                case 'order.paid':
                    return $this->paid($order, $payment, $notify);
                case 'payment.failed':
                    return $this->failed($order, $payment);
                case 'refund.processed':
                    return $this->refunded($order, $payment);
                default:
                    return 'ignored: '.$event['event'];
            }
        });

        // The receipt e-mail goes out only when this call is what marked the order paid.
        if ($notify !== null) {
            OrderService::notify(DB::table('orders')->where('id', $notify)->first());
        }

        return response()->json(['ok' => true, 'result' => $outcome]);
    }

    private function paid(object $order, array $payment, ?string &$notify): string
    {
        if ($order->payment_status === 'paid') {
            return 'already paid';
        }
        $paymentId = isset($payment['id']) ? (string) $payment['id'] : null;
        $amount = (int) ($payment['amount'] ?? 0);
        $expected = (int) round(((float) $order->total) * 100);

        if ($amount !== $expected) {
            OrderService::event($order->id, 'Razorpay reports a payment of Rs '.number_format($amount / 100, 2).' but the order total is Rs '.number_format($expected / 100, 2).'. Check it in the Razorpay dashboard before shipping.'.($paymentId ? " (payment {$paymentId})" : ''));

            return 'amount mismatch';
        }
        if ($order->status === 'cancelled') {
            OrderService::event($order->id, 'Payment received for a cancelled order'.($paymentId ? " ({$paymentId})" : '').'. Refund it in the Razorpay dashboard.');

            return 'cancelled order';
        }

        OrderService::markPaid($order->id, $paymentId, 'Payment received online (confirmed by Razorpay)');
        $notify = $order->id;

        return 'marked paid';
    }

    private function failed(object $order, array $payment): string
    {
        // A failed attempt never undoes a payment that already succeeded (the customer may have retried).
        if ($order->payment_status === 'paid' || $order->payment_status === 'refunded') {
            return 'ignored: already settled';
        }
        $reason = trim((string) ($payment['error_description'] ?? ''));
        DB::table('orders')->where('id', $order->id)->update(['payment_status' => 'failed', 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
        OrderService::event($order->id, 'Online payment failed'.($reason !== '' ? ': '.$reason : '').'. The customer can try again from the thank-you page.');
        \App\Support\Notifier::orderEvent('payment_failed', $order, 'Payment failed', $reason);

        return 'marked failed';
    }

    private function refunded(object $order, array $payment): string
    {
        if ($order->payment_status === 'refunded') {
            return 'already refunded';
        }
        $paid = (int) ($payment['amount'] ?? 0);
        $back = (int) ($payment['amount_refunded'] ?? 0);

        if ($paid > 0 && $back >= $paid) {
            DB::table('orders')->where('id', $order->id)->update(['payment_status' => 'refunded', 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
            OrderService::event($order->id, 'Payment fully refunded (Rs '.number_format($back / 100, 2).') through Razorpay');
            \App\Support\Notifier::orderEvent('order_refunded', $order, 'Refund issued', 'through Razorpay');
            \App\Support\Mail\Mailer::send('order_refunded', $order->email, \App\Support\Mail\MailVars::order($order, ['refund_amount' => \App\Support\Mail\MailVars::money($back / 100)]), $order->id);

            return 'marked refunded';
        }
        OrderService::event($order->id, 'A partial refund of Rs '.number_format($back / 100, 2).' was made through Razorpay');

        return 'partial refund noted';
    }
}
