import { matchesCollection as defaultMatches, type Collection, type Product } from "@/lib/catalog";
import { useSiteTextExact } from "@/lib/site-settings";
import { isValidLink } from "@/lib/links";

/** Lists the owner edits in Admin → Pages → Home page (stored as JSON in site_settings group "lists"). */
/** One "Shop by occasion" tab: its name and the collection (by slug) whose products it shows. */
export type OccasionTab = { label: string; collection: string };
export type StoryBand = { eyebrow: string; title: string; body: string; cta: string; url: string; media: string; visible: boolean };

export const DEFAULT_OCCASIONS: OccasionTab[] = [
  { label: "Everyday", collection: "everyday" }, { label: "Bridal", collection: "bridal" }, { label: "Reception", collection: "reception" },
  { label: "Party", collection: "party" },
];

function parseList<T>(raw: string, fallback: T[], accept: (v: unknown) => T | null): T[] {
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return fallback;
    return data.map(accept).filter((v): v is T => v !== null);
  } catch {
    return fallback;
  }
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

export function parseOccasions(raw: string): OccasionTab[] {
  return parseList(raw, DEFAULT_OCCASIONS, (v) => {
    const o = v as Record<string, unknown>;
    const label = str(o?.["label"], 40).trim();
    let collection = str(o?.["collection"], 120).trim();
    // Older saves stored a link; keep it when it pointed at a collection page.
    if (!collection) collection = /^\/collection\/([a-z0-9-]+)$/.exec(str(o?.["url"], 300).trim())?.[1] ?? "";
    return label && SLUG.test(collection) ? { label, collection } : null;
  });
}

/** Only 4, 8 or 12 products can be shown (1, 2 or 3 rows of four on a computer). */
export function normaliseCount(value: string | number | undefined): 4 | 8 | 12 {
  const n = Number(value);
  return n === 4 || n === 12 ? n : 8;
}

/** The products a tab shows: members of its collection, featured first, then newest, limited to `count`. */
export function pickTabProducts(products: Product[], collection: Collection, count: number, matches: (p: Product, c: Collection) => boolean = defaultMatches): Product[] {
  return products
    .filter((p) => matches(p, collection))
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, count);
}
export function parseBands(raw: string): StoryBand[] {
  return parseList<StoryBand>(raw, [], (v) => {
    const o = v as Record<string, unknown>;
    const title = str(o?.["title"], 120).trim();
    const url = str(o?.["url"], 300).trim();
    if (!title) return null;
    return {
      eyebrow: str(o?.["eyebrow"], 60), title, body: str(o?.["body"], 400), cta: str(o?.["cta"], 60), url: isValidLink(url) ? url : "",
      media: str(o?.["media"], 300), visible: o?.["visible"] !== false,
    };
  });
}

export function useOccasions(): OccasionTab[] {
  return parseOccasions(useSiteTextExact()("occasions_json"));
}

export function useStoryBands(): StoryBand[] {
  return parseBands(useSiteTextExact()("bands_json")).filter((b) => b.visible);
}

/** Section-wide settings of the occasion tabs. */
export function useOccasionSettings(): { count: 4 | 8 | 12; viewMore: string } {
  const x = useSiteTextExact();
  return { count: normaliseCount(x("occasion_product_count")), viewMore: x("occasion_view_more_label") || "View more" };
}
