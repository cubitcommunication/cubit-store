<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Mail\Mailer;
use App\Support\Mail\MailVars;
use App\Support\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Changing an order's state. Every change lands on the order timeline. */
class OrderController extends Controller
{
    /** The tracking columns to save, from what the admin typed (blank = leave the stored value alone when the field is absent). @return array<string, ?string> */
    private function trackingFields(array $data): array
    {
        $out = [];
        foreach (['tracking_id' => 'awb_code', 'tracking_url' => 'tracking_url', 'courier' => 'courier_name'] as $in => $column) {
            if (array_key_exists($in, $data)) {
                $v = trim((string) ($data[$in] ?? ''));
                $out[$column] = $v !== '' ? $v : null;
            }
        }

        return $out;
    }

    private function trackingText(array $tracking): string
    {
        $bits = array_filter([
            ! empty($tracking['courier_name']) ? 'courier '.$tracking['courier_name'] : null,
            ! empty($tracking['awb_code']) ? 'tracking ID '.$tracking['awb_code'] : null,
            ! empty($tracking['tracking_url']) ? 'link '.$tracking['tracking_url'] : null,
        ]);

        return $bits ? ' ('.implode(', ', $bits).')' : '';
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:mark_paid,mark_unpaid,fulfil,unfulfil,cancel,refund,note,edit_details,set_tracking,resend_email'],
            // Tracking details entered by hand (when a courier other than Shiprocket is used).
            'tracking_id' => ['nullable', 'string', 'max:60', 'regex:/^[A-Za-z0-9][A-Za-z0-9 _\/.\-]*$/'],
            'tracking_url' => ['nullable', 'string', 'max:500', "regex:/^https?:\\/\\/[^\\s<>\"']+$/i"],
            'courier' => ['nullable', 'string', 'max:120'],
            'notify' => ['nullable', 'boolean'],
            'template' => ['required_if:action,resend_email', 'in:order_placed,payment_received,order_shipped,order_cancelled,order_refunded'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
            'contact.name' => ['required_if:action,edit_details', 'string', 'max:120'],
            'contact.email' => ['required_if:action,edit_details', 'email', 'max:160'],
            'contact.phone' => ['required_if:action,edit_details', 'regex:/^[0-9+\-\s]{10,15}$/'],
            'address.name' => ['required_if:action,edit_details', 'string', 'max:120'],
            'address.phone' => ['required_if:action,edit_details', 'regex:/^[0-9+\-\s]{10,15}$/'],
            'address.line1' => ['required_if:action,edit_details', 'string', 'max:200'],
            'address.line2' => ['nullable', 'string', 'max:200'],
            'address.city' => ['required_if:action,edit_details', 'string', 'max:120'],
            'address.state' => ['required_if:action,edit_details', 'string', 'max:120'],
            'address.pincode' => ['required_if:action,edit_details', 'regex:/^[1-9][0-9]{5}$/'],
        ], ['tracking_id.regex' => 'The tracking ID may contain only letters, numbers, spaces and - _ / .', 'tracking_url.regex' => 'The tracking link must start with http:// or https:// and have no spaces.', 'address.pincode.regex' => 'Please enter a valid 6-digit PIN code.', 'contact.phone.regex' => 'Please enter a valid phone number.', 'address.phone.regex' => 'Please enter a valid phone number.']);
        $order = DB::table('orders')->where('id', $id)->first();
        if (! $order) {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        $now = now()->utc()->format('Y-m-d H:i:s');
        $touch = fn (array $fields) => DB::table('orders')->where('id', $id)->update($fields + ['updated_at' => $now]);

        if ($order->status === 'cancelled' && ! in_array($data['action'], ['note', 'refund', 'resend_email'], true)) {
            return response()->json(['message' => 'This order is cancelled.'], 422);
        }

        switch ($data['action']) {
            case 'mark_paid':
                $wasPaid = $order->payment_status === 'paid';
                OrderService::markPaid($id);
                if (! $wasPaid) {
                    OrderService::notifyPayment($id);
                }
                break;
            case 'mark_unpaid':
                $touch(['payment_status' => 'pending']);
                OrderService::event($id, 'Marked as payment pending');
                break;
            case 'fulfil':
                // Tracking details typed in before pressing "Mark as fulfilled" go on the order first, so the e-mail carries them.
                $tracking = $this->trackingFields($data);
                $touch(['fulfillment_status' => 'fulfilled', 'fulfilled_at' => $order->fulfilled_at ?? $now] + $tracking);
                OrderService::event($id, 'Marked as fulfilled (shipped)'.$this->trackingText($tracking));
                if ($order->fulfillment_status !== 'fulfilled') {
                    OrderService::notifyShipped($id);
                }
                break;
            case 'set_tracking':
                $tracking = $this->trackingFields($data);
                if (($tracking['awb_code'] ?? null) === null && ($tracking['tracking_url'] ?? null) === null) {
                    return response()->json(['message' => 'Enter a tracking ID or a tracking link.'], 422);
                }
                $touch($tracking);
                OrderService::event($id, 'Tracking updated'.$this->trackingText($tracking));
                // Optionally tell the customer again, now that the parcel can be followed.
                if (! empty($data['notify']) && $order->fulfillment_status === 'fulfilled') {
                    OrderService::notifyShipped($id);
                    OrderService::event($id, 'Tracking details e-mailed to the customer');
                }
                break;
            case 'unfulfil':
                $touch(['fulfillment_status' => 'unfulfilled']);
                OrderService::event($id, 'Marked as unfulfilled');
                break;
            case 'cancel':
                OrderService::cancel($id, 'Order cancelled by the store — stock returned');
                // The courier booking is cancelled too (best effort); a failure is written on the order so it is not forgotten.
                if ($order->shiprocket_order_id) {
                    try {
                        \App\Support\Shiprocket::cancel($order->shiprocket_order_id);
                        OrderService::event($id, 'Shiprocket shipment cancelled as well');
                    } catch (\Throwable $e) {
                        OrderService::event($id, 'Could not cancel the Shiprocket shipment automatically: '.$e->getMessage().' Please cancel it in Shiprocket.');
                    }
                }
                break;
            case 'refund':
                if ($order->payment_status !== 'paid') {
                    return response()->json(['message' => 'Only a paid order can be refunded.'], 422);
                }
                OrderService::refund($id, isset($data['amount']) ? (float) $data['amount'] : null, 'Refund recorded by the store');
                break;
            case 'edit_details':
                $address = $data['address'] + ['line2' => null, 'country' => 'India'];
                $touch([
                    'name' => trim($data['contact']['name']), 'email' => strtolower(trim($data['contact']['email'])), 'phone' => trim($data['contact']['phone']),
                    'shipping_address' => json_encode($address, JSON_UNESCAPED_UNICODE),
                ]);
                OrderService::event($id, 'Customer details and shipping address edited by the store');
                break;
            case 'resend_email':
                return $this->resendEmail($order, (string) $data['template']);
            case 'note':
                if (trim((string) ($data['note'] ?? '')) === '') {
                    return response()->json(['message' => 'Please write a note.'], 422);
                }
                OrderService::event($id, 'Note: '.trim($data['note']));
                break;
        }

        return response()->json(['ok' => true]);
    }

    /** Sends one of the customer's order e-mails again (only if it fits the order's current status). */
    private function resendEmail(object $order, string $template): JsonResponse
    {
        $labels = ['order_placed' => 'Order confirmation', 'payment_received' => 'Payment received', 'order_shipped' => 'Order shipped', 'order_cancelled' => 'Order cancelled', 'order_refunded' => 'Refund'];
        $fits = match ($template) {
            'order_placed' => true,
            'payment_received' => $order->payment_status === 'paid',
            'order_shipped' => $order->fulfillment_status === 'fulfilled' && $order->status !== 'cancelled',
            'order_cancelled' => $order->status === 'cancelled',
            'order_refunded' => $order->payment_status === 'refunded',
        };
        if (! $fits) {
            return response()->json(['message' => 'The "'.$labels[$template].'" e-mail does not fit the status of this order.'], 422);
        }
        $extra = [];
        $events = DB::table('order_events')->where('order_id', $order->id)->orderByDesc('created_at')->pluck('message');
        if ($template === 'order_refunded') {
            $pattern = '/\(Rs ([\d,.]+)\)\s*$/';
            $line = $events->first(fn ($m) => preg_match($pattern, $m) === 1);
            preg_match($pattern, (string) $line, $m);
            $extra['refund_amount'] = MailVars::money((float) str_replace(',', '', $m[1] ?? $order->total));
        }
        if ($template === 'order_cancelled') {
            $extra['cancel_reason'] = (string) ($events->first(fn ($m) => str_starts_with($m, 'Order cancelled') || str_starts_with($m, 'Cancelled')) ?? 'Order cancelled');
        }
        $sent = Mailer::send($template, $order->email, MailVars::order($order, $extra), $order->id, true);
        if (! $sent) {
            return response()->json(['message' => 'The e-mail could not be sent. Check Emails → Mail servers (a mail account must be set up and working).'], 422);
        }
        OrderService::event($order->id, 'E-mail sent again to the customer: '.$labels[$template]);

        return response()->json(['ok' => true]);
    }
}
