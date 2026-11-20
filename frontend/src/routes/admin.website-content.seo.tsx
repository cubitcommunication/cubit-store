import { brand } from "@/config/brand";
import { FormSkeleton } from "@/components/ui/loading-rows";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsEditor } from "@/components/admin/SettingsEditor";
import { db } from "@/lib/data";
import { settingsGroupQuery } from "@/lib/settings-group";

export const Route = createFileRoute("/admin/website-content/seo")({
  head: () => ({ meta: [{ title: `SEO — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SeoSettings,
});

function SeoSettings() {
  const qc = useQueryClient(); const router = useRouter(); const [saving, setSaving] = useState(false);
  const settings = useQuery(settingsGroupQuery("seo"));
  const products = useQuery({ queryKey: ["admin", "seo-products"], queryFn: async () => { const { data, error } = await db.from("products").select("id,slug,seo_title,seo_description,product_images(alt_text)").eq("published", true).is("archived_at", null); if (error) throw error; return data ?? []; } });
  async function save(values: Record<string, string>) { setSaving(true); try { for (const [key, value] of Object.entries(values)) { const { error } = await db.from("site_settings").update({ value: value.trim() }).eq("key", key); if (error) throw error; } await qc.invalidateQueries({ queryKey: ["site-settings"] }); await qc.invalidateQueries({ queryKey: ["admin", "site-settings"] }); await router.invalidate(); toast.success("SEO settings saved"); } catch { toast.error("Something went wrong. Please try again."); } finally { setSaving(false); } }
  type SeoRow = { product_images: { alt_text: string | null }[] };
  const rows: SeoRow[] = products.data ?? []; const missingAlt = rows.filter((p) => (p.product_images ?? []).some((image) => !image.alt_text?.trim())).length;
  return <AdminShell title="SEO">
    <p className="mt-4 max-w-2xl text-sm text-muted-foreground">Search information is automatic. Use these fields only when you want to override the generated wording or social image. Analytics, Tag Manager, Clarity and the other connected tools are on the Integrations page.</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Status label="Published products" value={products.isPending ? "…" : String(rows.length)} />
      <Status label="Missing image alt text" value={products.isPending ? "…" : String(missingAlt)} attention={missingAlt > 0} />
      <Status label="Sitemap & robots" value="Active" />
    </div>
    {settings.isError ? <p className="mt-6 text-sm text-brand-red">SEO settings could not be loaded.</p> : settings.isPending ? <FormSkeleton cards={1} fields={4} /> : <SettingsEditor rows={settings.data ?? []} saving={saving} onSave={save} />}
  </AdminShell>;
}

function Status({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) { return <div className="border border-border bg-background p-4"><p className="eyebrow text-muted-foreground">{label}</p><p className={`mt-2 font-display text-2xl ${attention ? "text-brand-red" : ""}`}>{value}</p></div>; }