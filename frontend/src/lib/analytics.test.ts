import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/config/brand";
import { item, money, track, trackOnce, trackPageView } from "./analytics";

type W = { dataLayer?: unknown[]; gtag?: unknown; fbq?: unknown; localStorage: Storage };
const w = () => globalThis.window as unknown as W;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    dataLayer: [],
    gtag: vi.fn(),
    fbq: vi.fn(),
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage,
  };
});

describe("shop events", () => {
  it("names items the way Google Analytics 4 expects", () => {
    expect(item({ id: "p1", sku: "AD-NK-002", name: "Mira Chain", price: 1299, qty: 2, variant: "Gold", category: "Necklaces" })).toEqual({
      item_id: "AD-NK-002", item_name: "Mira Chain", price: 1299, quantity: 2, item_brand: brand.name, item_category: "Necklaces", item_variant: "Gold",
    });
    expect(item({ id: "p1", name: "Ring", price: 499 }).item_id).toBe("p1");   // no SKU: falls back to the product id
    expect(money([item({ name: "a", price: 10.5, qty: 2 }), item({ name: "b", price: 3 })])).toBe(24);
  });

  it("sends ecommerce events to gtag, to the Tag Manager data layer (cleared first) and to Meta", () => {
    const items = [item({ sku: "S1", name: "Ring", price: 1000, qty: 2 })];
    track("add_to_cart", { currency: "INR", value: 2000, items });

    expect(w().gtag).toHaveBeenCalledWith("event", "add_to_cart", { currency: "INR", value: 2000, items });
    expect(w().dataLayer).toEqual([{ ecommerce: null }, { event: "add_to_cart", ecommerce: { currency: "INR", value: 2000, items } }]);
    expect(w().fbq).toHaveBeenCalledWith("track", "AddToCart", { value: 2000, currency: "INR", content_ids: ["S1"], content_type: "product", num_items: 2 });
  });

  it("sends other events flat, and only maps the ones Meta knows", () => {
    track("whatsapp_click", { location: "header" });
    expect(w().dataLayer).toEqual([{ event: "whatsapp_click", location: "header" }]);
    expect(w().fbq).not.toHaveBeenCalled();

    track("generate_lead", { method: "newsletter" });
    expect(w().fbq).toHaveBeenCalledWith("track", "Lead", {});
  });

  it("does nothing, and never throws, when no tool is installed", () => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: w().localStorage };
    expect(() => track("view_item", { items: [] })).not.toThrow();
    expect(() => trackPageView("/shop", "Shop")).not.toThrow();
  });

  it("reports a page change inside the app as virtual_page_view", () => {
    trackPageView("/shop", `Shop — ${brand.name}`);
    expect(w().dataLayer).toEqual([{ event: "virtual_page_view", page_path: "/shop", page_title: `Shop — ${brand.name}` }]);
    expect(w().fbq).toHaveBeenCalledWith("track", "PageView");
  });

  it("reports a purchase only once per order, even if the thank-you page is reloaded", () => {
    trackOnce("purchase_1001", "purchase", { transaction_id: "1001" });
    trackOnce("purchase_1001", "purchase", { transaction_id: "1001" });
    trackOnce("purchase_1002", "purchase", { transaction_id: "1002" });
    expect((w().gtag as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[2] as { transaction_id: string }).transaction_id)).toEqual(["1001", "1002"]);
  });
});

describe("tracking scripts", () => {
  it("are written by the server only (Admin → Integrations), never hard-coded in the HTML template", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    // A second copy here would count every visit twice and could not be switched off in the admin.
    for (const forbidden of ["googletagmanager", "gtag(", "clarity.ms", "fbq(", "dataLayer"]) expect(html, forbidden).not.toContain(forbidden);
    expect(html).toContain("<!--SHOP_HEAD-->");
  });
});
