import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { item as analyticsItem, money, track } from "@/lib/analytics";
import type { Quote } from "@/lib/commerce";
import { lineKey, useCommerce } from "@/lib/commerce";
import { variantPrice, type Variant } from "@/lib/variants";
import type { Product } from "@/lib/catalog";
import { primaryImage } from "@/lib/catalog";

/**
 * The shopping cart lives in the visitor's browser (localStorage) and holds only
 * product ids, quantities and a display snapshot. Prices, stock and totals are
 * always re-read from the server (/api/cart/quote) and again at checkout, so
 * nothing stored here can change what a customer is charged.
 */
export type CartItem = {
  /** Product id. The variant (if any) is in variantId; `key` is unique per line. */
  id: string;
  variantId: string | null;
  variantTitle: string | null;
  key: string;
  qty: number;
  name: string;
  price: number;
  image: string | null;
  slug: string;
  /** Stock code, used to name the product in Analytics. */
  sku: string;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  add: (product: Product, qty?: number, variant?: Variant | null) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  /** Replaces the cart with the given lines (used by the abandoned-cart recovery link). */
  restore: (lines: Omit<CartItem, "key">[]) => void;
  /** The discount code the shopper entered ('' = none). The server decides what it is worth. */
  coupon: string;
  setCoupon: (code: string) => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const KEY = "shop_cart_v1";
const COUPON_KEY = "shop_coupon_v1";
const CartContext = createContext<CartContextValue | null>(null);

function load(): CartItem[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i) => i && typeof i.id === "string" && Number.isFinite(Number(i.qty)))
      .map((i) => {
        const variantId = typeof i.variantId === "string" ? i.variantId : null;
        return { id: i.id, variantId, variantTitle: typeof i.variantTitle === "string" ? i.variantTitle : null, key: lineKey(i.id, variantId), qty: Math.max(1, Math.trunc(Number(i.qty))), name: String(i.name ?? ""), price: Number(i.price) || 0, image: i.image ?? null, slug: String(i.slug ?? ""), sku: typeof i.sku === "string" ? i.sku : "" };
      });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { maxQty } = useCommerce();
  const [items, setItems] = useState<CartItem[]>(load);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [coupon, setCouponState] = useState<string>(() => {
    try {
      return window.localStorage.getItem(COUPON_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const setCoupon = useCallback((code: string) => {
    const clean = code.replace(/\s+/g, "").toUpperCase().slice(0, 60);
    setCouponState(clean);
    try {
      if (clean) window.localStorage.setItem(COUPON_KEY, clean);
      else window.localStorage.removeItem(COUPON_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* private mode: the cart just won't survive a reload */
    }
  }, [items]);

  // Keep several tabs in step.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setItems(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback(
    (product: Product, qty = 1, variant?: Variant | null) => {
      const variantId = variant?.id ?? null;
      const key = lineKey(product.id, variantId);
      {
        const reported = analyticsItem({ id: product.id, sku: variant?.sku || product.sku, name: product.name, price: variantPrice(product, variant), qty, variant: variant?.title ?? null, category: product.category });
        track("add_to_cart", { currency: "INR", value: money([reported]), items: [reported] });
      }
      setItems((prev) => {
        const existing = prev.find((i) => i.key === key);
        if (existing) {
          return prev.map((i) => (i.key === key ? { ...i, qty: Math.min(maxQty, i.qty + qty) } : i));
        }
        return [
          ...prev,
          {
            id: product.id, variantId, variantTitle: variant?.title ?? null, key, qty: Math.min(maxQty, qty), name: product.name,
            price: variantPrice(product, variant), image: variant?.image_url ?? primaryImage(product)?.image_url ?? null, slug: product.slug,
            sku: variant?.sku || product.sku,
          },
        ];
      });
      setDrawerOpen(true);
    },
    [maxQty],
  );

  const setQty = useCallback(
    (key: string, qty: number) =>
      setItems((prev) =>
        qty < 1 ? prev.filter((i) => i.key !== key) : prev.map((i) => (i.key === key ? { ...i, qty: Math.min(maxQty, Math.trunc(qty)) } : i)),
      ),
    [maxQty],
  );
  const remove = useCallback((key: string) => {
    const gone = itemsRef.current.find((i) => i.key === key);
    if (gone) {
      const reported = analyticsItem({ id: gone.id, sku: gone.sku, name: gone.name, price: gone.price, qty: gone.qty, variant: gone.variantTitle });
      track("remove_from_cart", { currency: "INR", value: money([reported]), items: [reported] });
    }
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);
  const clear = useCallback(() => {
    setItems([]);
    setCoupon("");
  }, [setCoupon]);
  const restore = useCallback(
    (lines: Omit<CartItem, "key">[]) =>
      setItems(
        lines
          .filter((l) => l && typeof l.id === "string" && Number(l.qty) > 0)
          .slice(0, 50)
          .map((l) => ({ ...l, key: lineKey(l.id, l.variantId ?? null), qty: Math.min(maxQty, Math.max(1, Math.trunc(Number(l.qty)))) })),
      ),
    [maxQty],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((sum, i) => sum + i.qty, 0),
      add,
      setQty,
      remove,
      clear,
      restore,
      coupon,
      setCoupon,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [items, add, setQty, remove, clear, restore, coupon, setCoupon, drawerOpen],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <RecoveryLink restore={restore} openDrawer={() => setDrawerOpen(true)} />
    </CartContext.Provider>
  );
}

/**
 * A reminder e-mail links to /cart?recover=<token>. The basket saved on the server is put back into this browser's cart
 * (prices are still re-read from the server), and the address is cleaned so a refresh does not repeat it.
 */
function RecoveryLink({ restore }: { restore: (lines: Omit<CartItem, "key">[]) => void; openDrawer: () => void }) {
  useEffect(() => {
    let token = "";
    try {
      token = new URLSearchParams(window.location.search).get("recover") ?? "";
    } catch {
      return;
    }
    if (!/^[a-f0-9]{32}$/.test(token)) return;
    let cancelled = false;
    api<{ items: Omit<CartItem, "key">[] }>(`/cart/recover/${token}`)
      .then((r) => {
        if (cancelled || !Array.isArray(r.items) || !r.items.length) return;
        restore(r.items.map((i) => ({ id: i.id, variantId: i.variantId ?? null, variantTitle: i.variantTitle ?? null, qty: i.qty, name: i.name, price: i.price, image: i.image ?? null, slug: i.slug, sku: i.sku ?? "" })));
      })
      .catch(() => undefined)
      .finally(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("recover");
          window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
        } catch {
          /* ignore */
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/** Authoritative prices, stock and totals for the current cart, from the server. */
export function useCartQuote(items: CartItem[], paymentMethod: "cod" | "razorpay" = "cod", state = "") {
  const { cart } = useCommerce();
  const { coupon } = useCart();
  const signature = items.map((i) => `${i.key}:${i.qty}`).join(",");
  return useQuery({
    queryKey: ["cart-quote", signature, paymentMethod, coupon, state],
    enabled: cart && items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: () =>
      api<Quote>("/cart/quote", { method: "POST", body: { items: items.map((i) => ({ id: i.id, variant: i.variantId, qty: i.qty })), paymentMethod, coupon: coupon || null, state: state || null } }),
  });
}
