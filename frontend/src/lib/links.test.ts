import { describe, expect, it } from "vitest";
import { isValidLink, parseLink } from "./links";
import { DEFAULT_OCCASIONS, parseBands, parseOccasions } from "./home-content";

describe("admin-editable links", () => {
  it("accepts site pages, queries and https addresses", () => {
    expect(parseLink("/shop")).toEqual({ kind: "internal", pathname: "/shop", search: {} });
    expect(parseLink("/collection/wedding-season/")).toMatchObject({ kind: "internal", pathname: "/collection/wedding-season" });
    expect(parseLink("/shop?q=Bridal")).toEqual({ kind: "internal", pathname: "/shop", search: { q: "Bridal" } });
    expect(parseLink("/shop?q=Bags%20%26%20Co")).toMatchObject({ search: { q: "Bags & Co" } });
    expect(parseLink("https://example.com/a?b=1")).toEqual({ kind: "external", href: "https://example.com/a?b=1" });
  });

  it("refuses anything that could be unsafe or broken", () => {
    for (const bad of ["", "   ", "javascript:alert(1)", "//evil.com", "http://insecure.com", "shop", "/a b", "data:text/html,x", "/<script>"]) {
      expect(isValidLink(bad), bad).toBe(false);
    }
  });
});

describe("home page lists", () => {
  it("falls back to the shipped list when the stored value is empty or broken", () => {
    expect(parseOccasions("")).toEqual(DEFAULT_OCCASIONS);
    expect(parseOccasions("not json")).toEqual(DEFAULT_OCCASIONS);
    expect(parseBands("{oops")).toEqual([]);
  });

  it("keeps tabs that name a collection, drops the rest, and still understands old collection links", () => {
    const raw = JSON.stringify([{ label: "Wedding", collection: "wedding-season" }, { label: "", collection: "x" }, { label: "Bad", collection: "Not A Slug!" }, { label: "Old", url: "/collection/party" }, { label: "OldPage", url: "/shop?q=Bridal" }, { label: "Bridal", collection: "bridal" }]);
    expect(parseOccasions(raw)).toEqual([{ label: "Wedding", collection: "wedding-season" }, { label: "Old", collection: "party" }, { label: "Bridal", collection: "bridal" }]);
  });

  it("keeps a story but blanks an unsafe button link", () => {
    const bands = parseBands(JSON.stringify([{ title: "WEDDING EDIT", body: "x", cta: "SHOP", url: "javascript:x", media: "ad_section", visible: true }, { title: "", url: "/shop" }]));
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ title: "WEDDING EDIT", url: "", visible: true });
  });
});
