import { describe, expect, it } from "vitest";
import { GRID_CLASS, hiddenClass, parseGrid, parseTiles } from "@/lib/category-tiles";

const get = (m: Record<string, string>) => (k: string) => m[k] ?? "";

describe("Shop by category settings", () => {
  it("keeps the look the section always had when nothing is chosen", () => {
    expect(parseGrid(get({}))).toEqual({ style: "overlay", mobile: 2, tablet: 2, desktop: 4, rows: 0 });
  });

  it("reads the chosen style, columns and rows, and ignores values that are not offered", () => {
    expect(parseGrid(get({ category_style: "round", category_cols_desktop: "6", category_cols_tablet: "3", category_cols_mobile: "1", category_rows: "2" }))).toEqual({ style: "round", mobile: 1, tablet: 3, desktop: 6, rows: 2 });
    expect(parseGrid(get({ category_style: "weird", category_cols_desktop: "9", category_cols_mobile: "0", category_rows: "99" }))).toEqual({ style: "overlay", mobile: 2, tablet: 2, desktop: 4, rows: 0 });
  });

  it("has a grid class for every column count that can be chosen", () => {
    for (const n of [1, 2, 3]) expect(GRID_CLASS.mobile[n]).toBe(`grid-cols-${n}`);
    for (const n of [2, 3, 4]) expect(GRID_CLASS.tablet[n]).toBe(`sm:grid-cols-${n}`);
    for (const n of [2, 3, 4, 5, 6]) expect(GRID_CLASS.desktop[n]).toBe(`lg:grid-cols-${n}`);
  });

  it("limits the tiles to rows x columns on each screen size", () => {
    const g = { style: "overlay", mobile: 2, tablet: 3, desktop: 4, rows: 1 };
    expect(hiddenClass(0, g)).toBe("");
    expect(hiddenClass(1, g)).toBe("");
    expect(hiddenClass(2, g)).toBe("max-sm:hidden");               // third tile: hidden on phones only
    expect(hiddenClass(3, g)).toBe("max-sm:hidden sm:max-lg:hidden"); // fourth: hidden on phones and tablets
    expect(hiddenClass(4, g)).toBe("max-sm:hidden sm:max-lg:hidden lg:hidden");
    expect(hiddenClass(50, { ...g, rows: 0 })).toBe("");           // 0 rows = no limit
  });

  it("reads a saved list of categories and collections and drops anything malformed", () => {
    const json = JSON.stringify([
      { kind: "collection", slug: "bridal", label: "Bridal", image: "/api/public/img/2026-11/site/a.webp" },
      { kind: "category", slug: "rings" },
      { kind: "other", slug: "x" },
      { kind: "category" },
      null,
    ]);
    expect(parseTiles(json)).toEqual([
      { kind: "collection", slug: "bridal", label: "Bridal", image: "/api/public/img/2026-11/site/a.webp" },
      { kind: "category", slug: "rings" },
    ]);
    expect(parseTiles("")).toEqual([]);
    expect(parseTiles("not json")).toEqual([]);
  });
});
