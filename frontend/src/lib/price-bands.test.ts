import { describe, expect, it } from "vitest";
import { bandById, priceBands } from "./catalog";

const shop = (prices: number[]) => prices.map((price) => ({ price }));

describe("price bands come from the shop's own prices", () => {
  it("a shop with few different prices gets no price filter", () => {
    expect(priceBands(shop([100, 100, 200, 300]))).toEqual([]);
    expect(priceBands([])).toEqual([]);
  });

  it("any price range gets four bands that cover everything without gaps", () => {
    for (const prices of [
      [199, 249, 299, 349, 399, 449, 499, 549, 599, 699, 799, 899],
      [1200, 1500, 1800, 2400, 3200, 4100, 5200, 6800, 8800, 11000, 15000, 19000],
      [5, 8, 9, 12, 14, 17, 19, 25, 31, 36, 44, 58],
    ]) {
      const bands = priceBands(shop(prices));
      expect(bands.length, prices.join()).toBeGreaterThanOrEqual(3);
      expect(bands[0]!.min).toBe(0);
      expect(bands.at(-1)!.max).toBe(Infinity);
      for (let i = 1; i < bands.length; i++) expect(bands[i]!.min, "no gap").toBe(bands[i - 1]!.max + 1);
      for (const p of prices) expect(bands.filter((b) => p >= b.min && p <= b.max), `price ${p} is in exactly one band`).toHaveLength(1);
    }
  });

  it("a band can be read back from its id, so a shared link keeps working", () => {
    const [first] = priceBands(shop([199, 249, 299, 349, 399, 449, 499, 549, 599, 699, 799, 899]));
    expect(bandById(first!.id)).toMatchObject({ min: first!.min, max: first!.max });
    expect(bandById("1800-plus")).toMatchObject({ min: 1800, max: Infinity });
    expect(bandById("nonsense")).toBeNull();
    expect(bandById(null)).toBeNull();
  });
});
