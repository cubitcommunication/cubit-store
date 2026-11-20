import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useCommerce } from "@/lib/commerce";
import { useCustomer } from "@/lib/account";

/**
 * Wishlist. Guests keep it in the browser; once signed in it is saved to the
 * account (the guest list is merged in on sign-in) and follows the customer
 * across devices.
 */
type WishlistValue = { ids: string[]; has: (id: string) => boolean; toggle: (id: string) => void; count: number };

const KEY = "shop_wishlist_v1";
const WishlistContext = createContext<WishlistValue | null>(null);

function load(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { wishlist } = useCommerce();
  const { customer } = useCustomer();
  const [ids, setIds] = useState<string[]>(load);
  const mergedFor = useRef<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }, [ids]);

  // On sign-in: merge the guest list into the account once, then use the account's list.
  useEffect(() => {
    if (!wishlist || !customer || mergedFor.current === customer.id) return;
    mergedFor.current = customer.id;
    void api<{ ids: string[] }>("/account/wishlist/merge", { method: "POST", body: { ids: load() } })
      .then((result) => setIds(result.ids))
      .catch(() => undefined);
  }, [wishlist, customer]);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [id, ...prev]));
      if (customer) {
        void api<{ ids: string[] }>("/account/wishlist/toggle", { method: "POST", body: { productId: id } })
          .then((result) => setIds(result.ids))
          .catch(() => undefined);
      }
    },
    [customer],
  );

  const value = useMemo<WishlistValue>(() => ({ ids, has: (id) => ids.includes(id), toggle, count: ids.length }), [ids, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return ctx;
}
