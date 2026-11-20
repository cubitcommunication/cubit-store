import { COLS_DESKTOP, COLS_MOBILE, COLS_TABLET, ROW_CHOICES, TILE_STYLES } from "@/lib/category-tiles";
import { parseBands, parseOccasions } from "@/lib/home-content";
import { resolveMedia, type SiteMedia } from "@/lib/site-media";
import { SETTING_DEFAULTS, type SiteSetting } from "@/lib/site-settings";
import type { SectionContent } from "@/lib/section-ctx";
import type { Block, SiteSectionType } from "@/lib/pages";

/**
 * Content of the "site sections" (home hero, categories, story, contact...) stored IN the page.
 *
 * A section block carries `content`: a flat map of the same keys the old Website-content settings used
 * (`hero_title`, `story_body`, `bands_json`...), plus `img:<slot>` / `imgm:<slot>` for pictures (desktop / phone).
 * The section's components read text through the usual hooks; while a block draws, this context makes the hooks
 * answer from the block first. A block saved before it had content (no `content`) still reads the shop settings.
 */
export { SectionCtx, useSectionContent, type SectionContent } from "@/lib/section-ctx";

export type SectionField =
  | { kind: "text" | "long" | "link" | "toggle"; key: string; label: string; max?: number }
  | { kind: "choice"; key: string; label: string; options: [string, string][]; default?: string }
  | { kind: "image"; key: string; label: string; mobile?: boolean }
  | { kind: "bands" | "occasions" | "tiles"; key: string; label: string };

const contactImage: SectionField = { kind: "image", key: "contact_image", label: "Picture" };

export const SECTION_FIELDS: Record<SiteSectionType, SectionField[]> = {
  site_hero: [
    { kind: "image", key: "homepage_hero", label: "Banner picture", mobile: true },
    { kind: "text", key: "hero_title", label: "Heading", max: 120 },
    { kind: "long", key: "hero_subtitle", label: "Text under the heading", max: 300 },
    { kind: "text", key: "hero_primary_cta", label: "Main button label", max: 40 },
    { kind: "link", key: "hero_primary_url", label: "Main button opens" },
    { kind: "text", key: "hero_secondary_cta", label: "Second button label (optional)", max: 40 },
    { kind: "link", key: "hero_secondary_url", label: "Second button opens" },
  ],
  site_categories: [
    { kind: "text", key: "category_heading", label: "Heading", max: 80 },
    { kind: "text", key: "category_link_label", label: "Link label", max: 40 },
    { kind: "tiles", key: "category_tiles_json", label: "Categories and collections shown" },
    { kind: "choice", key: "category_style", label: "Style", options: TILE_STYLES, default: "overlay" },
    { kind: "choice", key: "category_cols_desktop", label: "Columns on desktop", options: COLS_DESKTOP, default: "4" },
    { kind: "choice", key: "category_cols_tablet", label: "Columns on tablet", options: COLS_TABLET, default: "2" },
    { kind: "choice", key: "category_cols_mobile", label: "Columns on phones", options: COLS_MOBILE, default: "2" },
    { kind: "choice", key: "category_rows", label: "Rows", options: ROW_CHOICES, default: "0" },
  ],
  site_season: [
    { kind: "toggle", key: "season_enabled", label: "Show this banner" },
    { kind: "image", key: "diwali_banner", label: "Banner picture" },
    { kind: "text", key: "season_eyebrow", label: "Small title above", max: 60 },
    { kind: "text", key: "season_heading", label: "Heading", max: 120 },
    { kind: "long", key: "season_description", label: "Text", max: 300 },
    { kind: "text", key: "season_cta_label", label: "Button label", max: 40 },
    { kind: "link", key: "season_cta_url", label: "Button opens" },
  ],
  site_featured: [
    { kind: "text", key: "featured_eyebrow", label: "Small title above", max: 60 },
    { kind: "text", key: "featured_heading", label: "Heading", max: 80 },
    { kind: "text", key: "featured_link_label", label: "Link label", max: 40 },
  ],
  site_stories: [{ kind: "bands", key: "bands_json", label: "Picture + text bands" }],
  site_occasions: [
    { kind: "text", key: "occasion_heading", label: "Heading", max: 80 },
    { kind: "text", key: "occasion_view_more_label", label: "\"View more\" button label", max: 40 },
    { kind: "choice", key: "occasion_product_count", label: "Products shown per tab", options: [["4", "4 (one row)"], ["8", "8 (two rows)"], ["12", "12 (three rows)"]] },
    { kind: "occasions", key: "occasions_json", label: "Tabs" },
  ],
  site_story: [
    { kind: "image", key: "about_story", label: "Picture" },
    { kind: "text", key: "story_heading", label: "Heading", max: 80 },
    { kind: "long", key: "story_body", label: "Text", max: 600 },
    { kind: "text", key: "highlight_1", label: "Highlight 1", max: 40 },
    { kind: "text", key: "highlight_2", label: "Highlight 2", max: 40 },
    { kind: "text", key: "highlight_3", label: "Highlight 3", max: 40 },
    { kind: "text", key: "story_link_label", label: "Link label", max: 40 },
  ],
  site_reels: [
    { kind: "image", key: "instagram_section", label: "Picture above the heading (optional)" },
    { kind: "text", key: "instagram_heading", label: "Heading", max: 80 },
    { kind: "long", key: "instagram_body", label: "Text", max: 300 },
    { kind: "text", key: "instagram_handle", label: "Instagram handle", max: 60 },
    { kind: "link", key: "instagram_url", label: "Instagram link" },
  ],
  site_contact: [
    contactImage,
    { kind: "text", key: "phone_display", label: "Phone (as shown)", max: 40 },
    { kind: "text", key: "phone_e164", label: "WhatsApp / phone number (digits, with country code)", max: 20 },
    { kind: "text", key: "email", label: "E-mail", max: 120 },
    { kind: "text", key: "instagram_handle", label: "Instagram handle", max: 60 },
    { kind: "link", key: "instagram_url", label: "Instagram link" },
    { kind: "text", key: "facebook_label", label: "Facebook name", max: 60 },
    { kind: "link", key: "facebook_url", label: "Facebook link" },
  ],
};

export const isSectionType = (t: string): t is SiteSectionType => t in SECTION_FIELDS;

/** The block's current content for the section, filled from the shop settings for anything it does not hold yet. */
export function seedContent(type: SiteSectionType, rows: SiteSetting[], media: SiteMedia[], have: SectionContent = {}): SectionContent {
  const out: SectionContent = { ...have };
  const setting = (key: string) => {
    const row = rows.find((r) => r.key === key);
    return row ? (row.value ?? "").trim() : (SETTING_DEFAULTS[key] ?? "");
  };
  for (const f of SECTION_FIELDS[type]) {
    if (f.kind === "image") {
      const m = resolveMedia(media, f.key);
      if (!(`img:${f.key}` in out)) out[`img:${f.key}`] = m.src ?? "";
      if (f.mobile && !(`imgm:${f.key}` in out)) out[`imgm:${f.key}`] = m.mobileSrc ?? "";
      continue;
    }
    if (f.key in out) continue;
    if (f.kind === "bands") {
      // Each band's picture becomes a direct address, so the band no longer depends on a site-image slot.
      out[f.key] = JSON.stringify(parseBands(setting(f.key)).map((b) => ({ ...b, media: resolveMedia(media, b.media).src ?? "" })));
    } else if (f.kind === "occasions") {
      out[f.key] = JSON.stringify(parseOccasions(setting(f.key)));
    } else if (f.kind === "choice") {
      out[f.key] = setting(f.key) || f.default || f.options[1]?.[0] || f.options[0]![0];
    } else {
      out[f.key] = setting(f.key);
    }
  }
  return out;
}

/** "media:<slot>" -> the picture's own address, so the page keeps its own copy of the picture. */
function resolveRef(value: string, media: SiteMedia[]): string {
  return value.startsWith("media:") ? (resolveMedia(media, value.slice(6)).src ?? "") : value;
}

/**
 * Gives every section block (also inside columns) its own content the first time, and turns "media:<slot>"
 * pictures into real addresses. A picture block that pointed at an empty slot is dropped.
 * Returns the same array when nothing changed.
 */
export function seedBlocks(blocks: Block[], rows: SiteSetting[], media: SiteMedia[]): Block[] {
  let changed = false;
  const walk = (list: Block[]): Block[] => {
    const out: Block[] = [];
    for (const b of list) {
      let next: Block = b;
      if (b.type === "columns") {
        const cols = b.columns.map(walk);
        if (cols.some((c, i) => c !== b.columns[i])) next = { ...b, columns: cols };
      } else if (isSectionType(b.type) && !("content" in b && b.content)) {
        next = { ...b, content: seedContent(b.type, rows, media) } as Block;
      } else if ((b.type === "hero" || b.type === "image" || b.type === "image_text") && (b.image ?? "").startsWith("media:")) {
        const image = resolveRef(b.image ?? "", media);
        if (!image && b.type === "image") {
          changed = true;
          continue;
        }
        next = { ...b, image };
      } else if (b.type === "team" && b.items.some((p) => (p.image ?? "").startsWith("media:"))) {
        next = { ...b, items: b.items.map((p) => ({ ...p, image: resolveRef(p.image ?? "", media) })) };
      }
      if (next !== b) changed = true;
      out.push(next);
    }
    return out;
  };
  const next = walk(blocks);
  return changed ? next : blocks;
}
