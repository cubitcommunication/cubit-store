import { brand } from "@/config/brand";
import { useLoaderData } from "@tanstack/react-router";
import { settingsToMap, type SiteSetting } from "@/lib/site-settings";

/**
 * Header and footer layouts made in Admin → Online store → Header & footer.
 *
 * A layout is plain JSON kept in `site_settings` (keys `layout_header`, `layout_footer`). When nothing has been saved
 * yet the defaults below reproduce the original design, so the site looks the same until the owner changes something.
 * Element text is always plain text and every link goes through SmartLink; nothing typed here becomes HTML.
 */

export type LayoutKind = "header" | "footer";

export type ElType =
  | "logo" | "menu" | "menu_button" | "search" | "wishlist" | "account" | "cart" | "whatsapp" | "instagram" | "facebook"
  | "text" | "image" | "button" | "spacer" | "links" | "contact" | "social" | "newsletter";

export type PropKey = "image" | "height" | "link" | "text" | "size" | "italic" | "alt" | "label" | "variant" | "source" | "items" | "show";
export type Props = Partial<Record<PropKey, string>>;
export type El = { id: string; type: ElType; hidden?: boolean; props: Props };

export type HeaderLayout = {
  sticky: boolean;
  height: "compact" | "normal" | "tall";
  zones: { left: El[]; center: El[]; right: El[] };
  /** The strip above the menu. Absent on layouts saved before it moved here (the old Homepage-text lines are used then). */
  announce?: { items: Announcement[] };
};
export type Announcement = { text: string; url: string };

export type FooterColumn = { id: string; title: string; width: number; elements: El[] };
export type FooterLayout = { columns: FooterColumn[]; tone: "black" | "red"; copyright: string };

export type ZoneKey = keyof HeaderLayout["zones"];

export const newId = () => Math.random().toString(36).slice(2, 10);
const el = (type: ElType, props: Record<string, string> = {}): El => ({ id: newId(), type, props });

/* ------------------------------------------------------------------ element catalogue */

export type FieldDef =
  | { key: string; label: string; kind: "text" | "textarea" | "link" | "image"; help?: string }
  | { key: string; label: string; kind: "select"; options: [string, string][] }
  | { key: string; label: string; kind: "number"; min: number; max: number };

export type ElementDef = { label: string; hint: string; fields: FieldDef[]; defaults: Record<string, string>; only?: LayoutKind };

export const ELEMENTS: Record<ElType, ElementDef> = {
  logo: {
    label: "Logo", hint: `The ${brand.name} logo`, defaults: { height: "44", image: "", link: "/" },
    fields: [
      { key: "image", label: "Logo image", kind: "image", help: `Leave empty for the ${brand.name} logo.` },
      { key: "height", label: "Height (px)", kind: "number", min: 16, max: 120 },
      { key: "link", label: "Links to", kind: "link" },
    ],
  },
  menu: { label: "Menu", hint: "Main menu (desktop)", defaults: {}, only: "header", fields: [] },
  menu_button: { label: "Menu button", hint: "Opens the menu on phones", defaults: {}, only: "header", fields: [] },
  search: { label: "Search", hint: "Search icon", defaults: {}, only: "header", fields: [] },
  wishlist: { label: "Wishlist", hint: "Heart (when wishlist is on)", defaults: {}, only: "header", fields: [] },
  account: { label: "Account", hint: "Sign in / account (when accounts are on)", defaults: {}, only: "header", fields: [] },
  cart: { label: "Cart", hint: "Bag (when cart is on)", defaults: {}, only: "header", fields: [] },
  whatsapp: { label: "WhatsApp", hint: "WhatsApp enquiry icon", defaults: {}, only: "header", fields: [] },
  instagram: { label: "Instagram", hint: "Instagram icon", defaults: {}, only: "header", fields: [] },
  facebook: { label: "Facebook", hint: "Facebook icon", defaults: {}, only: "header", fields: [] },
  text: {
    label: "Text", hint: "A line or paragraph of text", defaults: { text: "Your text", size: "md", italic: "no", link: "" },
    fields: [
      { key: "text", label: "Text", kind: "textarea" },
      { key: "size", label: "Size", kind: "select", options: [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]] },
      { key: "italic", label: "Style", kind: "select", options: [["no", "Normal"], ["yes", "Italic"]] },
      { key: "link", label: "Link (optional)", kind: "link" },
    ],
  },
  image: {
    label: "Image", hint: "Any picture", defaults: { image: "", alt: "", height: "40", link: "" },
    fields: [
      { key: "image", label: "Image", kind: "image" },
      { key: "alt", label: "Description (for screen readers)", kind: "text" },
      { key: "height", label: "Height (px)", kind: "number", min: 16, max: 300 },
      { key: "link", label: "Link (optional)", kind: "link" },
    ],
  },
  button: {
    label: "Button", hint: "A link styled as a button", defaults: { label: "Shop now", link: "/shop", variant: "solid" },
    fields: [
      { key: "label", label: "Label", kind: "text" },
      { key: "link", label: "Links to", kind: "link" },
      { key: "variant", label: "Style", kind: "select", options: [["solid", "Solid"], ["outline", "Outline"]] },
    ],
  },
  spacer: { label: "Space", hint: "Empty space", defaults: { size: "24" }, fields: [{ key: "size", label: "Size (px)", kind: "number", min: 4, max: 200 }] },
  links: {
    label: "Links list", hint: "A list of links", only: "footer", defaults: { source: "menu", items: "" },
    fields: [
      { key: "source", label: "Shows", kind: "select", options: [["menu", "The main menu"], ["categories", "Product categories"], ["custom", "My own links"]] },
      { key: "items", label: "Your links (one per line: Label | /address)", kind: "textarea" },
    ],
  },
  contact: { label: "Contact details", hint: "Phone and e-mail", only: "footer", defaults: {}, fields: [] },
  social: { label: "Social icons", hint: "Instagram, Facebook, Pinterest, YouTube", only: "footer", defaults: {}, fields: [] },
  newsletter: { label: "Newsletter sign-up", hint: "E-mail box", only: "footer", defaults: {}, fields: [] },
};

/** Every element can be limited to desktop (large screens) or phones & tablets. */
export const SHOW_FIELD: FieldDef = { key: "show", label: "Show on", kind: "select", options: [["all", "All screens"], ["desktop", "Desktop only"], ["mobile", "Phones & tablets only"]] };

export const HEADER_ADD: ElType[] = ["logo", "menu", "menu_button", "search", "wishlist", "account", "cart", "whatsapp", "instagram", "facebook", "text", "image", "button", "spacer"];
export const FOOTER_ADD: ElType[] = ["logo", "text", "links", "contact", "social", "newsletter", "image", "button", "spacer"];

export function blankEl(type: ElType): El {
  return { id: newId(), type, props: { ...ELEMENTS[type].defaults } };
}

/* ------------------------------------------------------------------ defaults (the original design) */

export function defaultHeader(): HeaderLayout {
  // A new store starts with just its name (or logo): the owner adds the menu, search, cart and the rest in Admin → Header & footer.
  return {
    sticky: true,
    height: "normal",
    zones: { left: [el("logo", { height: "44", image: "", link: "/" })], center: [], right: [] },
  };
}

export function defaultFooter(): FooterLayout {
  // Only the copyright line: columns, links and sign-up boxes are added in Admin → Header & footer.
  return { tone: "black", copyright: `© ${new Date().getFullYear()} ${brand.name}. All rights reserved.`, columns: [] };
}

/* ------------------------------------------------------------------ reading and writing */

export const LAYOUT_KEYS: Record<LayoutKind, string> = { header: "layout_header", footer: "layout_footer" };

// Stored JSON is untrusted: every field is checked by type before use, so it is read loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isObj = (v: unknown): v is any => typeof v === "object" && v !== null && !Array.isArray(v);

function cleanEls(list: unknown, kind: LayoutKind): El[] {
  if (!Array.isArray(list)) return [];
  const out: El[] = [];
  for (const raw of list) {
    if (!isObj(raw) || typeof raw.type !== "string" || !(raw.type in ELEMENTS)) continue;
    const type = raw.type as ElType;
    const def = ELEMENTS[type];
    if (def.only && def.only !== kind) continue;
    const props: Record<string, string> = { ...def.defaults };
    if (isObj(raw.props)) for (const k of [...Object.keys(def.defaults), "show"]) if (typeof raw.props[k] === "string") props[k] = raw.props[k] as string;
    out.push({ id: typeof raw.id === "string" && raw.id ? raw.id : newId(), type, props, ...(raw.hidden === true ? { hidden: true } : {}) });
  }
  return out;
}

/** Turns stored JSON into a safe layout; anything unreadable falls back to the original design. */
export function parseHeader(json: string | undefined | null): HeaderLayout {
  const base = defaultHeader();
  if (!json) return base;
  try {
    const d: unknown = JSON.parse(json);
    if (!isObj(d) || !isObj(d.zones)) return base;
    const out: HeaderLayout = {
      sticky: d.sticky !== false,
      height: d.height === "compact" || d.height === "tall" ? d.height : "normal",
      zones: { left: cleanEls(d.zones.left, "header"), center: cleanEls(d.zones.center, "header"), right: cleanEls(d.zones.right, "header") },
    };
    if (isObj(d.announce) && Array.isArray(d.announce.items)) {
      out.announce = {
        items: d.announce.items
          .filter(isObj)
          .slice(0, 6)
          .map((i: any) => ({ text: typeof i.text === "string" ? i.text.slice(0, 160) : "", url: typeof i.url === "string" ? i.url.slice(0, 300) : "" })),
      };
    }
    return out;
  } catch {
    return base;
  }
}

export function parseFooter(json: string | undefined | null): FooterLayout {
  const base = defaultFooter();
  if (!json) return base;
  try {
    const d: unknown = JSON.parse(json);
    if (!isObj(d) || !Array.isArray(d.columns) || d.columns.length === 0) return base;
    const columns: FooterColumn[] = d.columns.slice(0, 6).filter(isObj).map((c: any) => ({
      id: typeof c.id === "string" && c.id ? c.id : newId(),
      title: typeof c.title === "string" ? c.title.slice(0, 60) : "",
      width: typeof c.width === "number" && c.width >= 0.4 && c.width <= 3 ? c.width : 1,
      elements: cleanEls(c.elements, "footer"),
    }));
    return { tone: d.tone === "red" ? "red" : "black", copyright: typeof d.copyright === "string" ? d.copyright.slice(0, 160) : base.copyright, columns };
  } catch {
    return base;
  }
}

export function layoutFromSettings(rows: SiteSetting[] | undefined) {
  const map = settingsToMap(rows);
  return { header: parseHeader(map[LAYOUT_KEYS.header]), footer: parseFooter(map[LAYOUT_KEYS.footer]) };
}

/** Shows a stored footer link list line "Label | /path" as a link. Only same-site paths and https addresses are kept. */
export function parseLinkLines(text: string): { label: string; href: string }[] {
  return text
    .split("\n")
    .map((line) => line.split("|").map((s) => s.trim()))
    .filter(([label, href]) => label && href && (href.startsWith("/") || /^https:\/\//i.test(href) || /^(mailto|tel):/i.test(href)))
    .map(([label, href]) => ({ label: label!, href: href! }));
}

/* ------------------------------------------------------------------ editing helpers (immutable) */

export type Where = { zone: ZoneKey } | { column: string };
export type Loc = { where: Where; index: number; el: El };

export function listOf(layout: HeaderLayout | FooterLayout, where: Where): El[] {
  if ("zone" in where) return (layout as HeaderLayout).zones[where.zone];
  return (layout as FooterLayout).columns.find((c) => c.id === where.column)?.elements ?? [];
}

export function withList<T extends HeaderLayout | FooterLayout>(layout: T, where: Where, list: El[]): T {
  if ("zone" in where) {
    const h = layout as HeaderLayout;
    return { ...h, zones: { ...h.zones, [where.zone]: list } } as T;
  }
  const f = layout as FooterLayout;
  return { ...f, columns: f.columns.map((c) => (c.id === where.column ? { ...c, elements: list } : c)) } as T;
}

export function allWheres(layout: HeaderLayout | FooterLayout): Where[] {
  if ("zones" in layout) return [{ zone: "left" }, { zone: "center" }, { zone: "right" }];
  return layout.columns.map((c) => ({ column: c.id }));
}

export function findEl(layout: HeaderLayout | FooterLayout, id: string): Loc | null {
  for (const where of allWheres(layout)) {
    const list = listOf(layout, where);
    const index = list.findIndex((e) => e.id === id);
    if (index >= 0) return { where, index, el: list[index]! };
  }
  return null;
}

export function mapEl<T extends HeaderLayout | FooterLayout>(layout: T, id: string, fn: (e: El) => El): T {
  let out = layout;
  for (const where of allWheres(layout)) {
    const list = listOf(out, where);
    if (list.some((e) => e.id === id)) out = withList(out, where, list.map((e) => (e.id === id ? fn(e) : e)));
  }
  return out;
}

export function removeEl<T extends HeaderLayout | FooterLayout>(layout: T, id: string): T {
  let out = layout;
  for (const where of allWheres(layout)) {
    const list = listOf(out, where);
    if (list.some((e) => e.id === id)) out = withList(out, where, list.filter((e) => e.id !== id));
  }
  return out;
}

export function insertEl<T extends HeaderLayout | FooterLayout>(layout: T, item: El, where: Where, index: number): T {
  const list = listOf(layout, where).slice();
  list.splice(Math.max(0, Math.min(index, list.length)), 0, item);
  return withList(layout, where, list);
}

export function moveElTo<T extends HeaderLayout | FooterLayout>(layout: T, id: string, where: Where, index: number): T {
  const loc = findEl(layout, id);
  if (!loc) return layout;
  const sameList = JSON.stringify(loc.where) === JSON.stringify(where);
  const without = removeEl(layout, id);
  // Removing an item that sat earlier in the same list shifts the target down by one.
  return insertEl(without, loc.el, where, sameList && loc.index < index ? index - 1 : index);
}

export function cloneEl(e: El): El {
  return { ...e, id: newId(), props: { ...e.props } };
}

/** The saved header and footer layouts (or the original design) for the storefront. */
export function useLayouts() {
  const rows = (useLoaderData({ from: "__root__" }) as { siteSettings?: SiteSetting[] } | undefined)?.siteSettings;
  return layoutFromSettings(rows);
}
