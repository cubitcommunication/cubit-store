import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, useDropMissing, useSelection } from "@/components/admin/table";
import { Btn, Card, Field, IconBtn, adminInput } from "@/components/admin/ui";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { ReelsLayoutCard } from "@/components/admin/ReelsLayoutCard";
import { api } from "@/lib/api";
import { db } from "@/lib/data";
import { REEL_FIELDS, MAX_VIDEO_BYTES, safeLink, uploadReelPoster, uploadReelVideo, type Reel } from "@/lib/reels";
import { deleteStoredImage } from "@/lib/storage";
import { TilesSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/reels")({
  head: () => ({ meta: [{ title: `Reels — ${brand.name} Admin` }] }),
  component: ReelsPage,
});

type Draft = {
  id?: string;
  title: string;
  video_url: string;
  poster_url: string;
  product_id: string;
  link_url: string;
  link_label: string;
  active: boolean;
  sort_order: number;
};

const empty: Draft = { title: "", video_url: "", poster_url: "", product_id: "", link_url: "", link_label: "Shop this piece", active: true, sort_order: 100 };

type ProductOpt = { id: string; name: string; slug: string };

function ReelsPage() {
  const qc = useQueryClient();
  const reels = useQuery({
    queryKey: ["admin", "reels"],
    queryFn: async () => {
      const { data, error } = await db.from("reels").select(REEL_FIELDS).order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Reel[];
    },
  });
  const products = useQuery({
    queryKey: ["admin", "reel-products"],
    queryFn: async () => {
      const { data, error } = await db.from("products").select("id,name,slug").eq("published", true).order("name", { ascending: true }).limit(2000);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ProductOpt[];
    },
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pickingVideo, setPickingVideo] = useState(false);
  // Files the website points at that are no longer on the server (for example after a site update wiped uploads).
  const missing = useQuery({ queryKey: ["admin", "media-missing"], queryFn: () => api<{ missing: string[] }>("/admin/media/missing"), staleTime: 0, retry: false });
  const gone = new Set(missing.data?.missing ?? []);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "reels"] });
    void qc.invalidateQueries({ queryKey: ["reels"] });
  };
  const nameOf = (id: string | null) => (products.data ?? []).find((p) => p.id === id)?.name;

  async function onFile(file: File | undefined) {
    if (!file || !draft) return;
    setError(null);
    setProgress(0);
    try {
      const [url, poster] = await Promise.all([uploadReelVideo(file, setProgress), uploadReelPoster(file)]);
      setDraft((d) => (d ? { ...d, video_url: url, poster_url: poster ?? d.poster_url } : d));
      toast.success("Video uploaded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.video_url) throw new Error("Upload a video first.");
      const link = d.link_url.trim();
      if (!d.product_id && link && !safeLink(link)) throw new Error("The link must start with / (a page on this site) or https://");
      const row = {
        title: d.title.trim(),
        video_url: d.video_url,
        poster_url: d.poster_url || null,
        product_id: d.product_id || null,
        link_url: d.product_id ? null : link || null,
        link_label: d.link_label.trim() || "Shop this piece",
        active: d.active,
        sort_order: Number(d.sort_order) || 0,
      };
      const q = d.id ? db.from("reels").update(row).eq("id", d.id) : db.from("reels").insert(row);
      const { error: e } = await q;
      if (e) throw new Error(e.message);
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      refresh();
      toast.success("Reel saved");
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (r: Reel) => {
      const { error: e } = await db.from("reels").delete().eq("id", r.id);
      if (e) throw new Error(e.message);
      await deleteStoredImage(r.video_url);
      if (r.poster_url) await deleteStoredImage(r.poster_url);
    },
    onSuccess: () => { refresh(); toast.success("Reel deleted"); },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Reel> }) => {
      const { error: e } = await db.from("reels").update(values).eq("id", id);
      if (e) throw new Error(e.message);
    },
    onSuccess: refresh,
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const rows = reels.data ?? [];
  const sel = useSelection();
  useDropMissing(sel, rows.map((r) => r.id));
  const bulk = useMutation({
    mutationFn: async (a: { ids: string[]; action: "show" | "hide" | "delete" }) => {
      if (a.action === "delete") {
        for (const r of rows.filter((x) => a.ids.includes(x.id))) await remove.mutateAsync(r);
      } else {
        const { error: e } = await db.from("reels").update({ active: a.action === "show" }).in("id", a.ids);
        if (e) throw new Error(e.message);
      }
      return a;
    },
    onSuccess: (a) => {
      refresh();
      sel.clear();
      if (a.action !== "delete") toast.success(a.action === "show" ? "Reels shown on the website" : "Reels hidden");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });
  function move(i: number, dir: -1 | 1) {
    const a = rows[i];
    const b = rows[i + dir];
    if (!a || !b) return;
    // Give both a clean, distinct order so repeated moves always work.
    const base = rows.map((r, n) => ({ id: r.id, order: (n + 1) * 10 }));
    base[i]!.order = (i + dir + 1) * 10;
    base[i + dir]!.order = (i + 1) * 10;
    base.forEach((r) => {
      const was = rows.find((x) => x.id === r.id)!;
      if (was.sort_order !== r.order) patch.mutate({ id: r.id, values: { sort_order: r.order } });
    });
  }

  return (
    <AdminShell title="Reels" actions={<Btn variant="primary" onClick={() => { setError(null); setDraft({ ...empty, sort_order: (rows.length + 1) * 10 }); }}><Plus className="size-3.5" /> Add reel</Btn>}>
      <p className="mb-3 max-w-2xl text-[13px] text-[#616161]">
        Reels appear in the “Follow the {brand.name} journey” section on the home page. Upload a short vertical video (MP4 or WebM, up to {Math.round(MAX_VIDEO_BYTES / 1048576)} MB) and choose the product it links to, so visitors can buy straight after watching.
      </p>

      <ReelsLayoutCard />

      {draft ? (
        <Card title={draft.id ? "Edit reel" : "New reel"} className="mb-4">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div>
              <div className="aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-[12px] bg-[#f1f1f1]">
                {draft.video_url ? (
                  <video src={draft.video_url} poster={draft.poster_url || undefined} controls muted playsInline className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center p-4 text-center text-xs text-[#616161]">No video yet</div>
                )}
              </div>
              <input ref={fileInput} type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Btn className="mt-2" disabled={progress !== null} onClick={() => fileInput.current?.click()}>
                <Upload className="size-3.5" /> {draft.video_url ? "Replace video" : "Upload video"}
              </Btn>
              <Btn className="mt-2 ml-2" disabled={progress !== null} onClick={() => setPickingVideo(true)}>Choose from Media</Btn>
              {pickingVideo ? (
                <MediaPicker kind="video" title="Choose a video" onClose={() => setPickingVideo(false)} onPick={(urls) => { setPickingVideo(false); if (urls[0]) setDraft((d) => (d ? { ...d, video_url: urls[0]! } : d)); }} />
              ) : null}
              {progress !== null ? (
                <div className="mt-2 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-[#e3e3e3]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-[#303030] transition-all" style={{ width: `${progress}%` }} />
                </div>
              ) : null}
            </div>

            <div className="grid content-start gap-3">
              <Field label="Title (optional)" help="Shown on the reel, e.g. “Styling our oxidised choker”.">
                <input className={adminInput} value={draft.title} maxLength={160} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label="Product to link" help="The reel shows this product’s photo, name and price and a button that opens it.">
                <select className={adminInput} value={draft.product_id} onChange={(e) => setDraft({ ...draft, product_id: e.target.value })}>
                  <option value="">— No product (use a custom link) —</option>
                  {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              {!draft.product_id ? (
                <Field label="Custom link" help="Optional. A page on this site such as /collection/new-arrivals or /shop.">
                  <input className={adminInput} value={draft.link_url} placeholder="/material/oxidised" onChange={(e) => setDraft({ ...draft, link_url: e.target.value })} />
                </Field>
              ) : null}
              <Field label="Button text">
                <input className={adminInput} value={draft.link_label} maxLength={60} onChange={(e) => setDraft({ ...draft, link_label: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Order" help="Smaller numbers come first.">
                  <input type="number" className={adminInput} value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
                </Field>
                <label className="flex items-center gap-2 pt-6 text-[13px]">
                  <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Show on website
                </label>
              </div>
              {error ? <p role="alert" className="text-[13px] text-[#8e1f0b]">{error}</p> : null}
              <div className="flex gap-2">
                <Btn variant="primary" disabled={save.isPending || progress !== null} onClick={() => save.mutate(draft)}>{save.isPending ? "Saving…" : "Save reel"}</Btn>
                <Btn onClick={() => { setDraft(null); setError(null); }}>Cancel</Btn>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {reels.isPending ? (
        <TilesSkeleton count={8} />
      ) : rows.length === 0 ? (
        <Card>
          <div className="px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">No reels yet</p>
            <p className="mt-1 text-[13px] text-[#616161]">Add your first reel and it will appear on the home page.</p>
          </div>
        </Card>
      ) : (
        <>
        <Card flush className="mb-3">
          <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#303030]" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={() => sel.setMany(rows.map((r) => r.id), !rows.every((r) => sel.has(r.id)))} /> Select all</label>
            <span className="text-[#616161]">Tick reels to show, hide or delete several at once.</span>
          </div>
          <BulkBar sel={sel}>
            <Btn disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: [...sel.selected], action: "show" })}>Show on website</Btn>
            <Btn disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: [...sel.selected], action: "hide" })}>Hide</Btn>
            <Btn disabled={bulk.isPending} className="!text-[#8e1f0b]" onClick={() => { const ids = [...sel.selected]; if (window.confirm(`Delete ${ids.length} reel${ids.length === 1 ? "" : "s"} and their videos?`)) bulk.mutate({ ids, action: "delete" }); }}><Trash2 className="size-3.5" />Delete</Btn>
          </BulkBar>
        </Card>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Card className={`relative overflow-hidden ${sel.has(r.id) ? "ring-2 ring-[#303030]" : ""}`} flush>
                <input type="checkbox" aria-label={`Select ${r.title || "reel"}`} checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} className="absolute left-2 top-2 z-10 size-5 accent-[#303030]" />
                <div className="relative aspect-[9/16] max-h-[300px] w-full bg-[#f1f1f1]">
                  <video src={r.video_url} poster={r.poster_url ?? undefined} muted playsInline preload="metadata" className="size-full object-cover" />
                  {gone.has(r.video_url) ? (
                    <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#fff4f4]/95 p-3 text-center text-xs text-[#8e1f0b]">
                      <TriangleAlert className="size-5" />
                      <span className="font-semibold">Video file is missing</span>
                      <span>It is not on the server any more, so this reel does not play on the website. Press Edit and upload the video again.</span>
                    </div>
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="truncate text-[13px] font-semibold">{r.title || "Untitled reel"}</p>
                  <p className="mt-0.5 truncate text-xs text-[#616161]">
                    {r.product_id ? `→ ${nameOf(r.product_id) ?? "Product"}` : r.link_url ? `→ ${r.link_url}` : "No link"}
                    {!r.active ? " · Hidden" : ""}
                  </p>
                  <div className="mt-2 flex items-center gap-0.5">
                    <IconBtn icon={ArrowUp} label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} />
                    <IconBtn icon={ArrowDown} label="Move later" disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
                    <IconBtn icon={r.active ? Eye : EyeOff} label={r.active ? "Hide from website" : "Show on website"} onClick={() => patch.mutate({ id: r.id, values: { active: !r.active } })} />
                    <IconBtn icon={Pencil} label="Edit" onClick={() => { setError(null); setDraft({ id: r.id, title: r.title ?? "", video_url: r.video_url, poster_url: r.poster_url ?? "", product_id: r.product_id ?? "", link_url: r.link_url ?? "", link_label: r.link_label, active: r.active, sort_order: r.sort_order }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                    <IconBtn icon={Trash2} label="Delete" tone="danger" onClick={() => { if (window.confirm("Delete this reel and its video?")) remove.mutate(r); }} />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        </>
      )}
    </AdminShell>
  );
}
