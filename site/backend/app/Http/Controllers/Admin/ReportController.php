<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Sales reports for a date range (India time). Cancelled orders never count as sales; refunds are shown separately. */
class ReportController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['from' => ['nullable', 'date_format:Y-m-d'], 'to' => ['nullable', 'date_format:Y-m-d'], 'channel' => ['nullable', 'in:all,online,shop']]);
        // The online/shop split belongs to the paid offline-shop add-on: without it every order is online and nothing is split.
        $shopOn = \App\Support\Features::on(\App\Support\Features::OFFLINE_SHOP);
        $channel = $shopOn ? ($data['channel'] ?? 'all') : 'all';
        $tz = \App\Support\Brand::timezone();
        $to = Carbon::parse($data['to'] ?? Carbon::now($tz)->format('Y-m-d'), $tz)->endOfDay();
        $from = Carbon::parse($data['from'] ?? $to->copy()->subDays(29)->format('Y-m-d'), $tz)->startOfDay();
        if ($from->gt($to)) {
            [$from, $to] = [$to->copy()->startOfDay(), $from->copy()->endOfDay()];
        }
        if ($from->diffInDays($to) > 366) {
            $from = $to->copy()->subDays(366)->startOfDay();
        }
        $fmt = fn (Carbon $c) => $c->copy()->utc()->format('Y-m-d H:i:s');
        $orders = fn () => DB::table('orders')->where('status', '!=', 'cancelled')->where('created_at', '>=', $fmt($from))->where('created_at', '<=', $fmt($to))
            ->when($channel !== 'all', fn ($q) => $q->where('channel', $channel));
        // Online and shop side by side for the whole range, whatever the channel filter is.
        $channels = [];
        foreach ($shopOn ? ['online' => 'Online', 'shop' => 'Shop'] : [] as $key => $label) {
            $c = DB::table('orders')->where('status', '!=', 'cancelled')->where('channel', $key)->where('created_at', '>=', $fmt($from))->where('created_at', '<=', $fmt($to))
                ->selectRaw('COUNT(*) as orders, COALESCE(SUM(total),0) as revenue')->first();
            $channels[] = ['name' => $label, 'orders' => (int) $c->orders, 'revenue' => round((float) $c->revenue, 2)];
        }

        $sum = $orders()->selectRaw('COUNT(*) as orders, COALESCE(SUM(total),0) as revenue, COALESCE(SUM(discount_total),0) as discounts, COALESCE(SUM(shipping_total),0) as shipping, COALESCE(SUM(subtotal),0) as subtotal')->first();
        $units = (int) DB::table('order_items as i')->join('orders as o', 'o.id', '=', 'i.order_id')->where('o.status', '!=', 'cancelled')
            ->where('o.created_at', '>=', $fmt($from))->where('o.created_at', '<=', $fmt($to))->when($channel !== 'all', fn ($q) => $q->where('o.channel', $channel))->sum('i.quantity');
        $refunds = $orders()->where('payment_status', 'refunded')->selectRaw('COUNT(*) as n, COALESCE(SUM(total),0) as amount')->first();
        $cancelled = DB::table('orders')->where('status', 'cancelled')->where('created_at', '>=', $fmt($from))->where('created_at', '<=', $fmt($to))->count();
        $newCustomers = DB::table('customers')->where('created_at', '>=', $fmt($from))->where('created_at', '<=', $fmt($to))->count();
        $returns = DB::table('return_requests')->where('created_at', '>=', $fmt($from))->where('created_at', '<=', $fmt($to))->count();

        // One row per India-time day, including days with no sales.
        $perDay = [];
        foreach ($orders()->get(['created_at', 'total']) as $o) {
            $day = Carbon::parse($o->created_at, 'UTC')->setTimezone($tz)->format('Y-m-d');
            $perDay[$day]['orders'] = ($perDay[$day]['orders'] ?? 0) + 1;
            $perDay[$day]['revenue'] = ($perDay[$day]['revenue'] ?? 0) + (float) $o->total;
        }
        $days = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $k = $d->format('Y-m-d');
            $days[] = ['date' => $k, 'orders' => $perDay[$k]['orders'] ?? 0, 'revenue' => round($perDay[$k]['revenue'] ?? 0, 2)];
        }

        $lines = DB::table('order_items as i')->join('orders as o', 'o.id', '=', 'i.order_id')->leftJoin('products as p', 'p.id', '=', 'i.product_id')
            ->where('o.status', '!=', 'cancelled')->where('o.created_at', '>=', $fmt($from))->where('o.created_at', '<=', $fmt($to))
            ->when($channel !== 'all', fn ($q) => $q->where('o.channel', $channel));
        $products = (clone $lines)->groupBy('i.name')->orderByRaw('SUM(i.line_total) DESC')->limit(25)
            ->selectRaw('i.name as name, SUM(i.quantity) as qty, SUM(i.line_total) as revenue')->get()
            ->map(fn ($r) => ['name' => $r->name, 'qty' => (int) $r->qty, 'revenue' => round((float) $r->revenue, 2)])->all();
        $categories = (clone $lines)->groupBy('p.category')->orderByRaw('SUM(i.line_total) DESC')
            ->selectRaw('p.category as name, SUM(i.quantity) as qty, SUM(i.line_total) as revenue')->get()
            ->map(fn ($r) => ['name' => $r->name ?: 'Other', 'qty' => (int) $r->qty, 'revenue' => round((float) $r->revenue, 2)])->all();

        $customers = $orders()->where('email', '!=', '')->groupBy('email')->orderByRaw('SUM(total) DESC')->limit(15)
            ->selectRaw('MAX(name) as name, email, COUNT(*) as orders, SUM(total) as spent')->get()
            ->map(fn ($r) => ['name' => $r->name, 'email' => $r->email, 'orders' => (int) $r->orders, 'spent' => round((float) $r->spent, 2)])->all();

        $states = [];
        foreach ($orders()->where('channel', 'online')->get(['shipping_address', 'total']) as $o) {
            $state = trim((string) (json_decode((string) $o->shipping_address, true)['state'] ?? '')) ?: 'Unknown';
            $states[$state]['orders'] = ($states[$state]['orders'] ?? 0) + 1;
            $states[$state]['revenue'] = ($states[$state]['revenue'] ?? 0) + (float) $o->total;
        }
        uasort($states, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);
        $byState = [];
        foreach (array_slice($states, 0, 20, true) as $name => $v) {
            $byState[] = ['name' => $name, 'orders' => $v['orders'], 'revenue' => round($v['revenue'], 2)];
        }

        $payments = $orders()->groupBy('payment_method')->selectRaw('payment_method as name, COUNT(*) as orders, SUM(total) as revenue')->get()
            ->map(fn ($r) => ['name' => ['cod' => 'Cash on Delivery', 'razorpay' => 'Online payment', 'cash' => 'Shop: Cash', 'upi' => 'Shop: UPI', 'card' => 'Shop: Card'][$r->name] ?? ucfirst((string) $r->name), 'orders' => (int) $r->orders, 'revenue' => round((float) $r->revenue, 2)])->all();

        $count = (int) $sum->orders;

        return response()->json([
            'from' => $from->format('Y-m-d'), 'to' => $to->format('Y-m-d'),
            'summary' => [
                'orders' => $count, 'revenue' => round((float) $sum->revenue, 2), 'average' => $count ? round((float) $sum->revenue / $count, 2) : 0,
                'units' => $units, 'discounts' => round((float) $sum->discounts, 2), 'shipping' => round((float) $sum->shipping, 2),
                'refundedOrders' => (int) $refunds->n, 'refundedAmount' => round((float) $refunds->amount, 2),
                'cancelled' => $cancelled, 'newCustomers' => $newCustomers, 'returns' => $returns,
            ],
            'channel' => $channel, 'channels' => $channels, 'days' => $days, 'products' => $products, 'categories' => $categories, 'customers' => $customers, 'states' => $byState, 'payments' => $payments,
        ]);
    }
}
