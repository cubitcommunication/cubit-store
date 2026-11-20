import { brand } from "@/config/brand";
import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { accountApi, useCustomer } from "@/lib/account";
import { useCommerce, primaryButton } from "@/lib/commerce";
import { StorePage } from "@/components/site/OrderBits";
import { LoadingRows } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: `My account — ${brand.name}` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AccountLayout,
});

const links = [
  { to: "/account", label: "Overview", exact: true },
  { to: "/account/orders", label: "Orders", exact: false },
  { to: "/account/addresses", label: "Addresses", exact: false },
  { to: "/account/profile", label: "Profile & password", exact: false },
  { to: "/wishlist", label: "Wishlist", exact: false },
] as const;

function AccountLayout() {
  const { accounts } = useCommerce();
  const { customer, loading } = useCustomer();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (accounts && !loading && !customer) {
      router.history.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [accounts, loading, customer, router]);

  if (!accounts) {
    return (
      <StorePage title="My account" narrow>
        <p className="text-muted-foreground">Customer accounts aren't available right now.</p>
        <Link to="/shop" className={`${primaryButton} mt-6`}>Browse products</Link>
      </StorePage>
    );
  }
  if (loading || !customer) {
    return (
      <StorePage title="My account">
        <LoadingRows variant="store" />
      </StorePage>
    );
  }

  async function signOut() {
    await accountApi.signOut();
    await qc.invalidateQueries();
    router.history.push("/");
  }

  return (
    <StorePage title="My account">
      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Account" className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-0 lg:border-y lg:border-border">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.exact }}
              className="eyebrow whitespace-nowrap border border-border px-4 py-3 text-muted-foreground hover:text-brand-red lg:border-0 lg:border-b lg:last:border-b-0 [&.active]:bg-foreground [&.active]:text-background"
            >
              {l.label}
            </Link>
          ))}
          <button type="button" onClick={() => void signOut()} className="eyebrow whitespace-nowrap border border-border px-4 py-3 text-left text-muted-foreground hover:text-brand-red lg:border-0">
            Sign out
          </button>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </StorePage>
  );
}
