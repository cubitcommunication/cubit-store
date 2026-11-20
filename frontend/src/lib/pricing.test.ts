import { describe, expect, it } from "vitest";
import type { Product } from "./catalog";
import { percentOff, saleInfo } from "./pricing";
import type { Variant } from "./variants";

const product = (over: Partial<Product> = {}): Product => ({ id: "p", price: 1000, compare_at_price: null, ...over }) as Product;

describe("discount percentage", () => {
  it("rounds to a whole number and only exists when the MRP is really higher", () => {
    expect(percentOff(1000, 1600)).toBe(38);
    expect(percentOff(799, 1299)).toBe(38);
    expect(percentOff(1000, 1100)).toBe(9);
    expect(percentOff(1000, 1000)).toBeNull();     // same price: no discount
    expect(percentOff(1000, 900)).toBeNull();      // MRP below the sale price: ignored
    expect(percentOff(1000, null)).toBeNull();
    expect(percentOff(1000, 1003)).toBeNull();     // under 1%: not worth a badge
  });
});

describe("sale info", () => {
  it("uses the product's sale price and MRP", () => {
    expect(saleInfo(product({ compare_at_price: 1600 }))).toEqual({ unit: 1000, mrp: 1600, percent: 38, saving: 600, onSale: true });
  });

  it("has no sale without a real MRP", () => {
    expect(saleInfo(product())).toMatchObject({ mrp: null, percent: null, saving: null, onSale: false });
    expect(saleInfo(product({ compare_at_price: 500 }))).toMatchObject({ mrp: null, onSale: false });
  });

  it("prefers the chosen option's own price and MRP", () => {
    const v = { id: "v", price: 1200, compare_at_price: 2000 } as Variant;
    expect(saleInfo(product({ compare_at_price: 1600 }), v)).toMatchObject({ unit: 1200, mrp: 2000, percent: 40, saving: 800 });
  });
});
