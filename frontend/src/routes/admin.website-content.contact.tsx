import { brand } from "@/config/brand";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsEditor } from "@/components/admin/SettingsEditor";
import { ImageField } from "@/components/admin/PageBlockForms";
import { Btn, Card } from "@/components/admin/ui";
import { BRAND_KEYS, brandLogosFromSettings } from "@/lib/brand";
import { siteSettingsQuery } from "@/lib/site-settings";
import { db } from "@/lib/data";
import { settingsGroupQuery } from "@/lib/settings-group";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/website-content/contact")({
  head: () => ({
    meta: [
      { title: `Contact & social — ${brand.name} Admin` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ContactDetails,
});

function ContactDetails() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useQuery(settingsGroupQuery("contact"));
  const [saving, setSaving] = useState(false);

  async function save(values: Record<string, string>) {
    setSaving(true);
    try {
      for (const [key, raw] of Object.entries(values)) {
        let value = raw.trim();
        if (key === "phone_e164") value = value.replace(/\D/g, "");
        if (["instagram_url", "facebook_url", "pinterest_url", "youtube_url"].includes(key)) {
          if (value && !/^https:\/\//i.test(value)) {
            toast.error("Links must start with https://");
            return;
          }
        }
        if (key === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          toast.error("Please enter a valid email address.");
          return;
        }
        const { error } = await db
          .from("site_settings")
          .update({ value })
          .eq("key", key);
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["admin", "site-settings"] });
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      await router.invalidate();
      toast.success("Saved. The website is updated.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell title="Store details">
      <BrandLogo />
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        Your phone, WhatsApp number, e-mail and social links. They are used by the header, footer, the Contact
        section of your pages and every WhatsApp enquiry button, including on product pages.
      </p>

      {isPending ? (
        <FormSkeleton cards={2} fields={4} />
      ) : isError ? (
        <div className="mt-6 border border-border bg-background p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Something went wrong. Please try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="eyebrow mt-4 border border-foreground px-4 py-2 hover:border-brand-red hover:text-brand-red"
          >
            Retry
          </button>
        </div>
      ) : (
        <SettingsEditor rows={data ?? []} saving={saving} onSave={save} />
      )}
    </AdminShell>
  );
}

/** The brand logo: shown in the website header and footer and at the top of every e-mail. */
function BrandLogo() {
  const qc = useQueryClient();
  const router = useRouter();
  const settings = useQuery({ ...siteSettingsQuery(), staleTime: 0 });
  const [logo, setLogo] = useState("");
  const [dark, setDark] = useState("");
  const [saved, setSaved] = useState({ logo: "", dark: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    const current = brandLogosFromSettings(settings.data);
    const next = { logo: current.logo ?? "", dark: current.dark ?? "" };
    setLogo(next.logo);
    setDark(next.dark);
    setSaved(next);
  }, [settings.data]);

  const dirty = logo !== saved.logo || dark !== saved.dark;

  async function save() {
    setSaving(true);
    try {
      const rows = [
        { key: BRAND_KEYS.logo, value: logo, label: "Brand logo", help: "Main logo, for light backgrounds and e-mails.", sort_order: 300 },
        { key: BRAND_KEYS.dark, value: dark, label: "Brand logo for dark backgrounds", help: "Optional light version used on the dark footer.", sort_order: 310 },
      ].map((r) => ({ ...r, group_name: "brand", multiline: false }));
      const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      setSaved({ logo, dark });
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      await router.invalidate();
      toast.success("Logo saved. The website and e-mails now use it.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Brand logo"
      className="mb-4"
      actions={
        <div className="flex gap-2">
          <Btn disabled={!dirty || saving} onClick={() => { setLogo(saved.logo); setDark(saved.dark); }}>Discard</Btn>
          <Btn variant="primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save logo"}</Btn>
        </div>
      }
    >
      <p className="mb-3 max-w-2xl text-xs text-[#616161]">
        Your logo appears in the website header, the mobile menu, the footer and at the top of every e-mail (order, shipping, refund and abandoned-cart e-mails). Leave it empty to keep the {brand.name} logo that came with the site. Use a PNG with a transparent background, about 600 px wide: some e-mail programs do not show SVG pictures.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <ImageField label="Logo (for light backgrounds and e-mails)" value={logo} onChange={setLogo} />
          {logo ? <div className="mt-2 rounded-lg border border-[#e3e3e3] bg-white p-3"><img src={logo} alt="Logo preview" className="max-h-14 w-auto" /></div> : null}
        </div>
        <div>
          <ImageField label="Logo for the dark footer (optional)" value={dark} onChange={setDark} />
          {dark ? <div className="mt-2 rounded-lg border border-[#e3e3e3] bg-[#1a1a1a] p-3"><img src={dark} alt="Dark logo preview" className="max-h-14 w-auto" /></div> : <p className="mt-2 text-xs text-[#616161]">If empty, the footer uses the main logo above.</p>}
        </div>
      </div>
    </Card>
  );
}
