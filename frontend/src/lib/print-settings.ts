import { useLoaderData } from "@tanstack/react-router";
import type { SiteSetting } from "@/lib/site-settings";

/** One raw value from the site settings (e.g. the return address printed on labels). */
export function useRootSettingsValue(key: string): string {
  const data = useLoaderData({ from: "__root__" }) as { siteSettings?: SiteSetting[] } | undefined;
  return (data?.siteSettings ?? []).find((r) => r.key === key)?.value?.trim() ?? "";
}
