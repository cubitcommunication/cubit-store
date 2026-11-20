<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Customer returns. Switched on in Admin -> Store features -> Returns (off by default). A customer can ask to return pieces
 * from a shipped order within the allowed number of days; the store approves or rejects, marks the parcel received (optionally
 * putting the stock back) and records the refund. Everything is written to the order timeline.
 */
final class Returns
{
    public const REASONS = [
        'damaged' => 'Arrived damaged',
        'wrong_item' => 'Received the wrong item',
        'not_as_described' => 'Not as described',
        'size_fit' => 'Size or fit problem',
        'changed_mind' => 'Changed my mind',
        'other' => 'Other',
    ];

    public const STATUSES = ['requested', 'approved', 'rejected', 'received', 'refunded', 'closed'];

    public static function enabled(): bool
    {
        return Commerce::on('commerce_returns_enabled');
    }

    public static function days(): int
    {
        return max(1, min(90, (int) Commerce::number('commerce_return_days') ?: 7));
    }

    /** Pieces of an order that are already part of a return that was not rejected or closed. @return array<string,int> order_item_id => qty */
    public static function claimed(string $orderId): array
    {
        $claimed = [];
        foreach (DB::table('return_requests')->where('order_id', $orderId)->whereNotIn('status', ['rejected', 'closed'])->get(['items']) as $r) {
            foreach (json_decode((string) $r->items, true) ?: [] as $i) {
                $claimed[$i['order_item_id']] = ($claimed[$i['order_item_id']] ?? 0) + (int) $i['qty'];
            }
        }

        return $claimed;
    }

    /** @return array{ok: bool, message: ?string} whether the customer can ask for a return on this order right now */
    public static function eligibility(object $order): array
    {
        if (! self::enabled()) {
            return ['ok' => false, 'message' => 'Returns are not available online. Please contact us.'];
        }
        if ($order->status === 'cancelled') {
            return ['ok' => false, 'message' => 'This order was cancelled.'];
        }
        if ($order->fulfillment_status !== 'fulfilled') {
            return ['ok' => false, 'message' => 'You can ask for a return once the order has shipped.'];
        }
        $since = \Carbon\Carbon::parse($order->fulfilled_at ?? $order->updated_at, 'UTC');
        if ($since->copy()->addDays(self::days())->isPast()) {
            return ['ok' => false, 'message' => 'The '.self::days().'-day return window for this order has ended.'];
        }
        $left = false;
        $claimed = self::claimed($order->id);
        foreach (DB::table('order_items')->where('order_id', $order->id)->get(['id', 'quantity']) as $i) {
            if ($i->quantity - ($claimed[$i->id] ?? 0) > 0) {
                $left = true;
            }
        }

        return $left ? ['ok' => true, 'message' => null] : ['ok' => false, 'message' => 'Everything on this order is already part of a return.'];
    }

    public static function present(object $r): array
    {
        return [
            'id' => $r->id, 'orderId' => $r->order_id, 'orderNumber' => (int) $r->order_number, 'name' => $r->name, 'email' => $r->email,
            'status' => $r->status, 'reason' => $r->reason, 'reasonLabel' => self::REASONS[$r->reason] ?? $r->reason, 'details' => $r->details,
            'items' => json_decode((string) $r->items, true) ?: [], 'adminNote' => $r->admin_note,
            'refundAmount' => $r->refund_amount !== null ? (float) $r->refund_amount : null, 'restocked' => (bool) $r->restocked,
            'createdAt' => \Carbon\Carbon::parse($r->created_at, 'UTC')->format('Y-m-d\TH:i:s\Z'),
        ];
    }

    /** What an order page needs: can the customer ask now, and the requests already made. */
    public static function forOrder(object $order): array
    {
        $e = self::eligibility($order);
        $mine = DB::table('return_requests')->where('order_id', $order->id)->orderByDesc('created_at')->get()->map(fn ($r) => self::present($r))->all();
        $claimed = self::claimed($order->id);
        $items = [];
        if ($e['ok']) {
            foreach (DB::table('order_items')->where('order_id', $order->id)->orderBy('created_at')->get() as $i) {
                $left = (int) $i->quantity - ($claimed[$i->id] ?? 0);
                if ($left > 0) {
                    $items[] = ['id' => $i->id, 'name' => $i->name.($i->variant_title ? ' ('.$i->variant_title.')' : ''), 'max' => $left];
                }
            }
        }

        return [
            'enabled' => self::enabled(), 'canRequest' => $e['ok'], 'message' => $e['message'], 'days' => self::days(),
            'reasons' => self::REASONS, 'items' => $items, 'requests' => $mine,
        ];
    }

    /**
     * @param  array<int, array{id: string, qty: int}>  $wanted
     * @return array{request: ?object, error: ?string}
     */
    public static function create(object $order, array $wanted, string $reason, ?string $details): array
    {
        $e = self::eligibility($order);
        if (! $e['ok']) {
            return ['request' => null, 'error' => $e['message']];
        }
        $claimed = self::claimed($order->id);
        $rows = DB::table('order_items')->where('order_id', $order->id)->get()->keyBy('id');
        $items = [];
        foreach ($wanted as $w) {
            $row = $rows->get($w['id']);
            $qty = (int) $w['qty'];
            if (! $row || $qty < 1) {
                continue;
            }
            if ($qty > (int) $row->quantity - ($claimed[$row->id] ?? 0)) {
                return ['request' => null, 'error' => 'You asked to return more of "'.$row->name.'" than is left on the order.'];
            }
            $items[] = ['order_item_id' => $row->id, 'name' => $row->name.($row->variant_title ? ' ('.$row->variant_title.')' : ''), 'qty' => $qty];
        }
        if (! $items) {
            return ['request' => null, 'error' => 'Choose at least one piece to return.'];
        }

        $id = (string) Str::uuid();
        DB::table('return_requests')->insert([
            'id' => $id, 'order_id' => $order->id, 'order_number' => $order->number, 'customer_id' => $order->customer_id, 'name' => $order->name, 'email' => $order->email,
            'status' => 'requested', 'reason' => $reason, 'details' => $details, 'items' => json_encode($items, JSON_UNESCAPED_UNICODE),
        ]);
        OrderService::event($order->id, 'Return requested: '.implode(', ', array_map(fn ($i) => $i['qty'].' x '.$i['name'], $items)).' ('.(self::REASONS[$reason] ?? $reason).')');
        Notifier::send('return_requested', 'Return requested #'.$order->number, $order->name.' · '.(self::REASONS[$reason] ?? $reason), '/admin/returns', 'return:'.$id);

        return ['request' => DB::table('return_requests')->where('id', $id)->first(), 'error' => null];
    }
}
