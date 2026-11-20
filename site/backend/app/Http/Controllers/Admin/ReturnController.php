<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\OrderService;
use App\Support\Returns;
use App\Support\StockLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Return requests: approve or reject, mark the parcel received (optionally restocking) and record the refund. */
class ReturnController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $status = (string) $request->query('status', '');
        $q = DB::table('return_requests')->orderByDesc('created_at')->limit(300);
        if (in_array($status, Returns::STATUSES, true)) {
            $q->where('status', $status);
        }
        $counts = DB::table('return_requests')->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');

        return response()->json([
            'requests' => $q->get()->map(function ($r) {
                $order = DB::table('orders')->where('id', $r->order_id)->first(['total', 'payment_status', 'payment_method']);

                return Returns::present($r) + ['orderTotal' => $order ? (float) $order->total : 0, 'paymentStatus' => $order->payment_status ?? null, 'paymentMethod' => $order->payment_method ?? null];
            })->all(),
            'counts' => $counts,
            'enabled' => Returns::enabled(),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:approve,reject,received,refund,close'],
            'note' => ['nullable', 'string', 'max:500'],
            'restock' => ['nullable', 'boolean'],
            'amount' => ['nullable', 'numeric', 'min:0'],
        ]);
        $r = DB::table('return_requests')->where('id', $id)->first();
        if (! $r) {
            return response()->json(['message' => 'Return not found.'], 404);
        }
        $order = DB::table('orders')->where('id', $r->order_id)->first();
        $note = isset($data['note']) ? trim($data['note']) : '';
        $now = now()->utc()->format('Y-m-d H:i:s');
        $set = fn (array $f) => DB::table('return_requests')->where('id', $id)->update($f + ['updated_at' => $now] + ($note !== '' ? ['admin_note' => $note] : []));

        switch ($data['action']) {
            case 'approve':
                if ($r->status !== 'requested') {
                    return response()->json(['message' => 'Only a new request can be approved.'], 422);
                }
                $set(['status' => 'approved']);
                OrderService::event($r->order_id, 'Return approved'.($note !== '' ? ': '.$note : ''));
                break;
            case 'reject':
                if (! in_array($r->status, ['requested', 'approved'], true)) {
                    return response()->json(['message' => 'This return can no longer be rejected.'], 422);
                }
                $set(['status' => 'rejected']);
                OrderService::event($r->order_id, 'Return declined'.($note !== '' ? ': '.$note : ''));
                break;
            case 'received':
                if (! in_array($r->status, ['requested', 'approved'], true)) {
                    return response()->json(['message' => 'This return was already received or closed.'], 422);
                }
                $restocked = false;
                if (! empty($data['restock'])) {
                    foreach (json_decode((string) $r->items, true) ?: [] as $i) {
                        $row = DB::table('order_items')->where('id', $i['order_item_id'])->first();
                        if ($row) {
                            $restocked = StockLog::restock($row->product_id, $row->variant_id, (int) $i['qty'], 'return', $r->order_id, 'Return, order #'.$r->order_number) !== null || $restocked;
                        }
                    }
                }
                $set(['status' => 'received', 'restocked' => $restocked]);
                OrderService::event($r->order_id, 'Returned parcel received'.($restocked ? ' — stock put back' : ''));
                break;
            case 'refund':
                if (! in_array($r->status, ['approved', 'received'], true)) {
                    return response()->json(['message' => 'Approve the return (or mark it received) before refunding.'], 422);
                }
                if ($order->payment_status !== 'paid') {
                    return response()->json(['message' => 'This order has no payment to refund. Close the return instead.'], 422);
                }
                $amount = isset($data['amount']) && $data['amount'] > 0 ? (float) $data['amount'] : (float) $order->total;
                OrderService::refund($r->order_id, $amount, 'Refund for return');
                $set(['status' => 'refunded', 'refund_amount' => min($amount, (float) $order->total)]);
                break;
            case 'close':
                if (in_array($r->status, ['refunded', 'closed'], true)) {
                    return response()->json(['message' => 'This return is already finished.'], 422);
                }
                $set(['status' => 'closed']);
                OrderService::event($r->order_id, 'Return closed'.($note !== '' ? ': '.$note : ''));
                break;
        }

        return response()->json(['ok' => true]);
    }
}
