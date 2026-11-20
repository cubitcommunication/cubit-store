<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/** Numbers for the admin Home screen. "Today" follows India time; cancelled orders never count as sales. */
class DashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $tz = \App\Support\Brand::timezone();
        $startOfToday = Carbon::now($tz)->startOfDay()->utc();
        $fmt = fn (Carbon $c) => $c->format('Y-m-d H:i:s');

        $sales = function (Carbon $from) use ($fmt) {
            $row = DB::table('orders')->where('status', '!=', 'cancelled')->where('created_at', '>=', $fmt($from))
                ->selectRaw('COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue')->first();

            return ['orders' => (int) $row->orders, 'revenue' => (float) $row->revenue];
        };

        $days = [];
        for ($i = 13; $i >= 0; $i--) {
            $from = $startOfToday->copy()->subDays($i);
            $row = DB::table('orders')->where('status', '!=', 'cancelled')
                ->where('created_at', '>=', $fmt($from))->where('created_at', '<', $fmt($from->copy()->addDay()))
                ->selectRaw('COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue')->first();
            $days[] = ['date' => $from->copy()->setTimezone($tz)->format('Y-m-d'), 'orders' => (int) $row->orders, 'revenue' => (float) $row->revenue];
        }

        $top = DB::table('order_items as i')->join('orders as o', 'o.id', '=', 'i.order_id')
            ->where('o.status', '!=', 'cancelled')->where('o.created_at', '>=', $fmt($startOfToday->copy()->subDays(29)))
            ->groupBy('i.name')->orderByRaw('SUM(i.quantity) DESC')->limit(5)
            ->selectRaw('i.name as name, SUM(i.quantity) as qty, SUM(i.line_total) as revenue')->get()
            ->map(fn ($r) => ['name' => $r->name, 'qty' => (int) $r->qty, 'revenue' => (float) $r->revenue])->all();

        $lowStock = DB::table('products')->whereNotNull('stock_quantity')->where('stock_quantity', '<=', 3)
            ->where('published', 1)->whereNull('archived_at')->orderBy('stock_quantity')->limit(8)
            ->get(['id', 'name', 'slug', 'stock_quantity'])->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'stock' => (int) $p->stock_quantity])->all();

        return response()->json([
            'today' => $sales($startOfToday),
            'week' => $sales($startOfToday->copy()->subDays(6)),
            'month' => $sales($startOfToday->copy()->subDays(29)),
            'unfulfilled' => DB::table('orders')->where('status', 'open')->where('fulfillment_status', 'unfulfilled')->count(),
            'paymentPending' => DB::table('orders')->where('status', 'open')->where('payment_status', 'pending')->count(),
            'customers' => DB::table('customers')->count(),
            'days' => $days,
            'topProducts' => $top,
            'lowStock' => $lowStock,
        ]);
    }
}
