import { describe, expect, it } from "vitest";
import { matchesCollection, type Collection, type Product } from "./catalog";

const product = (over: Partial<Product>): Product => ({ id: "p1", category: "Necklaces", material: "Oxidised", occasion: ["Bridal", "Party"], navratri_2026: false, ...over }) as Product;
const collection = (over: Partial<Collection>): Collection => ({ id: "c1", name: "Wedding Season", category_filter: null, material_filter: null, occasion_filter: null, product_ids: null, navratri_only: false, ...over }) as Collection;

describe("collections picked by occasion or by hand", () => {
  it("a wedding collection filtered by the Bridal occasion takes every Bridal piece", () => {
    const c = collection({ occasion_filter: "Bridal" });
    expect(matchesCollection(product({}), c)).toBe(true);
    expect(matchesCollection(product({ id: "p2", occasion: ["Everyday"] }), c)).toBe(false);
  });

  it("filters combine: occasion AND category AND material", () => {
    const c = collection({ occasion_filter: "Bridal", category_filter: "Necklaces", material_filter: "Oxidised" });
    expect(matchesCollection(product({}), c)).toBe(true);
    expect(matchesCollection(product({ category: "Rings" }), c)).toBe(false);
    expect(matchesCollection(product({ material: "Brass" }), c)).toBe(false);
  });

  it("hand-picked products always belong, and alone they are the whole collection", () => {
    const handOnly = collection({ product_ids: ["p9"] });
    expect(matchesCollection(product({ id: "p9", occasion: [] }), handOnly)).toBe(true);
    expect(matchesCollection(product({ id: "p1" }), handOnly)).toBe(false);

    const both = collection({ occasion_filter: "Bridal", product_ids: ["p9"] });
    expect(matchesCollection(product({ id: "p9", occasion: [] }), both)).toBe(true);
    expect(matchesCollection(product({ id: "p1" }), both)).toBe(true);
  });

  it("a collection with no rules and no picks keeps showing everything, as before", () => {
    expect(matchesCollection(product({}), collection({}))).toBe(true);
  });
});
