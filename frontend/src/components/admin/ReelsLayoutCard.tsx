import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { Btn, Card, adminInput } from "@/components/admin/ui";
import { db } from "@/lib/data";
import { REELS_LAYOUT_DEFAULTS, REELS_LAYOUT_KEYS, REELS_PER_VIEW, reelsLayoutFromSettings, type ReelsLayout } from "@/lib/reels";
import { siteSettingsQuery } from "@/lib/site-settings";

const DEVICES = [
  { key: "desktop", label: "Desktop", hint: "Screens 1024 px and wider", icon: Monitor },
  { key: "tablet", label: "Tablet", hint: "Screens 640 to 1023 px", icon: Tablet },
  { key: "mobile", label: "Mobile", hint: "Screens under 640 px", icon: Smartphone },
] as const;

/** How many reels the home page shows side by side on each screen size. */
export function ReelsLayoutCard() {
  const qc = useQueryClient();
  const router = useRouter();
  const settings = useQuery({ ...siteSettingsQuery(), staleTime: 0 });
  const [draft, setDraft] = useState<ReelsLayout>(REELS_LAYOUT_DEFAULTS);
  const [saved, setSaved] = useState<ReelsLayout>(REELS_LAYOUT_DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    const current = reelsLayoutFromSettings(settings.data);
    setDraft(current);
    setSaved(current);
  }, [settings.data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    try {
      const rows = DEVICES.map((d, i) => ({
        key: REELS_LAYOUT_KEYS[d.key], value: String(draft[d.key]), group_name: "appearance", label: `Reels shown on ${d.label.toLowerCase()}`,
        help: "How many reels show side by side (1 to 6).", multiline: false, sort_order: 400 + i,
      }));
      const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      setSaved(draft);
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      await router.invalidate();
      toast.success("Reel layout saved. The website is updated.");
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Reel layout"
      className="mb-4"
      actions={
        <div className="flex gap-2">
          <Btn disabled={!dirty || saving} onClick={() => setDraft(saved)}>Discard</Btn>
          <Btn variant="primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save layout"}</Btn>
        </div>
      }
    >
      <p className="mb-3 max-w-2xl text-xs text-[#616161]">How many reels are shown side by side in the home page section. Each reel takes an equal share of the row; the rest scroll sideways.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {DEVICES.map(({ key, label, hint, icon: Icon }) => (
          <label key={key} className="block rounded-lg border border-[#e3e3e3] p-3 text-[13px]">
            <span className="flex items-center gap-2 font-medium"><Icon className="size-4 text-[#616161]" /> {label}</span>
            <span className="block text-xs text-[#616161]">{hint}</span>
            <select
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
              aria-label={`Reels shown on ${label.toLowerCase()}`}
              className={`${adminInput} mt-2`}
            >
              {REELS_PER_VIEW.map((n) => <option key={n} value={n}>{n} {n === 1 ? "reel" : "reels"}</option>)}
            </select>
          </label>
        ))}
      </div>
    </Card>
  );
}
