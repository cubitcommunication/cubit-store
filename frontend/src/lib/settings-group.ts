import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/data";
import { SITE_SETTINGS_FIELDS, type SiteSetting } from "@/lib/site-settings";

/** One group of `site_settings` rows (contact, seo, ...), for the admin pages that edit them. */
export const settingsGroupQuery = (group: string) =>
  queryOptions({
    queryKey: ["admin", "site-settings", group],
    queryFn: async (): Promise<SiteSetting[]> => {
      const { data, error } = await db
        .from("site_settings")
        .select(SITE_SETTINGS_FIELDS)
        .eq("group_name", group)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SiteSetting[];
    },
  });
