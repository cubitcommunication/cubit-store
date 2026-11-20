import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatPrice } from "@/config/brand";
import { accountApi, useCustomer } from "@/lib/account";
import { outlineButton } from "@/lib/commerce";
import { useWishlist } from "@/lib/wishlist";
import { formatDate, orderStatusLabel } from "@/components/site/OrderBits";

export const Route = createFileRoute("/account/")({
  component: Overview,
});

function Overview() {
  const { customer } = useCustomer();
  const list = useWishlist();
  const orders = useQuery({ queryKey: ["account", "orders"], queryFn: accountApi.orders });
  const addresses = useQuery({ queryKey: ["account", "addresses"], queryFn: accountApi.addresses });
  const recent = (orders.data?.orders ?? []).slice(0, 3);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-2xl">Hello, {customer?.name.split(" ")[0]}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{customer?.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Orders", value: orders.data?.orders.length ?? "–", to: "/account/orders" },
          { label: "Saved addresses", value: addresses.data?.addresses.length ?? "–", to: "/account/addresses" },
          { label: "Wishlist", value: list.count, to: "/wishlist" },
        ].map((c) => (
          <Link key={c.label} to={c.to} className="border border-border p-5 transition-colors hover:border-brand-red">
            <p className="font-display text-3xl">{c.value}</p>
            <p className="eyebrow mt-2 text-muted-foreground">{c.label}</p>
          </Link>
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">Recent orders</h3>
          <Link to="/account/orders" className="text-sm text-muted-foreground hover:text-brand-red">View all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">You haven't placed an order yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {recent.map((o) => (
              <li key={o.number}>
                <Link to="/account/orders/$number" params={{ number: String(o.number) }} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm hover:text-brand-red">
                  <span className="font-medium">#{o.number}</span>
                  <span className="text-muted-foreground">{formatDate(o.createdAt)}</span>
                  {orderStatusLabel(o)}
                  <span>{formatPrice(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to="/shop" className={`${outlineButton} mt-6`}>Continue shopping</Link>
      </section>
    </div>
  );
}
