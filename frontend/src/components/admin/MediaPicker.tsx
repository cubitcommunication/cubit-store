import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileText, Loader2, Music, Play, UploadCloud, X } from "lucide-react";
import { Btn, adminInput } from "@/components/admin/ui";
import {
  ACCEPT, USAGE_LABEL, formatSize, mediaListQuery, uploadToLibrary,
  type MediaItem, type MediaStats,
} from "@/lib/media-library";
import { cn } from "@/lib/utils";

/** A square preview: the picture, the first frame of a video, or an icon for PDFs and audio. */
export function MediaThumb({ item, className }: { item: MediaItem; className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-[#f1f1f1]", className)}>
      {item.kind === "image" ? (
        <img src={item.url} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
      ) : item.kind === "video" ? (
        <>
          <video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />
          <span className="absolute flex size-8 items-center justify-center rounded-full bg-black/55 text-white"><Play className="size-4 translate-x-px fill-current" /></span>
        </>
      ) : item.kind === "pdf" ? (
        <div className="flex flex-col items-center gap-1 text-[#8e1f0b]"><FileText className="size-9" /><span className="text-[11px] font-bold">PDF</span></div>
      ) : item.kind === "audio" ? (
        <Music className="size-9 text-[#616161]" />
      ) : (
        <FileText className="size-9 text-[#616161]" />
      )}
    </div>
  );
}

/** "Used in" dropdown: product photos, reels, blog, each page by name, website pictures... */
export function UsageSelect({ value, onChange, stats, className }: { value: string; onChange: (v: string) => void; stats: MediaStats | undefined; className?: string }) {
  const count = (k: string) => stats?.uses[k] ?? 0;
  const simple = ["products", "reels", "blog", "website", "collections"] as const;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Used in" className={cn(adminInput, "!w-auto", className)}>
      <option value="">Used anywhere</option>
      {simple.map((k) => <option key={k} value={k}>{USAGE_LABEL[k]} ({count(k)})</option>)}
      <option value="pages">{USAGE_LABEL["pages"]} ({count("pages")})</option>
      {(stats?.pages.length ?? 0) > 0 ? (
        <optgroup label="A single page">
          {stats!.pages.map((p) => <option key={p.id} value={`page:${p.id}`}>{p.title} ({count(`page:${p.id}`)})</option>)}
        </optgroup>
      ) : null}
      <option value="unused">{USAGE_LABEL["unused"]} ({count("unused")})</option>
    </select>
  );
}

/**
 * "Choose from Media" window: browse, search and filter every file, upload new ones, and pick one
 * (or several). Used by the page builder, product form, collections, reels and blog posts.
 */
export function MediaPicker({
  kind = "image", multiple = false, title, onPick, onClose,
}: {
  kind?: "image" | "video" | "any";
  multiple?: boolean;
  title?: string;
  onPick: (urls: string[]) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [usage, setUsage] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const accept = kind === "video" ? "video/mp4,video/webm,video/quicktime" : kind === "image" ? "image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml,.svg" : ACCEPT;

  useEffect(() => {
    const t = window.setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useQuery(mediaListQuery({ q, kind: kind === "any" ? "" : kind, usage, folder: "", sort: "newest", page }));
  const items = list.data?.items ?? [];

  const choose = (url: string) => {
    if (!multiple) {
      setChosen([url]);
      return;
    }
    setChosen((c) => (c.includes(url) ? c.filter((x) => x !== url) : [...c, url]));
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const done: string[] = [];
    for (const file of Array.from(files)) {
      setBusy(0);
      try {
        done.push(await uploadToLibrary(file, setBusy));
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "Upload failed."}`);
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    if (!done.length) return;
    await qc.invalidateQueries({ queryKey: ["admin", "media"] });
    // A just-uploaded file is what the owner wants: use it straight away.
    if (!multiple) onPick(done.slice(0, 1));
    else setChosen((c) => [...c, ...done]);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-5" role="dialog" aria-modal="true" aria-label={title ?? "Choose from Media"}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="admin-ui relative flex h-full w-full max-w-[980px] flex-col overflow-hidden bg-white text-[#303030] shadow-2xl sm:h-[min(720px,100%)] sm:rounded-[14px]">
        <header className="flex flex-wrap items-center gap-2 border-b border-[#e3e3e3] px-4 py-3">
          <h2 className="mr-auto text-[15px] font-semibold">{title ?? (kind === "video" ? "Choose a video" : "Choose from Media")}</h2>
          <input ref={input} type="file" accept={accept} multiple={multiple} className="sr-only" tabIndex={-1} onChange={(e) => void upload(e.target.files)} />
          <Btn onClick={() => input.current?.click()} disabled={busy !== null}>
            {busy !== null ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />} {busy !== null ? `Uploading ${busy}%` : "Upload new"}
          </Btn>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-[#f1f1f1]"><X className="size-4" /></button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e3e3] bg-[#fafafa] px-4 py-2.5">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" aria-label="Search files" className={cn(adminInput, "!w-48")} />
          <UsageSelect value={usage} onChange={(v) => { setUsage(v); setPage(1); }} stats={list.data?.stats} />
          <span className="ml-auto text-xs text-[#616161]">{list.data?.total ?? 0} {list.data?.total === 1 ? "file" : "files"}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {list.isPending ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-square skel rounded-lg bg-[#ebebeb]" />)}</div>
          ) : list.isError ? (
            <p className="py-10 text-center text-[13px] text-[#616161]">Could not load the files. <button type="button" className="text-[#005bd3] underline" onClick={() => void list.refetch()}>Try again</button></p>
          ) : !items.length ? (
            <div className="py-12 text-center text-[13px] text-[#616161]">
              <p className="font-semibold text-[#303030]">{q || usage ? "No files match" : "No files yet"}</p>
              <p className="mt-1 text-xs">{q || usage ? "Try another word or filter." : "Use “Upload new” to add your first file."}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item) => {
                const on = chosen.includes(item.url);
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => choose(item.url)}
                      onDoubleClick={() => { if (!multiple) onPick([item.url]); }}
                      aria-pressed={on}
                      aria-label={item.name}
                      className={cn("relative block w-full overflow-hidden rounded-lg border bg-white text-left", on ? "border-[#005bd3] ring-2 ring-[#005bd3]/40" : "border-[#e3e3e3] hover:border-[#8a8a8a]")}
                    >
                      <MediaThumb item={item} className="aspect-square w-full" />
                      {on ? <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-[#005bd3] text-white"><Check className="size-3" /></span> : null}
                      <span className="block border-t border-[#ebebeb] px-1.5 py-1">
                        <span className="block truncate text-[11px] font-medium">{item.name}</span>
                        <span className="block text-[10px] text-[#616161]">{formatSize(item.size)}{item.uses[0] && item.uses[0] !== "unused" ? "" : item.uses[0] === "unused" ? " · not used" : ""}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-[#e3e3e3] px-4 py-3">
          {(list.data?.pages ?? 1) > 1 ? (
            <div className="flex items-center gap-2 text-[13px]">
              <Btn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <span className="text-[#616161]">{list.data?.page} / {list.data?.pages}</span>
              <Btn disabled={page >= (list.data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          ) : null}
          <span className="ml-auto text-xs text-[#616161]">{chosen.length ? `${chosen.length} selected` : multiple ? "Select one or more" : "Click a file, then Choose"}</span>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!chosen.length} onClick={() => onPick(chosen)}>{multiple && chosen.length > 1 ? `Add ${chosen.length} files` : "Choose"}</Btn>
        </footer>
      </div>
    </div>
  );
}

/** A small "Choose from Media" button for plain address fields (social images and the like). */
export function ChooseFromMedia({ onPick, kind = "image", label = "Choose from Media" }: { onPick: (url: string) => void; kind?: "image" | "video" | "any"; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 inline-flex items-center rounded-lg border border-[#c9c9c9] bg-white px-2.5 py-1 text-xs font-semibold text-[#303030] hover:bg-[#f7f7f7]">{label}</button>
      {open ? <MediaPicker kind={kind} onClose={() => setOpen(false)} onPick={(urls) => { setOpen(false); if (urls[0]) onPick(urls[0]); }} /> : null}
    </>
  );
}
