import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fetchSiteSettings } from "@/lib/site-settings";
import { fetchSiteMedia } from "@/lib/site-media";
import { isSectionType, seedBlocks, seedContent } from "@/lib/section-content";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, EyeOff, ExternalLink, GripVertical, Layers, Monitor, Plus, Redo2, Smartphone, Tablet, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { BlockForm, ImageField, StyleForm } from "@/components/admin/PageBlockForms";
import { Badge, Btn, Field, IconBtn, adminInput } from "@/components/admin/ui";
import { db } from "@/lib/data";
import {
  BLOCK_LABELS,
  libraryFor,
  isSystemKind,
  parseTags,
  SYSTEM_PAGES,
  NOT_IN_COLUMNS,
  blankBlock,
  duplicateBlock,
  findBlock,
  insertBlock,
  moveBlock,
  relocateBlock,
  removeBlock,
  slugify,
  updateBlock,
  type Block,
  type ColumnsLayout,
  type Device,
  type PageRow,
  type Target,
} from "@/lib/pages";
import { cn } from "@/lib/utils";
import { LoadingRows } from "@/components/ui/loading-rows";

type Hist = { past: Block[][]; present: Block[]; future: Block[][] };
type Rect = { id: string; top: number; bottom: number };
type Spec = { type: Block["type"]; layout?: ColumnsLayout | undefined };

/** Width the site is laid out at in each preview. Desktop is a real 1280 px layout, scaled down to fit the editor. */
const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, tablet: 768, mobile: 390 };
const OWN_SPACING = new Set<Block["type"]>(["hero", "spacer"]);

/** A short hint shown beside the block name in the Layers list. */
function hint(b: Block): string {
  switch (b.type) {
    case "hero":
    case "text":
    case "image_text":
    case "cta":
    case "faq":
    case "features":
    case "products":
      return b.heading;
    case "button":
      return b.label;
    case "image":
      return b.alt;
    case "video":
      return b.caption;
    case "columns":
      return `${b.columns.length} columns`;
    case "team":
      return b.heading;
    case "spacer":
      return `${b.height}px`;
    default:
      return "";
  }
}

export function PageBuilder({ page }: { page: PageRow }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [published, setPublished] = useState(page.published);
  const [seoTitle, setSeoTitle] = useState(page.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(page.seo_description ?? "");
  const [seoImage, setSeoImage] = useState(page.seo_image_url ?? "");
  const isSystem = isSystemKind(page.kind);
  const isPost = page.kind === "post";
  const isPolicy = page.kind === "policy";
  const [excerpt, setExcerpt] = useState(page.excerpt ?? "");
  const [cover, setCover] = useState(page.cover_url ?? "");
  const [author, setAuthor] = useState(page.author ?? "");
  const [tags, setTags] = useState(page.tags ?? "");
  const [postDate, setPostDate] = useState((page.published_at ?? "").slice(0, 10));
  const systemMeta = SYSTEM_PAGES.find((p) => p.kind === page.kind);
  const library = libraryFor(page.kind);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [hist, setHist] = useState<Hist>({ past: [], present: page.blocks ?? [], future: [] });
  const histRef = useRef(hist);
  histRef.current = hist;
  const lastEdit = useRef({ key: "", t: 0 });
  const blocks = hist.present;

  // Give every site section its own text and pictures (copied from the shop settings the first time), so the page owns them.
  const settingsQ = useQuery({ queryKey: ["page-seed-settings"], queryFn: fetchSiteSettings, staleTime: 60_000 });
  const mediaQ = useQuery({ queryKey: ["page-seed-media"], queryFn: fetchSiteMedia, staleTime: 60_000 });
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !settingsQ.data || !mediaQ.data) return;
    seeded.current = true;
    const h = histRef.current;
    const next = seedBlocks(h.present, settingsQ.data, mediaQ.data);
    if (next === h.present) return;
    const nh: Hist = { ...h, present: next };
    histRef.current = nh;
    setHist(nh);
    setDirty(true);
  }, [settingsQ.data, mediaQ.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;
  const [leftTab, setLeftTab] = useState<"add" | "layers">("add");
  const [rightTab, setRightTab] = useState<"content" | "style">("content");
  const [device, setDevice] = useState<Device>("desktop");
  const [insertAt, setInsertAt] = useState<Target | null>(null);
  const [ready, setReady] = useState(false);
  const [layout, setLayout] = useState<{ blocks: Rect[]; scrollY: number }>({ blocks: [], scrollY: 0 });
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [layerDrag, setLayerDrag] = useState<string | null>(null);
  const [layerOver, setLayerOver] = useState<string | null>(null);

  const frame = useRef<HTMLIFrameElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const [avail, setAvail] = useState(900);
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = () => setAvail(Math.max(300, node.clientWidth - 32));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const target = DEVICE_WIDTH[device];
  const scale = Math.min(1, avail / target);
  const focusRef = useRef<string | null>(null);
  const cur = () => histRef.current.present;

  /* ------------------------------------------------------------ history */

  const commit = (next: Block[], key?: string) => {
    const h = histRef.current;
    if (next === h.present) return;
    const now = Date.now();
    const merge = Boolean(key) && lastEdit.current.key === key && now - lastEdit.current.t < 900;
    lastEdit.current = { key: key ?? "", t: now };
    const nextHist: Hist = { past: merge ? h.past : [...h.past.slice(-49), h.present], present: next, future: [] };
    histRef.current = nextHist;
    setHist(nextHist);
    setDirty(true);
  };
  const undo = () => {
    const h = histRef.current;
    if (!h.past.length) return;
    const next: Hist = { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] };
    histRef.current = next;
    lastEdit.current = { key: "", t: 0 };
    setHist(next);
    setDirty(true);
  };
  const redo = () => {
    const h = histRef.current;
    if (!h.future.length) return;
    const next: Hist = { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
    histRef.current = next;
    lastEdit.current = { key: "", t: 0 };
    setHist(next);
    setDirty(true);
  };

  const change = (id: string, patch: Record<string, unknown>) => commit(updateBlock(cur(), id, patch as Partial<Block>), `${id}:${Object.keys(patch).join(",")}`);

  /* ------------------------------------------------------------ canvas sync */

  const sync = () => {
    frame.current?.contentWindow?.postMessage({ type: "shop-page-preview", kind: page.kind, blocks: cur(), selectedId: selRef.current, focusId: focusRef.current }, window.location.origin);
    focusRef.current = null;
  };
  useEffect(() => {
    if (ready) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, blocks, selectedId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const d = event.data as { type?: string; id?: unknown; blocks?: unknown; scrollY?: unknown; index?: unknown; parentId?: unknown; col?: unknown } | null;
      switch (d?.type) {
        case "shop-page-ready":
          setReady(true);
          sync();
          break;
        case "shop-page-select":
          setSelectedId(typeof d.id === "string" ? d.id : null);
          if (typeof d.id === "string") setRightTab("content");
          setInsertAt(null);
          break;
        case "shop-page-layout":
          setLayout({ blocks: Array.isArray(d.blocks) ? (d.blocks as Rect[]) : [], scrollY: Number(d.scrollY) || 0 });
          break;
        case "shop-page-add":
          setInsertAt({ parentId: null, col: 0, index: Math.max(0, Number(d.index) || 0) });
          setLeftTab("add");
          break;
        case "shop-page-add-col": {
          const parent = typeof d.parentId === "string" ? findBlock(cur(), d.parentId)?.block : null;
          const col = Math.max(0, Number(d.col) || 0);
          if (parent?.type === "columns") {
            setInsertAt({ parentId: parent.id, col, index: parent.columns[col]?.length ?? 0 });
            setLeftTab("add");
          }
          break;
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/Cmd + Z, Shift + Ctrl/Cmd + Z, Ctrl/Cmd + Y (not while typing in a field: those have their own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ------------------------------------------------------------ actions */

  const select = (id: string | null, focus = false) => {
    setSelectedId(id);
    if (id) setRightTab("content");
    setInsertAt(null);
    if (id && focus) {
      focusRef.current = id;
      sync();
    }
  };

  function addBlock(spec: Spec, target?: Target) {
    let block = blankBlock(spec.type, spec.layout);
    if (isSectionType(block.type) && settingsQ.data && mediaQ.data) block = { ...block, content: seedContent(block.type, settingsQ.data, mediaQ.data) } as Block;
    let at: Target | null = target ?? insertAt;
    if (!at) {
      const sel = selRef.current ? findBlock(cur(), selRef.current) : null;
      at = sel ? { parentId: sel.parentId, col: sel.col, index: sel.index + 1 } : { parentId: null, col: 0, index: cur().length };
    }
    if (at.parentId !== null && NOT_IN_COLUMNS.includes(block.type)) {
      toast.info("This block can't go inside columns, so it was added below them.");
      const parent = findBlock(cur(), at.parentId);
      at = { parentId: null, col: 0, index: (parent?.index ?? cur().length - 1) + 1 };
    }
    commit(insertBlock(cur(), block, at));
    focusRef.current = block.id;
    setSelectedId(block.id);
    setRightTab("content");
    setInsertAt(null);
  }

  function removeSelected(id: string) {
    if (!window.confirm("Remove this block?")) return;
    commit(removeBlock(cur(), id));
    if (selRef.current === id) setSelectedId(null);
  }

  function duplicateSelected(id: string) {
    const result = duplicateBlock(cur(), id);
    if (!result.newId) return;
    commit(result.blocks);
    focusRef.current = result.newId;
    setSelectedId(result.newId);
  }

  function moveTo(id: string, at: Target) {
    const loc = findBlock(cur(), id);
    if (!loc) return;
    if (at.parentId !== null && NOT_IN_COLUMNS.includes(loc.block.type)) {
      toast.info("This block can't go inside columns.");
      return;
    }
    commit(relocateBlock(cur(), id, at));
  }

  async function save(nextPublished: boolean) {
    const cleanSlug = isSystem ? page.slug : slugify(slug);
    if (!title.trim()) return void toast.error("Please give the page a title (Page settings).");
    if (!cleanSlug) return void toast.error("Please give the page an address (Page settings).");
    setSaving(true);
    const { error } = await db
      .from("pages")
      .update({
        title: title.trim(),
        slug: cleanSlug,
        published: nextPublished,
        blocks: cur(),
        seo_title: seoTitle.trim() || null,
        seo_description: seoDescription.trim() || null,
        seo_image_url: seoImage.trim() || null,
        ...(isPost
          ? {
              excerpt: excerpt.trim() || null,
              cover_url: cover.trim() || null,
              author: author.trim() || null,
              tags: parseTags(tags).join(", ") || null,
              published_at: (postDate ? new Date(`${postDate}T09:00:00`) : new Date(page.published_at ?? Date.now())).toISOString().slice(0, 19).replace("T", " "),
            }
          : {}),
      })
      .eq("id", page.id);
    setSaving(false);
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message ?? "") ? "Another page or post already uses that address." : "Could not save. Please try again.");
      return;
    }
    setSlug(cleanSlug);
    setPublished(nextPublished);
    setDirty(false);
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["page"] });
    void qc.invalidateQueries({ queryKey: ["post"] });
    void qc.invalidateQueries({ queryKey: ["policy"] });
    void qc.invalidateQueries({ queryKey: ["policies"] });
    void qc.invalidateQueries({ queryKey: ["posts"] });
    toast.success(nextPublished ? (isSystem ? "Saved. Your design is now live on the site." : "Saved. The page is live.") : isSystem ? "Saved as a draft. The built-in design is showing on the site." : "Saved as a draft.");
  }

  const markDirty = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  /* ------------------------------------------------------------ drag from the library onto the canvas */

  const indexAt = (clientY: number): number => {
    const r = overlay.current?.getBoundingClientRect();
    if (!r) return blocks.length;
    const y = (clientY - r.top) / scale + layout.scrollY;
    let i = 0;
    for (const b of layout.blocks) {
      if ((b.top + b.bottom) / 2 < y) i++;
      else break;
    }
    return i;
  };
  const dropLineY = (): number | null => {
    if (dropIndex === null) return null;
    const prev = layout.blocks[dropIndex - 1];
    const next = layout.blocks[dropIndex];
    const docY = prev && next ? (prev.bottom + next.top) / 2 : prev ? prev.bottom : next ? next.top : 0;
    return (docY - layout.scrollY) * scale;
  };

  const selected = selectedId ? findBlock(blocks, selectedId) : null;
  const liveUrl = isSystem ? (systemMeta?.path ?? "/") : isPost ? `/blog/${slugify(slug)}` : isPolicy ? `/policies/${slugify(slug)}` : `/pages/${slugify(slug)}`;
  const backTo = isPost ? "/admin/blogs" : isPolicy ? "/admin/policies" : "/admin/pages";
  const backLabel = isPost ? "Blog posts" : isPolicy ? "Policies" : "Pages";
  const lineY = dropLineY();

  /* ------------------------------------------------------------ layers */

  function rows(list: Block[], parentId: string | null, col: number, depth: number): ReactNode {
    return list.map((b, index) => {
      const key = `row:${b.id}`;
      return (
        <div key={b.id}>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", b.id);
              e.dataTransfer.effectAllowed = "move";
              setLayerDrag(b.id);
            }}
            onDragEnd={() => {
              setLayerDrag(null);
              setLayerOver(null);
            }}
            onDragOver={(e) => {
              if (!layerDrag || layerDrag === b.id) return;
              e.preventDefault();
              setLayerOver(key);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (layerDrag && layerDrag !== b.id) moveTo(layerDrag, { parentId, col, index });
              setLayerDrag(null);
              setLayerOver(null);
            }}
            onClick={() => select(b.id, true)}
            style={{ paddingLeft: 8 + depth * 14 }}
            className={cn(
              "group flex cursor-pointer items-center gap-1 border-y border-transparent py-1 pr-1 text-[13px]",
              selectedId === b.id ? "bg-[#e8f0fe] font-semibold" : "hover:bg-[#f1f1f1]",
              layerOver === key && "border-t-[#2c6ecb]",
              b.hidden && "opacity-50",
            )}
          >
            <GripVertical className="size-3.5 shrink-0 cursor-grab text-[#8a8a8a]" aria-hidden="true" />
            <span className="shrink-0">{BLOCK_LABELS[b.type].label}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-normal text-[#616161]">{hint(b)}</span>
            <IconBtn icon={b.hidden ? EyeOff : Eye} label={b.hidden ? "Show block" : "Hide block"} className="size-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); change(b.id, { hidden: !b.hidden }); }} />
          </div>
          {b.type === "columns"
            ? b.columns.map((c, ci) => {
                const ckey = `col:${b.id}:${ci}`;
                return (
                  <div key={ci}>
                    <div
                      onDragOver={(e) => {
                        if (!layerDrag) return;
                        e.preventDefault();
                        setLayerOver(ckey);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (layerDrag) moveTo(layerDrag, { parentId: b.id, col: ci, index: c.length });
                        setLayerDrag(null);
                        setLayerOver(null);
                      }}
                      style={{ paddingLeft: 22 + depth * 14 }}
                      className={cn("flex items-center gap-1 border-y border-transparent py-0.5 pr-1 text-xs text-[#616161]", layerOver === ckey && "border-t-[#2c6ecb]")}
                    >
                      <span className="flex-1">Column {ci + 1}{c.length === 0 ? " (empty — drop here)" : ""}</span>
                      <IconBtn icon={Plus} label="Add to this column" className="size-6" onClick={() => { setInsertAt({ parentId: b.id, col: ci, index: c.length }); setLeftTab("add"); }} />
                    </div>
                    {rows(c, b.id, ci, depth + 2)}
                  </div>
                );
              })
            : null}
        </div>
      );
    });
  }

  /* ------------------------------------------------------------ render */

  return (
    <>
      <div className="admin-ui flex h-screen items-center justify-center bg-[#f1f1f1] p-8 text-center lg:hidden">
        <div>
          <p className="text-[15px] font-semibold">The page builder needs a bigger screen</p>
          <p className="mt-2 text-[13px] text-[#616161]">Open Admin → Pages on a laptop or desktop computer to edit this page.</p>
          <Link to={backTo} className="mt-4 inline-block text-[13px] text-[#005bd3] underline">Back to {backLabel.toLowerCase()}</Link>
        </div>
      </div>

      <div className="admin-ui hidden h-screen flex-col overflow-hidden bg-[#f1f1f1] text-[#303030] lg:flex">
        {/* top bar */}
        <header className="flex h-12 shrink-0 items-center gap-3 bg-[#1a1a1a] px-3 text-white">
          <Link
            to={backTo}
            onClick={(e) => {
              if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-white/10"
          >
            <ArrowLeft className="size-4" /> {backLabel}
          </Link>
          <span className="min-w-0 max-w-[260px] truncate text-[13px] font-semibold">{title || "Untitled page"}</span>
          {published ? <Badge tone="success">{isSystem ? "Live" : "Published"}</Badge> : <Badge tone="attention">{isSystem ? "Not live (built-in design showing)" : "Draft"}</Badge>}
          {dirty ? <span className="text-xs text-[#ffd166]">Unsaved changes</span> : null}

          <div className="mx-auto flex items-center gap-1 rounded-lg bg-white/10 p-0.5">
            {(
              [
                ["desktop", Monitor, "Desktop"],
                ["tablet", Tablet, "Tablet (768 px)"],
                ["mobile", Smartphone, "Mobile (390 px)"],
              ] as const
            ).map(([d, Icon, label]) => (
              <button key={d} type="button" title={label} aria-label={label} aria-pressed={device === d} onClick={() => setDevice(d)} className={cn("flex size-8 items-center justify-center rounded-md", device === d ? "bg-white text-[#1a1a1a]" : "hover:bg-white/15")}>
                <Icon className="size-4" />
              </button>
            ))}
          </div>

          <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!hist.past.length} onClick={undo} className="flex size-8 items-center justify-center rounded-md hover:bg-white/15 disabled:opacity-35"><Undo2 className="size-4" /></button>
          <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!hist.future.length} onClick={redo} className="flex size-8 items-center justify-center rounded-md hover:bg-white/15 disabled:opacity-35"><Redo2 className="size-4" /></button>

          {published && (!isSystem || systemMeta?.path) ? (
            <a href={liveUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-white/10"><ExternalLink className="size-3.5" /> View page</a>
          ) : null}
          <Btn disabled={saving} onClick={() => void save(false)} className="!border-white/30 !bg-transparent !text-white hover:!bg-white/10">{published ? (isSystem ? "Use built-in design" : "Unpublish") : "Save draft"}</Btn>
          <Btn variant="primary" disabled={saving || (published && !dirty)} onClick={() => void save(true)} className="!bg-[#2c6ecb] hover:!bg-[#2159a8]">{saving ? "Saving…" : published ? "Save changes" : isSystem ? "Publish this design" : "Publish"}</Btn>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* left: add + layers */}
          <aside className="flex w-[270px] shrink-0 flex-col border-r border-[#e3e3e3] bg-white">
            <div className="grid grid-cols-2 border-b border-[#e3e3e3] text-[13px] font-semibold">
              <button type="button" onClick={() => setLeftTab("add")} className={cn("flex items-center justify-center gap-1.5 py-2.5", leftTab === "add" ? "border-b-2 border-[#303030]" : "text-[#616161] hover:bg-[#f7f7f7]")}><Plus className="size-4" />Add</button>
              <button type="button" onClick={() => setLeftTab("layers")} className={cn("flex items-center justify-center gap-1.5 py-2.5", leftTab === "layers" ? "border-b-2 border-[#303030]" : "text-[#616161] hover:bg-[#f7f7f7]")}><Layers className="size-4" />Layers ({countAll(blocks)})</button>
            </div>

            {leftTab === "add" ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {insertAt ? (
                  <div className="mb-3 flex items-center justify-between rounded-lg bg-[#e8f0fe] px-3 py-2 text-xs">
                    <span>{insertAt.parentId ? `Adding to column ${insertAt.col + 1}` : `Adding at position ${insertAt.index + 1}`}</span>
                    <button type="button" className="font-semibold text-[#2c6ecb]" onClick={() => setInsertAt(null)}>Cancel</button>
                  </div>
                ) : (
                  <p className="mb-3 text-xs text-[#616161]">Click a block to add it, or drag it onto the page.</p>
                )}
                {library.map((group) => (
                  <div key={group.group} className="mb-4">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#616161]">{group.group}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", item.key);
                            e.dataTransfer.effectAllowed = "copy";
                            setDragKey(item.key);
                          }}
                          onDragEnd={() => {
                            setDragKey(null);
                            setDropIndex(null);
                          }}
                          onClick={() => addBlock({ type: item.type, layout: item.layout })}
                          className="cursor-grab rounded-lg border border-[#e3e3e3] px-2 py-2.5 text-left text-[13px] font-medium hover:border-[#2c6ecb] hover:bg-[#f4f8ff] active:cursor-grabbing"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto py-2">
                {blocks.length === 0 ? <p className="px-3 text-xs text-[#616161]">The page is empty. Add a block from the Add tab.</p> : null}
                {rows(blocks, null, 0, 0)}
                {blocks.length > 0 ? (
                  <div
                    onDragOver={(e) => {
                      if (!layerDrag) return;
                      e.preventDefault();
                      setLayerOver("end");
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (layerDrag) moveTo(layerDrag, { parentId: null, col: 0, index: blocks.length });
                      setLayerDrag(null);
                      setLayerOver(null);
                    }}
                    className={cn("mx-2 mt-2 rounded border border-dashed py-2 text-center text-xs text-[#8a8a8a]", layerOver === "end" ? "border-[#2c6ecb] text-[#2c6ecb]" : "border-[#d0d0d0]")}
                  >
                    Drop here to move to the end
                  </div>
                ) : null}
                <p className="mt-3 px-3 text-xs text-[#616161]">Drag rows to reorder. Drop on a column to move a block into it.</p>
              </div>
            )}
          </aside>

          {/* centre: canvas */}
          <main ref={stage} className="flex min-w-0 flex-1 justify-center overflow-auto bg-[#dcdcdc] p-4" onClick={() => select(null)}>
            <div className="relative h-full shrink-0" style={{ width: target * scale }} onClick={(e) => e.stopPropagation()}>
              <div className="absolute left-0 top-0 origin-top-left" style={{ width: target, height: `${100 / scale}%`, transform: `scale(${scale})` }}>
                <iframe ref={frame} title="Page canvas" src="/page-preview" className="size-full rounded-md border border-[#c9c9c9] bg-white shadow-md" />
              </div>
              {!ready ? <LoadingRows /> : null}
              {dragKey ? (
                <div
                  ref={overlay}
                  className="absolute inset-0 z-10 rounded-md bg-[#2c6ecb]/5"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDropIndex(indexAt(e.clientY));
                  }}
                  onDragLeave={() => setDropIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const index = indexAt(e.clientY);
                    const item = library.flatMap((g) => g.items).find((i) => i.key === dragKey);
                    setDragKey(null);
                    setDropIndex(null);
                    if (item) addBlock({ type: item.type, layout: item.layout }, { parentId: null, col: 0, index });
                  }}
                >
                  {lineY !== null ? <div className="pointer-events-none absolute inset-x-0 h-1 -translate-y-1/2 rounded bg-[#2c6ecb]" style={{ top: lineY }} /> : null}
                </div>
              ) : null}
            </div>
          </main>

          {/* right: settings */}
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-[#e3e3e3] bg-white">
            {selected ? (
              <>
                <div className="flex items-center gap-0.5 border-b border-[#e3e3e3] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{BLOCK_LABELS[selected.block.type].label}</span>
                  <IconBtn icon={ArrowUp} label="Move up" onClick={() => commit(moveBlock(cur(), selected.block.id, -1))} />
                  <IconBtn icon={ArrowDown} label="Move down" onClick={() => commit(moveBlock(cur(), selected.block.id, 1))} />
                  <IconBtn icon={Copy} label="Duplicate" onClick={() => duplicateSelected(selected.block.id)} />
                  <IconBtn icon={selected.block.hidden ? EyeOff : Eye} label={selected.block.hidden ? "Show block" : "Hide block"} onClick={() => change(selected.block.id, { hidden: !selected.block.hidden })} />
                  <IconBtn icon={Trash2} label="Remove" tone="danger" onClick={() => removeSelected(selected.block.id)} />
                  <IconBtn icon={X} label="Close (page settings)" onClick={() => select(null)} />
                </div>
                <div className="grid grid-cols-2 border-b border-[#e3e3e3] text-[13px] font-semibold">
                  <button type="button" onClick={() => setRightTab("content")} className={cn("py-2.5", rightTab === "content" ? "border-b-2 border-[#303030]" : "text-[#616161] hover:bg-[#f7f7f7]")}>Content</button>
                  <button type="button" onClick={() => setRightTab("style")} className={cn("py-2.5", rightTab === "style" ? "border-b-2 border-[#303030]" : "text-[#616161] hover:bg-[#f7f7f7]")}>Style</button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {rightTab === "content" ? (
                    <BlockForm key={selected.block.id} block={selected.block} onChange={(patch) => change(selected.block.id, patch)} />
                  ) : (
                    <StyleForm
                      key={selected.block.id}
                      style={selected.block.style ?? {}}
                      defaultPad={selected.parentId === null && !OWN_SPACING.has(selected.block.type)}
                      onChange={(style) => change(selected.block.id, { style })}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-[#e3e3e3] px-3 py-3 text-[13px] font-semibold">Page settings</div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {isSystem ? (
                    <p className="rounded-lg bg-[#f7f7f7] p-2.5 text-xs leading-relaxed text-[#616161]">
                      This is the design of the <strong>{systemMeta?.title.toLowerCase()}</strong>. It starts as a copy of today's page. Until you press “Publish this design” visitors keep seeing the built-in page. The page's search title and description are still set in Website content → SEO.
                      {page.kind === "product" || page.kind === "collection" ? " The product or collection shown here is a sample; the design applies to all of them." : ""}
                    </p>
                  ) : null}
                  {isSystem ? null : <Field label="Title"><input className={adminInput} value={title} maxLength={160} onChange={(e) => markDirty(setTitle)(e.target.value)} /></Field>}
                  {isSystem ? null : <Field label="Address" help={`example.com${liveUrl}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] text-[#616161]">{isPost ? "/blog/" : isPolicy ? "/policies/" : "/pages/"}</span>
                      <input className={adminInput} value={slug} maxLength={80} onChange={(e) => markDirty(setSlug)(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} onBlur={() => setSlug(slugify(slug))} />
                    </div>
                  </Field>}
                  {isPost ? (
                    <>
                      <hr className="border-[#e3e3e3]" />
                      <p className="text-[13px] font-semibold">Post details</p>
                      <Field label="Short summary" help="Shown on the blog list and in search results."><textarea className={adminInput} rows={3} maxLength={400} value={excerpt} onChange={(e) => markDirty(setExcerpt)(e.target.value)} /></Field>
                      <ImageField label="Cover picture" value={cover} onChange={markDirty(setCover)} />
                      <Field label="Author"><input className={adminInput} value={author} maxLength={120} onChange={(e) => markDirty(setAuthor)(e.target.value)} /></Field>
                      <Field label="Tags" help="Separate with commas, e.g. Festive, Styling"><input className={adminInput} value={tags} maxLength={300} onChange={(e) => markDirty(setTags)(e.target.value)} /></Field>
                      <Field label="Date shown on the post"><input type="date" className={adminInput} value={postDate} onChange={(e) => markDirty(setPostDate)(e.target.value)} /></Field>
                    </>
                  ) : null}
                  {isSystem ? null : <><hr className="border-[#e3e3e3]" />
                  <p className="text-[13px] font-semibold">Search engines</p>
                  <Field label="SEO title" help="Leave empty to use the page title."><input className={adminInput} value={seoTitle} maxLength={160} onChange={(e) => markDirty(setSeoTitle)(e.target.value)} /></Field>
                  <Field label="SEO description"><textarea className={adminInput} rows={3} maxLength={320} value={seoDescription} onChange={(e) => markDirty(setSeoDescription)(e.target.value)} /></Field>
                  <ImageField label="Share image" value={seoImage} onChange={markDirty(setSeoImage)} /></>}
                  <p className="text-xs text-[#616161]">Click any block on the page, or in Layers, to edit it.</p>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function countAll(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + 1 + (b.type === "columns" ? b.columns.reduce((m, c) => m + countAll(c), 0) : 0), 0);
}
