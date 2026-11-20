import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatPrice } from "@/config/brand";
import { accountApi } from "@/lib/account";
import { primaryButton } from "@/lib/commerce";
import { formatDate, orderStatusLabel, paymentLabel } from "@/components/site/OrderBits";
import { LoadingRows } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/account/orders/")({
  component: OrdersPage,
});

function OrdersPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["account", "orders"], queryFn: accountApi.orders });

  return (
    <div>
      <h2 className="font-display text-2xl">Orders</h2>
      {isPending ? (
        <LoadingRows variant="store" />
      ) : isError ? (
        <p className="mt-6 text-brand-red">We couldn't load your orders. Please refresh.</p>
      ) : data.orders.length === 0 ? (
        <div className="mt-6">
          <p className="text-muted-foreground">No orders yet.</p>
          <Link to="/shop" className={`${primaryButton} mt-4`}>Start shopping</Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="eyebrow border-b border-border text-muted-foreground">
                <th className="py-3 pr-4 font-normal">Order</th>
                <th className="py-3 pr-4 font-normal">Date</th>
                <th className="py-3 pr-4 font-normal">Payment</th>
                <th className="py-3 pr-4 font-normal">Status</th>
                <th className="py-3 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.orders.map((o) => (
                <tr key={o.number}>
                  <td className="py-4 pr-4">
                    <Link to="/account/orders/$number" params={{ number: String(o.number) }} className="font-medium underline-offset-4 hover:text-brand-red hover:underline">#{o.number}</Link>
                  </td>
                  <td className="py-4 pr-4 text-muted-foreground">{formatDate(o.createdAt)}</td>
                  <td className="py-4 pr-4">{paymentLabel(o)}</td>
                  <td className="py-4 pr-4">{orderStatusLabel(o)}</td>
                  <td className="py-4 text-right">{formatPrice(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
