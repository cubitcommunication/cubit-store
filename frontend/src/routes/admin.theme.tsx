import { brand } from "@/config/brand";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Monitor, Smartphone } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Btn, Card, Field, adminInput } from "@/components/admin/ui";
import { db } from "@/lib/data";
import { siteSettingsQuery } from "@/lib/site-settings";
import { PALETTES, THEME_DEFAULTS, THEME_KEYS, resolvePalette, themeFromSettings, type Palette, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/theme")({
  head: () => ({ meta: [{ title: `Theme colours — ${brand.name} Admin` }] }),
  component: ThemePage,
});

const LABELS: Record<string, { label: string; help: string; sort: number }> = {
  ui_theme: { label: "Website colour theme", help: "A palette name, or custom", sort: 200 },
  ui_theme_accent: { label: "Custom accent colour", help: "Hex colour such as #8f6a14 (used when the theme is custom)", sort: 210 },
  ui_theme_ink: { label: "Custom text and button colour", help: "Hex colour such as #1a1408 (used when the theme is custom)", sort: 220 },
};

const HEX = /^#[0-9a-f]{6}$/i;
const same = (a: Theme, b: Theme) => JSON.stringify(a) === JSON.stringify(b);

/** A miniature storefront painted in the palette's colours. */
function Mini({ p }: { p: Palette }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-[#e3e3e3]" style={{ background: p.background }} aria-hidden="true">
      <div className="flex items-center justify-between px-2.5 py-1.5" style={{ borderBottom: `1px solid ${p.surface}` }}>
        <span className="h-1.5 w-10 rounded-full" style={{ background: p.ink }} />
        <span className="flex gap-1"><i className="h-1 w-3 rounded-full" style={{ background: p.ink, opacity: 0.35 }} /><i className="h-1 w-3 rounded-full" style={{ background: p.ink, opacity: 0.35 }} /></span>
      </div>
      <div className="space-y-1.5 p-2.5" style={{ background: p.surface }}>
        <span className="block h-1.5 w-16 rounded-full" style={{ background: p.accent }} />
        <span className="block h-2 w-24 rounded-full" style={{ background: p.ink }} />
        <span className="block h-1 w-20 rounded-full" style={{ background: p.ink, opacity: 0.35 }} />
        <span className="mt-1 flex gap-1.5">
          <i className="h-4 w-12 rounded-md" style={{ background: p.accent }} />
          <i className="h-4 w-12 rounded-md" style={{ background: p.ink }} />
        </span>
      </div>
    </div>
  );
}

function ThemePage() {
  const qc = useQueryClient();
  const router = useRouter();
  const settings = useQuery({ ...siteSettingsQuery(), staleTime: 0 });
  const [draft, setDraft] = useState<Theme>(THEME_DEFAULTS);
  const [saved, setSaved] = useState<Theme>(THEME_DEFAULTS);
  const [page, setPage] = useState("/");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    const current = themeFromSettings(settings.data);
    setDraft(current);
    setSaved(current);
  }, [settings.data]);

  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "shop-theme-preview", theme: draft }, window.location.origin);
  }, [draft]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "shop-ui-preview-ready") {
        setReady(true);
        send();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);
  useEffect(() => {
    if (ready) send();
  }, [ready, send]);

  const dirty = !same(draft, saved);
  const invalid = draft.palette === "custom" && (!HEX.test(draft.customAccent) || !HEX.test(draft.customInk));
  const set = <K extends keyof Theme>(key: K, value: Theme[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const values: Record<string, string> = {
        [THEME_KEYS.palette]: draft.palette,
        [THEME_KEYS.customAccent]: draft.customAccent,
        [THEME_KEYS.customInk]: draft.customInk,
      };
      const rows = Object.entries(values).map(([key, value]) => ({
        key, value, group_name: "appearance", label: LABELS[key]!.label, help: LABELS[key]!.help, multiline: false, sort_order: LABELS[key]!.sort,
      }));
      const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setSaved(draft);
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      await router.invalidate();
      toast.success("Theme saved. The live site is updated.");
    },
    onError: () => toast.error("Could not save. Please try again."),
  });

  const current = resolvePalette(draft);

  return (
    <AdminShell
      title="Theme colours"
      actions={
        <>
          <Btn disabled={!dirty || save.isPending} onClick={() => setDraft(saved)}>Discard</Btn>
          <Btn variant="primary" disabled={!dirty || invalid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Btn>
        </>
      }
    >
      <p className="-mt-2 mb-4 text-[13px] text-[#616161]">
        Pick a colour theme for the whole website: buttons, links, highlights, text and soft panels all follow it. The preview on the right is the real shop; nothing goes live until you press Save. The admin panel keeps its own neutral look.
      </p>

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Premium palettes">
            <div role="radiogroup" aria-label="Colour theme" className="grid grid-cols-2 gap-2.5">
              {PALETTES.map((p) => {
                const on = draft.palette === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("palette", p.id)}
                    className={cn("relative flex flex-col gap-2 rounded-[10px] border bg-white p-2.5 text-left transition-colors", on ? "border-[#303030] ring-2 ring-[#303030]/20" : "border-[#e3e3e3] hover:border-[#8a8a8a]")}
                  >
                    {on ? <span className="absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-full bg-[#303030] text-white"><Check className="size-3" /></span> : null}
                    <Mini p={p} />
                    <span className="flex items-center gap-1.5">
                      <i className="size-3.5 rounded-full border border-black/10" style={{ background: p.accent }} />
                      <i className="size-3.5 rounded-full border border-black/10" style={{ background: p.ink }} />
                      <i className="size-3.5 rounded-full border border-black/10" style={{ background: p.surface }} />
                    </span>
                    <span className="text-[13px] font-semibold leading-tight">{p.name}</span>
                    <span className="text-[11px] leading-snug text-[#616161]">{p.description}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Your own colours">
            <button
              type="button"
              role="radio"
              aria-checked={draft.palette === "custom"}
              onClick={() => set("palette", "custom")}
              className={cn("mb-3 flex w-full items-center gap-3 rounded-[10px] border bg-white p-2.5 text-left transition-colors", draft.palette === "custom" ? "border-[#303030] ring-2 ring-[#303030]/20" : "border-[#e3e3e3] hover:border-[#8a8a8a]")}
            >
              <span className="w-28 shrink-0"><Mini p={resolvePalette({ ...draft, palette: "custom" })} /></span>
              <span>
                <span className="block text-[13px] font-semibold">Custom</span>
                <span className="block text-[11px] leading-snug text-[#616161]">Choose an accent and a text colour. Soft panels are tinted from the accent.</span>
              </span>
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Accent colour" help="Buttons, links and highlights.">
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Accent colour" value={HEX.test(draft.customAccent) ? draft.customAccent : "#000000"} onChange={(e) => setDraft((d) => ({ ...d, palette: "custom", customAccent: e.target.value }))} className="h-9 w-11 cursor-pointer rounded border border-[#c9c9c9] bg-white p-0.5" />
                  <input value={draft.customAccent} onChange={(e) => setDraft((d) => ({ ...d, palette: "custom", customAccent: e.target.value.trim() }))} maxLength={7} spellCheck={false} className={adminInput} />
                </div>
              </Field>
              <Field label="Text and button colour" help="Headings, text and dark buttons.">
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Text and button colour" value={HEX.test(draft.customInk) ? draft.customInk : "#000000"} onChange={(e) => setDraft((d) => ({ ...d, palette: "custom", customInk: e.target.value }))} className="h-9 w-11 cursor-pointer rounded border border-[#c9c9c9] bg-white p-0.5" />
                  <input value={draft.customInk} onChange={(e) => setDraft((d) => ({ ...d, palette: "custom", customInk: e.target.value.trim() }))} maxLength={7} spellCheck={false} className={adminInput} />
                </div>
              </Field>
            </div>
            {invalid ? <p role="alert" className="mt-2 text-xs text-[#b42318]">Use a full hex colour like #8f6a14.</p> : <p className="mt-2 text-xs text-[#616161]">Tip: choose a fairly dark accent so white button text stays easy to read.</p>}
          </Card>

          <p className="text-xs text-[#616161]">Selected: <strong>{current.name}</strong></p>
        </div>

        <Card
          title="Live preview"
          actions={
            <div className="flex items-center gap-2">
              <div role="group" aria-label="Preview size" className="inline-flex overflow-hidden rounded-lg border border-[#c9c9c9]">
                {([["desktop", Monitor, "Desktop"], ["phone", Smartphone, "Phone"]] as const).map(([id, Icon, label]) => (
                  <button key={id} type="button" aria-pressed={device === id} onClick={() => { setReady(false); setDevice(id); }} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium", device === id ? "bg-[#303030] text-white" : "bg-white text-[#303030] hover:bg-[#f7f7f7]")}>
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
              <select value={page} onChange={(e) => { setReady(false); setPage(e.target.value); }} aria-label="Preview page" className={cn(adminInput, "!w-auto")}>
                <option value="/">Home page</option>
                <option value="/shop">Shop page</option>
                <option value="/collections">Collections page</option>
              </select>
            </div>
          }
          className="xl:sticky xl:top-[122px] xl:self-start"
        >
          <iframe
            ref={frame}
            key={`${page}-${device}`}
            title="Storefront preview"
            src={page}
            onLoad={() => setReady(true)}
            className={cn("mx-auto h-[calc(100vh-230px)] min-h-[560px] rounded-[10px] border border-[#e3e3e3] bg-white", device === "phone" ? "w-[390px] max-w-full" : "w-full")}
          />
        </Card>
      </div>
    </AdminShell>
  );
}
