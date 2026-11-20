import { brand } from "@/config/brand";
import { useSyncExternalStore } from "react";
import { useLoaderData } from "@tanstack/react-router";
import { settingsToMap, type SiteSetting } from "@/lib/site-settings";

/**
 * Storefront colour theme, chosen in Admin → Theme colours (`site_settings`, group "appearance").
 * A theme overrides the CSS colour variables in styles.css, so every page follows it. The admin panel
 * keeps its own neutral look (the rule is scoped away from `.admin-ui`).
 */
export type Palette = {
  id: string;
  name: string;
  description: string;
  /** Buttons, links, highlights, focus rings. */
  accent: string;
  /** Headings, body text and the dark buttons. */
  ink: string;
  /** Page background. */
  background: string;
  /** Soft panels and image placeholders. */
  surface: string;
};

export const DEFAULT_PALETTE_ID = "ruby";

export const PALETTES: Palette[] = [
  { id: "ruby", name: "Ruby (original)", description: `The classic ${brand.name} red on pure white.`, accent: "oklch(0.606 0.246 17.5)", ink: "#000000", background: "#fcfcfc", surface: "#f6f6f4" },
  { id: "gold", name: "Royal Gold", description: "Antique gold on warm ivory. Rich and festive.", accent: "#8f6a14", ink: "#1a1408", background: "#fffdf8", surface: "#f8f3e6" },
  { id: "emerald", name: "Emerald Luxe", description: "Deep emerald with a hint of mint.", accent: "#0f6b4f", ink: "#0b1f18", background: "#fcfefd", surface: "#eef5f1" },
  { id: "sapphire", name: "Midnight Sapphire", description: "Navy ink with a royal blue accent.", accent: "#1e4fa3", ink: "#0c1630", background: "#fdfdff", surface: "#eef2fa" },
  { id: "rose", name: "Rose Blush", description: "Soft dusty rose. Gentle and feminine.", accent: "#c2456b", ink: "#2a1218", background: "#fffdfd", surface: "#fbeff2" },
  { id: "plum", name: "Royal Plum", description: "Deep aubergine with a violet accent.", accent: "#7a2a6e", ink: "#1f0f1c", background: "#fffdff", surface: "#f6eef5" },
  { id: "copper", name: "Rose Gold", description: "Warm copper tones on a blush white.", accent: "#a8573b", ink: "#24140f", background: "#fffdfc", surface: "#f8ede8" },
  { id: "champagne", name: "Champagne Noir", description: "Black and champagne. Quiet luxury.", accent: "#8a6d3b", ink: "#111111", background: "#fdfbf6", surface: "#f3eee3" },
  { id: "burgundy", name: "Deep Burgundy", description: "Wine red with a dark cherry ink.", accent: "#800f2f", ink: "#1a0a0f", background: "#fffdfd", surface: "#f7eded" },
];

export type Theme = { palette: string; customAccent: string; customInk: string };

export const THEME_DEFAULTS: Theme = { palette: DEFAULT_PALETTE_ID, customAccent: "#8f6a14", customInk: "#1a1408" };

export const THEME_KEYS = {
  palette: "ui_theme",
  customAccent: "ui_theme_accent",
  customInk: "ui_theme_ink",
} as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function themeFromSettings(rows: SiteSetting[] | undefined): Theme {
  const map = settingsToMap(rows);
  const palette = map[THEME_KEYS.palette];
  const accent = map[THEME_KEYS.customAccent];
  const ink = map[THEME_KEYS.customInk];
  return {
    palette: palette === "custom" || PALETTES.some((p) => p.id === palette) ? palette! : THEME_DEFAULTS.palette,
    customAccent: accent && HEX.test(accent) ? accent : THEME_DEFAULTS.customAccent,
    customInk: ink && HEX.test(ink) ? ink : THEME_DEFAULTS.customInk,
  };
}

/** The palette a theme resolves to ("custom" builds one from the two chosen colours). */
export function resolvePalette(theme: Theme): Palette {
  if (theme.palette === "custom" && HEX.test(theme.customAccent) && HEX.test(theme.customInk)) {
    return {
      id: "custom",
      name: "Your own colours",
      description: "",
      accent: theme.customAccent,
      ink: theme.customInk,
      background: "#ffffff",
      surface: `color-mix(in oklab, ${theme.customAccent} 6%, white)`,
    };
  }
  return PALETTES.find((p) => p.id === theme.palette) ?? PALETTES[0]!;
}

/** CSS for the chosen theme. Empty for the original look, so nothing changes until a palette is picked. */
export function themeCss(theme: Theme): string {
  if (theme.palette === DEFAULT_PALETTE_ID) return "";
  const p = resolvePalette(theme);
  const vars = [
    ["--brand-red", p.accent], ["--accent", p.accent], ["--ring", p.accent], ["--sidebar-ring", p.accent],
    ["--foreground", p.ink], ["--primary", p.ink], ["--card-foreground", p.ink], ["--popover-foreground", p.ink],
    ["--secondary-foreground", p.ink], ["--sidebar-foreground", p.ink],
    ["--background", p.background], ["--card", p.background], ["--popover", p.background],
    ["--primary-foreground", p.background], ["--accent-foreground", p.background],
    ["--surface", p.surface], ["--muted", p.surface], ["--secondary", p.surface],
  ];
  return `:root:not(:has(.admin-ui)){${vars.map(([k, v]) => `${k}:${v}`).join(";")}}`;
}

/* ---------------------------------------------------------------- live preview
 * Admin → Theme colours shows the real shop in an <iframe> and posts the draft theme to it
 * (see installPreviewListener in appearance.ts). Nothing is saved until the owner presses Save.
 */
let previewTheme: Theme | null = null;
const listeners = new Set<() => void>();

export function setThemePreview(next: Theme | null) {
  previewTheme = next;
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The stylesheet text for the current theme (saved, or the admin's draft inside the preview frame). */
export function useThemeCss(): string {
  const data = useLoaderData({ from: "__root__" }) as { siteSettings?: SiteSetting[] } | undefined;
  const preview = useSyncExternalStore(subscribe, () => previewTheme, () => null);
  return themeCss(preview ?? themeFromSettings(data?.siteSettings));
}
