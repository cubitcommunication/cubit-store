import { describe, expect, it } from "vitest";
import { matchesCollection, type Collection, type Product } from "./catalog";
import { normaliseCount, pickTabProducts } from "./home-content";

const product = (id: string, over: Partial<Product> = {}): Product => ({ id, featured: false, created_at: "2026-01-01T00:00:00Z", occasion: ["Bridal"], category: "Rings", material: "Brass", navratri_2026: false, diwali_2026: false, ...over }) as Product;
const collection = (over: Partial<Collection>): Collection => ({ id: "c", slug: "bridal", name: "Bridal", occasion_filter: "Bridal", product_ids: null, category_filter: null, material_filter: null, navratri_only: false, ...over }) as Collection;

describe("occasion tabs", () => {
  it("only 4, 8 or 12 products are possible, defaulting to 8", () => {
    expect([4, 8, 12].map(normaliseCount)).toEqual([4, 8, 12]);
    for (const bad of ["", "5", "100", "abc", undefined]) expect(normaliseCount(bad)).toBe(8);
  });

  it("shows featured pieces first, then the newest, and never more than the count", () => {
    const all = [
      product("old", { created_at: "2025-01-01T00:00:00Z" }),
      product("new", { created_at: "2026-06-01T00:00:00Z" }),
      product("star", { featured: true, created_at: "2024-01-01T00:00:00Z" }),
      product("other", { occasion: ["Party"] }),
    ];
    expect(pickTabProducts(all, collection({}), 8, matchesCollection).map((p) => p.id)).toEqual(["star", "new", "old"]);
    expect(pickTabProducts(all, collection({}), 2, matchesCollection).map((p) => p.id)).toEqual(["star", "new"]);
  });

  it("a Diwali-only collection takes every product marked Diwali 2026", () => {
    const c = collection({ occasion_filter: null, diwali_only: true });
    const all = [product("d", { diwali_2026: true }), product("n")];
    expect(pickTabProducts(all, c, 8, matchesCollection).map((p) => p.id)).toEqual(["d"]);
  });
});
