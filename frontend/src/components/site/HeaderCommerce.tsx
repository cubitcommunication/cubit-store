import { Link } from "@tanstack/react-router";
import { Heart, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCommerce } from "@/lib/commerce";
import { useCustomer } from "@/lib/account";
import { useWishlist } from "@/lib/wishlist";

const iconButton =
  "relative flex size-9 items-center justify-center rounded-full text-foreground transition-colors sm:size-10 hover:bg-muted hover:text-brand-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red";

function Badge({ n }: { n: number }) {
  if (n < 1) return null;
  return (
    <span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-semibold leading-4 text-background">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Heart icon with the saved count. Appears only when the wishlist switch is on. */
export function HeaderWishlist() {
  const { wishlist } = useCommerce();
  const list = useWishlist();
  if (!wishlist) return null;
  return (
    <Link to="/wishlist" aria-label={`Wishlist, ${list.count} saved`} className={iconButton}>
      <Heart className="size-5" />
      <Badge n={list.count} />
    </Link>
  );
}

/** Customer account icon (sign in / my account). Appears only when customer accounts are switched on. */
export function HeaderAccount() {
  const { accounts } = useCommerce();
  const { customer } = useCustomer();
  if (!accounts) return null;
  return (
    <Link to={customer ? "/account" : "/login"} aria-label={customer ? "My account" : "Sign in"} className={`${iconButton} hidden sm:flex`}>
      <User className="size-5" />
    </Link>
  );
}

/** Cart icon with the item count; opens the mini-cart. Appears only when the cart switch is on. */
export function HeaderCart() {
  const { cart } = useCommerce();
  const { count, openDrawer } = useCart();
  if (!cart) return null;
  return (
    <button type="button" onClick={openDrawer} aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`} className={iconButton}>
      <ShoppingBag className="size-5" />
      <Badge n={count} />
    </button>
  );
}

/** Wishlist and account links inside the phone / tablet menu (the header has little room for them). */
export function MobileMenuCommerce({ onNavigate }: { onNavigate: () => void }) {
  const { wishlist, accounts } = useCommerce();
  const list = useWishlist();
  const { customer } = useCustomer();
  if (!wishlist && !accounts) return null;
  const row =
    "flex min-h-12 items-center justify-between gap-3 border-b border-border py-2 font-menu text-[0.875rem] font-semibold uppercase tracking-[0.08em] text-foreground transition-colors hover:text-brand-red";
  return (
    <div className="mx-auto mt-4 w-full max-w-md">
      {wishlist ? (
        <Link to="/wishlist" onClick={onNavigate} className={row}>
          <span className="flex items-center gap-3"><Heart className="size-4" strokeWidth={1.5} /> Wishlist</span>
          {list.count > 0 ? <span className="rounded-full bg-brand-red px-2 py-0.5 text-[11px] leading-4 text-background">{list.count}</span> : null}
        </Link>
      ) : null}
      {accounts ? (
        <Link to={customer ? "/account" : "/login"} onClick={onNavigate} className={row}>
          <span className="flex items-center gap-3"><User className="size-4" strokeWidth={1.5} /> {customer ? "My account" : "Sign in"}</span>
        </Link>
      ) : null}
    </div>
  );
}
