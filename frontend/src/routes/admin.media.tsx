import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, FileText, Image as ImageIcon, Loader2, Music, Play, Trash2, UploadCloud, X } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { MediaThumb, UsageSelect } from "@/components/admin/MediaPicker";
import { Badge, Btn, Card, adminInput } from "@/components/admin/ui";
import { api } from "@/lib/api";
import {
  ACCEPT, FOLDER_LABEL, KIND_LABEL, USAGE_LABEL, formatSize, mediaListQuery, uploadToLibrary,
  type MediaItem, type MediaUse, type MissingFile, type StorageInfo,
} from "@/lib/media-library";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/media")({
  head: () => ({ meta: [{ title: `Media — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: MediaPage,
});

type Upload = { id: number; name: string; progress: number; error: string | null; done: boolean };
let uploadId = 0;

/** A short "where is it used" line for a card, e.g. "Product photos" or "Home page". */
function useLabel(item: MediaItem, pageNames: Map<string, string>): string {
  const names = item.uses.map((u) => (u.startsWith("page:") ? pageNames.get(u.slice(5)) : null)).filter(Boolean) as string[];
  if (names.length) return names.slice(0, 2).join(", ");
  const first = item.uses.find((u) => USAGE_LABEL[u] && u !== "pages");
  return first ? USAGE_LABEL[first]! : item.uses.includes("pages") ? "Pages" : "";
}

/** Files the website points at that are not on the server, so they show as broken pictures or videos. */
function MissingFiles({ files, pageNames, storage }: { files: MissingFile[]; pageNames: Map<string, string>; storage: StorageInfo | null }) {
  const where = (uses: string[]) => {
    const names = uses.map((u) => (u.startsWith("page:") ? pageNames.get(u.slice(5)) : null)).filter(Boolean) as string[];
    const labels = uses.filter((u) => USAGE_LABEL[u] && u !== "pages" && u !== "orders").map((u) => USAGE_LABEL[u]!);
    return [...names, ...labels].join(", ") || "Pages";
  };
  return (
    <div role="alert" className="mb-4 rounded-[12px] border border-[#ffd79d] bg-[#fff7e6] px-4 py-3 text-[13px] text-[#5e4200]">
      <p className="font-semibold">{files.length} {files.length === 1 ? "file" : "files"} used on your website {files.length === 1 ? "is" : "are"} missing from the server</p>
      <p className="mt-1 text-xs">
        These are shown as broken pictures or videos on the website, and that is why they are not listed below: the files themselves are no longer in the uploads folder{storage ? <> (<code className="break-all">{storage.root}</code>)</> : null}.
        Upload them again where they are used (for a reel, edit the reel and upload its video), or copy the old <code>media</code> folder back onto the server.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold">Show the list</summary>
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
          {files.map((f) => (<li key={f.url} className="flex flex-wrap gap-x-2"><span className="font-medium">{where(f.uses)}</span><span className="break-all text-[#8a6d1f]">{f.name}</span></li>))}
        </ul>
      </details>
    </div>
  );
}

function MediaPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [usage, setUsage] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = window.setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const list = useQuery(mediaListQuery({ q, kind, usage, folder: "", sort, page }));
  const items = list.data?.items ?? [];
  const stats = list.data?.stats;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "media"] });

  async function addFiles(files: FileList | File[]) {
    const queue = Array.from(files);
    if (!queue.length) return;
    const entries = queue.map((f) => ({ id: ++uploadId, file: f }));
    setUploads((u) => [...entries.map((e) => ({ id: e.id, name: e.file.name, progress: 0, error: null, done: false })), ...u]);
    let ok = 0;
    let next = 0;
    const patch = (id: number, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...p } : x)));
    // Two at a time keeps a slow connection moving without flooding the server.
    const worker = async () => {
      while (next < entries.length) {
        const e = entries[next++]!;
        try {
          await uploadToLibrary(e.file, (progress) => patch(e.id, { progress }));
          patch(e.id, { progress: 100, done: true });
          ok++;
        } catch (err) {
          patch(e.id, { error: err instanceof Error ? err.message : "Upload failed." });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    await refresh();
    if (ok) toast.success(ok === 1 ? "File uploaded" : `${ok} files uploaded`);
    if (ok < entries.length) toast.error(`${entries.length - ok} could not be uploaded. See the list for the reason.`);
    window.setTimeout(() => setUploads((u) => u.filter((x) => x.error)), 3500);
  }

  const remove = useMutation({
    mutationFn: (urls: string[]) => api<{ deleted: string[]; blocked: { url: string; uses: MediaUse[] }[] }>("/admin/media/delete", { method: "POST", body: { urls } }),
    onSuccess: async (res) => {
      if (res.deleted.length) toast.success(res.deleted.length === 1 ? "File deleted" : `${res.deleted.length} files deleted`);
      if (res.blocked.length) {
        const first = res.blocked[0]!;
        toast.error(
          `${res.blocked.length} ${res.blocked.length === 1 ? "file was" : "files were"} not deleted because ${res.blocked.length === 1 ? "it is" : "they are"} still in use (${first.uses.map((u) => `${u.label}: ${u.count}`).join(", ")}${res.blocked.length > 1 ? "…" : ""}).`,
        );
      }
      setSelected(new Set());
      setOpen(null);
      await refresh();
    },
    onError: () => toast.error("Could not delete. Please try again."),
  });

  const confirmDelete = (urls: string[]) => {
    if (window.confirm(urls.length === 1 ? "Delete this file? Files that are still used on the website are kept." : `Delete ${urls.length} files? Files that are still used on the website are kept.`)) remove.mutate(urls);
  };

  const toggle = (url: string) => setSelected((s) => { const n = new Set(s); if (n.has(url)) n.delete(url); else n.add(url); return n; });
  const allOnPage = items.length > 0 && items.every((i) => selected.has(i.url));

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const pageNames = new Map((stats?.pages ?? []).map((p) => [p.id, p.title]));
  const kinds = (["image", "video", "pdf", "audio"] as const).filter((k) => (stats?.kinds[k] ?? 0) > 0);

  return (
    <AdminShell
      title="Media"
      actions={
        <>
          <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
          <Btn variant="primary" onClick={() => input.current?.click()}><UploadCloud className="size-4" /> Upload files</Btn>
        </>
      }
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
        onDrop={onDrop}
        className="relative"
      >
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[12px] border-2 border-dashed border-[#005bd3] bg-[#005bd3]/10">
            <p className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-[#005bd3] shadow">Drop files to upload</p>
          </div>
        ) : null}

        <p className="-mt-2 mb-4 text-[13px] text-[#616161]">
          Every picture, video and file on your website in one place: product photos, banners, reels and anything you add here. Upload JPG, PNG, WebP, AVIF, GIF, SVG, PDF, MP4, WebM, MOV or MP3, then copy the address to use it anywhere. Files that are still in use cannot be deleted.
        </p>

        {list.data?.storage && (list.data.storage.insideApp || !list.data.storage.exists || !list.data.storage.writable) ? (
          <div role="alert" className="mb-4 rounded-[12px] border border-[#f3c5c0] bg-[#fff4f4] px-4 py-3 text-[13px] text-[#8e1f0b]">
            <p className="font-semibold">The uploads folder needs attention</p>
            <p className="mt-1 text-xs">
              {list.data.storage.insideApp ? "Files are being saved inside the website's program folder, which is replaced every time the site is updated, so uploads can disappear. " : ""}
              {!list.data.storage.exists ? "The folder does not exist. " : !list.data.storage.writable ? "The folder cannot be written to. " : ""}
              Folder in use: <code className="break-all">{list.data.storage.root}</code>. Ask your developer to point it at the website's public <code>media</code> folder.
            </p>
          </div>
        ) : null}

        {list.data?.missing.length ? <MissingFiles files={list.data.missing} pageNames={pageNames} storage={list.data.storage} /> : null}

        {uploads.length ? (
          <Card className="mb-4" title="Uploads">
            <ul className="space-y-2">
              {uploads.map((u) => (
                <li key={u.id} className="text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{u.name}</span>
                    {u.error ? <Badge tone="critical">Failed</Badge> : u.done ? <Badge tone="success">Done</Badge> : <span className="flex items-center gap-1.5 text-xs text-[#616161]"><Loader2 className="size-3.5 animate-spin" /> {u.progress}%</span>}
                  </div>
                  {u.error ? <p role="alert" className="mt-0.5 text-xs text-[#8e1f0b]">{u.error}</p> : <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#e3e3e3]"><div className="h-full bg-[#303030] transition-[width]" style={{ width: `${u.progress}%` }} /></div>}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card flush>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="File type">
              {([["", "All", stats?.files ?? 0], ...kinds.map((k) => [k, KIND_LABEL[k], stats?.kinds[k] ?? 0] as const)] as [string, string, number][]).map(([id, label, count]) => (
                <button
                  key={id || "all"}
                  type="button"
                  aria-pressed={kind === id}
                  onClick={() => { setKind(id); setPage(1); }}
                  className={cn("rounded-lg px-2.5 py-1.5 text-[13px] font-medium", kind === id ? "bg-[#303030] text-white" : "bg-[#f1f1f1] text-[#303030] hover:bg-[#e3e3e3]")}
                >
                  {label} <span className="opacity-70">{count}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" aria-label="Search files" className={cn(adminInput, "!w-44")} />
              <UsageSelect value={usage} onChange={(v) => { setUsage(v); setPage(1); }} stats={stats} />
              <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort" className={cn(adminInput, "!w-auto")}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
                <option value="size">Largest first</option>
              </select>
            </div>
          </div>

          {selected.size ? (
            <div className="flex flex-wrap items-center gap-3 border-y border-[#e3e3e3] bg-[#f7f7f7] px-4 py-2 text-[13px]">
              <span className="font-semibold">{selected.size} selected</span>
              <Btn variant="danger" disabled={remove.isPending} onClick={() => confirmDelete([...selected])}><Trash2 className="size-3.5" /> Delete</Btn>
              <Btn variant="plain" onClick={() => setSelected(new Set())}>Clear</Btn>
            </div>
          ) : items.length ? (
            <div className="flex items-center gap-2 border-y border-[#e3e3e3] bg-[#fafafa] px-4 py-2 text-[12px] text-[#616161]">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(items.map((i) => i.url)))} className="size-4" />
                Select all on this page
              </label>
              <span className="ml-auto">{list.data?.total ?? 0} {list.data?.total === 1 ? "file" : "files"}{stats ? ` · ${formatSize(stats.bytes)} in total` : ""}</span>
            </div>
          ) : null}

          <div className="p-4">
            {list.isPending ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square skel rounded-lg bg-[#ebebeb]" />)}
              </div>
            ) : list.isError ? (
              <div className="py-10 text-center text-[13px] text-[#616161]">
                Could not load the files. <button type="button" className="text-[#005bd3] underline" onClick={() => void list.refetch()}>Try again</button>
              </div>
            ) : !items.length ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <ImageIcon className="size-10 text-[#8a8a8a]" />
                <p className="text-[13px] font-semibold">{q || kind || usage ? "No files match your search" : "No files yet"}</p>
                <p className="max-w-sm text-xs text-[#616161]">{q || kind || usage ? "Try a different word or clear the filters." : "Upload pictures, videos or PDFs, or drag and drop them anywhere on this page."}</p>
                {!(q || kind || usage) ? <Btn variant="primary" onClick={() => input.current?.click()}><UploadCloud className="size-4" /> Upload files</Btn> : null}
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {items.map((item) => {
                  const on = selected.has(item.url);
                  return (
                    <li key={item.key} className="group relative">
                      <button
                        type="button"
                        onClick={() => setOpen(item)}
                        aria-label={`Open ${item.name}`}
                        className={cn("block w-full overflow-hidden rounded-lg border bg-white text-left transition-shadow hover:shadow-md", on ? "border-[#005bd3] ring-2 ring-[#005bd3]/30" : "border-[#e3e3e3]")}
                      >
                        <MediaThumb item={item} className="aspect-square w-full" />
                        <span className="block border-t border-[#ebebeb] px-2 py-1.5">
                          <span className="block truncate text-xs font-medium">{item.name}</span>
                          <span className="block text-[11px] text-[#616161]">{item.ext.toUpperCase()} · {formatSize(item.size)}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#8a8a8a]">{useLabel(item, pageNames)}</span>
                        </span>
                      </button>
                      <label className={cn("absolute left-2 top-2 flex size-6 cursor-pointer items-center justify-center rounded-md border bg-white shadow-sm", on ? "border-[#005bd3]" : "border-[#c9c9c9] opacity-0 focus-within:opacity-100 group-hover:opacity-100", selected.size && "opacity-100")}>
                        <input type="checkbox" checked={on} onChange={() => toggle(item.url)} aria-label={`Select ${item.name}`} className="size-4" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {(list.data?.pages ?? 1) > 1 ? (
            <div className="flex items-center justify-center gap-3 border-t border-[#e3e3e3] px-4 py-3 text-[13px]">
              <Btn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <span className="text-[#616161]">Page {list.data?.page} of {list.data?.pages}</span>
              <Btn disabled={page >= (list.data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          ) : null}
        </Card>
      </div>

      {open ? <Details item={open} onClose={() => setOpen(null)} onDelete={() => confirmDelete([open.url])} deleting={remove.isPending} /> : null}
    </AdminShell>
  );
}

function Details({ item, onClose, onDelete, deleting }: { item: MediaItem; onClose: () => void; onDelete: () => void; deleting: boolean }) {
  const [copied, setCopied] = useState(false);
  const usage = useQuery({
    queryKey: ["admin", "media", "usage", item.url],
    queryFn: () => api<{ uses: MediaUse[] }>("/admin/media/usage", { method: "POST", body: { url: item.url } }),
    staleTime: 0,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const full = typeof window === "undefined" ? item.url : `${window.location.origin}${item.url}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy. Select the address and copy it by hand.");
    }
  };

  const rows: [string, string][] = [
    ["Type", item.ext.toUpperCase()],
    ["Size", formatSize(item.size)],
    ...(item.width && item.height ? [["Dimensions", `${item.width} × ${item.height} px`] as [string, string]] : []),
    ["Added", new Date(item.modified * 1000).toLocaleString()],
    ["Source", FOLDER_LABEL[item.folder] ?? item.folder],
  ];
  const uses = usage.data?.uses ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={item.name}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <aside className="relative flex h-full w-full max-w-[420px] flex-col overflow-y-auto bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-[#e3e3e3] px-4 py-3">
          <h2 className="min-w-0 truncate text-[14px] font-semibold">{item.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-[#f1f1f1]"><X className="size-4" /></button>
        </header>

        <div className="space-y-4 p-4">
          <div className="overflow-hidden rounded-lg border border-[#e3e3e3] bg-[#f1f1f1]">
            {item.kind === "image" ? <img src={item.url} alt="" className="mx-auto max-h-[300px] w-auto max-w-full object-contain" />
              : item.kind === "video" ? <video src={item.url} controls preload="metadata" className="max-h-[300px] w-full bg-black" />
              : item.kind === "audio" ? <div className="p-6"><audio src={item.url} controls className="w-full" /></div>
              : <MediaThumb item={item} className="h-40 w-full" />}
          </div>

          <div>
            <p className="text-xs font-medium text-[#616161]">File address</p>
            <div className="mt-1 flex gap-2">
              <input readOnly value={full} onFocus={(e) => e.currentTarget.select()} aria-label="File address" className={adminInput} />
              <Btn onClick={() => void copy()}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}</Btn>
            </div>
          </div>

          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
            {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-[#616161]">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>))}
          </dl>

          <div>
            <p className="text-xs font-medium text-[#616161]">Where it is used</p>
            {usage.isPending ? <p className="mt-1 text-[13px] text-[#616161]">Checking…</p>
              : uses.length ? (
                <ul className="mt-1.5 space-y-1">
                  {uses.map((u) => (<li key={u.label} className="flex items-center justify-between text-[13px]"><span>{u.label}</span><Badge tone="info">{u.count}</Badge></li>))}
                </ul>
              ) : <p className="mt-1 text-[13px] text-[#616161]">Not used anywhere. It is safe to delete.</p>}
          </div>
        </div>

        <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-[#e3e3e3] p-4">
          <a href={item.url} download={item.name} className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9c9] bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-[#f7f7f7]"><Download className="size-3.5" /> Download</a>
          <Btn variant="danger" className="ml-auto" disabled={deleting || uses.length > 0} onClick={onDelete} title={uses.length ? "This file is still in use" : undefined}><Trash2 className="size-3.5" /> Delete</Btn>
        </footer>
      </aside>
    </div>
  );
}
