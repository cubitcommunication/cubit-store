import { brand } from "@/config/brand";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, Eye, EyeOff, Monitor, Plus, Redo2, Smartphone, Tablet, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Choice, ImageField, LinkField, Text } from "@/components/admin/PageBlockForms";
import { Btn, Field, IconBtn, adminInput } from "@/components/admin/ui";
import { db } from "@/lib/data";
import {
  ELEMENTS, FOOTER_ADD, SHOW_FIELD, HEADER_ADD, LAYOUT_KEYS, blankEl, cloneEl, findEl, insertEl, mapEl, moveElTo, newId, removeEl,
  type El, type ElType, type FieldDef, type FooterLayout, type HeaderLayout, type LayoutKind, type Where,
} from "@/lib/layout";
import { cn } from "@/lib/utils";
import { LoadingRows } from "@/components/ui/loading-rows";

type AnyLayout = HeaderLayout | FooterLayout;
type Hist = { past: AnyLayout[]; present: AnyLayout; future: AnyLayout[] };
type Device = "desktop" | "tablet" | "mobile";
/** Width the site is laid out at in each preview. Desktop is a real 1280 px layout, scaled down to fit the editor. */
const WIDTH: Record<Device, number> = { desktop: 1280, tablet: 768, mobile: 390 };

const TITLES: Record<LayoutKind, string> = { header: "Header", footer: "Footer" };

export function LayoutEditor({ kind, initial }: { kind: LayoutKind; initial: AnyLayout }) {
  const qc = useQueryClient();
  const [hist, setHist] = useState<Hist>({ past: [], present: initial, future: [] });
  const histRef = useRef(hist);
  histRef.current = hist;
  const lastEdit = useRef({ key: "", t: 0 });
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;
  const [addTo, setAddTo] = useState<Where | null>(null);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
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
  const target = WIDTH[device];
  const scale = Math.min(1, avail / target);

  const layout = hist.present;
  const dirty = JSON.stringify(layout) !== saved;
  const cur = () => histRef.current.present;

  const commit = (next: AnyLayout, key?: string) => {
    const h = histRef.current;
    if (next === h.present) return;
    const now = Date.now();
    const merge = Boolean(key) && lastEdit.current.key === key && now - lastEdit.current.t < 900;
    lastEdit.current = { key: key ?? "", t: now };
    const nh: Hist = { past: merge ? h.past : [...h.past.slice(-49), h.present], present: next, future: [] };
    histRef.current = nh;
    setHist(nh);
  };
  const undo = () => {
    const h = histRef.current;
    if (!h.past.length) return;
    const nh: Hist = { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] };
    histRef.current = nh;
    lastEdit.current = { key: "", t: 0 };
    setHist(nh);
  };
  const redo = () => {
    const h = histRef.current;
    if (!h.future.length) return;
    const nh: Hist = { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
    histRef.current = nh;
    lastEdit.current = { key: "", t: 0 };
    setHist(nh);
  };

  /* ---- canvas sync ---- */
  const sync = () => frame.current?.contentWindow?.postMessage({ type: "shop-layout-preview", kind, layout: cur(), selectedId: selRef.current }, window.location.origin);
  useEffect(() => {
    if (ready) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, layout, selectedId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const d = event.data as { type?: string; id?: unknown; where?: Where; index?: unknown } | null;
      switch (d?.type) {
        case "shop-layout-ready":
          setReady(true);
          sync();
          break;
        case "shop-layout-select":
          setSelectedId(typeof d.id === "string" ? d.id : null);
          setAddTo(null);
          break;
        case "shop-layout-add":
          if (d.where) setAddTo(d.where);
          setSelectedId(null);
          break;
        case "shop-layout-move":
          if (typeof d.id === "string" && d.where) commit(moveElTo(cur(), d.id, d.where, Math.max(0, Number(d.index) || 0)));
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
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

  /* ---- actions ---- */
  const defaultWhere = (): Where => ("zones" in cur() ? { zone: "right" } : { column: (cur() as FooterLayout).columns[0]!.id });

  function add(type: ElType) {
    const item = blankEl(type);
    const sel = selRef.current ? findEl(cur(), selRef.current) : null;
    const where = addTo ?? sel?.where ?? defaultWhere();
    const index = addTo ? 9999 : sel ? sel.index + 1 : 9999;
    commit(insertEl(cur(), item, where, index));
    setSelectedId(item.id);
    setAddTo(null);
  }

  const changeProps = (id: string, patch: Record<string, string>) =>
    commit(mapEl(cur(), id, (e) => ({ ...e, props: { ...e.props, ...patch } })), `${id}:${Object.keys(patch).join(",")}`);

  function shift(id: string, delta: -1 | 1) {
    const loc = findEl(cur(), id);
    if (!loc) return;
    commit(moveElTo(cur(), id, loc.where, delta < 0 ? loc.index - 1 : loc.index + 2));
  }

  function duplicate(id: string) {
    const loc = findEl(cur(), id);
    if (!loc) return;
    const copy = cloneEl(loc.el);
    commit(insertEl(cur(), copy, loc.where, loc.index + 1));
    setSelectedId(copy.id);
  }

  async function save() {
    setSaving(true);
    const value = JSON.stringify(cur());
    const { error } = await db
      .from("site_settings")
      .upsert([{ key: LAYOUT_KEYS[kind], value, group_name: "layout", label: `${TITLES[kind]} layout`, help: "Edited in Online store → Header & footer.", multiline: true, sort_order: 0 }], { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("Could not save. Please try again.");
      return;
    }
    setSaved(value);
    void qc.invalidateQueries({ queryKey: ["site-settings"] });
    toast.success(`${TITLES[kind]} saved. It is live on the site.`);
  }

  function reset() {
    if (!window.confirm(`Go back to the original ${kind} design? (Nothing is saved until you press Save.)`)) return;
    void import("@/lib/layout").then((m) => {
      commit(kind === "header" ? m.defaultHeader() : m.defaultFooter());
      setSelectedId(null);
    });
  }

  const selected = selectedId ? findEl(layout, selectedId) : null;
  const addList = kind === "header" ? HEADER_ADD : FOOTER_ADD;

  return (
    <>
      <div className="admin-ui flex h-screen items-center justify-center bg-[#f1f1f1] p-8 text-center lg:hidden">
        <div>
          <p className="text-[15px] font-semibold">The {kind} editor needs a bigger screen</p>
          <p className="mt-2 text-[13px] text-[#616161]">Open it on a laptop or desktop computer.</p>
          <Link to="/admin/pages" className="mt-4 inline-block text-[13px] text-[#005bd3] underline">Back to admin</Link>
        </div>
      </div>

      <div className="admin-ui hidden h-screen flex-col overflow-hidden bg-[#f1f1f1] text-[#303030] lg:flex">
        <header className="flex h-12 shrink-0 items-center gap-3 bg-[#1a1a1a] px-3 text-white">
          <Link
            to="/admin/dashboard"
            onClick={(e) => {
              if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-white/10"
          >
            <ArrowLeft className="size-4" /> Admin
          </Link>
          <div className="flex rounded-lg bg-white/10 p-0.5 text-[13px] font-semibold">
            {(["header", "footer"] as const).map((k) => (
              <Link
                key={k}
                to="/admin/layout/$kind"
                params={{ kind: k }}
                onClick={(e) => {
                  if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
                }}
                className={cn("rounded-md px-3 py-1", k === kind ? "bg-white text-[#1a1a1a]" : "hover:bg-white/15")}
              >
                {TITLES[k]}
              </Link>
            ))}
          </div>
          {dirty ? <span className="text-xs text-[#ffd166]">Unsaved changes</span> : null}

          <div className="mx-auto flex items-center gap-1 rounded-lg bg-white/10 p-0.5">
            {([["desktop", Monitor, "Desktop"], ["tablet", Tablet, "Tablet (768 px)"], ["mobile", Smartphone, "Mobile (390 px)"]] as const).map(([d, Icon, label]) => (
              <button key={d} type="button" title={label} aria-label={label} aria-pressed={device === d} onClick={() => setDevice(d)} className={cn("flex size-8 items-center justify-center rounded-md", device === d ? "bg-white text-[#1a1a1a]" : "hover:bg-white/15")}>
                <Icon className="size-4" />
              </button>
            ))}
          </div>

          <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!hist.past.length} onClick={undo} className="flex size-8 items-center justify-center rounded-md hover:bg-white/15 disabled:opacity-35"><Undo2 className="size-4" /></button>
          <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!hist.future.length} onClick={redo} className="flex size-8 items-center justify-center rounded-md hover:bg-white/15 disabled:opacity-35"><Redo2 className="size-4" /></button>
          <Btn onClick={reset} className="!border-white/30 !bg-transparent !text-white hover:!bg-white/10">Reset to original</Btn>
          <Btn variant="primary" disabled={saving || !dirty} onClick={() => void save()} className="!bg-[#2c6ecb] hover:!bg-[#2159a8]">{saving ? "Saving…" : "Save"}</Btn>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* left: add elements */}
          <aside className="flex w-[260px] shrink-0 flex-col border-r border-[#e3e3e3] bg-white">
            <div className="border-b border-[#e3e3e3] px-3 py-2.5 text-[13px] font-semibold">Add element</div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {addTo ? (
                <div className="mb-3 flex items-center justify-between rounded-lg bg-[#e8f0fe] px-3 py-2 text-xs">
                  <span>Adding to the chosen spot</span>
                  <button type="button" className="font-semibold text-[#2c6ecb]" onClick={() => setAddTo(null)}>Cancel</button>
                </div>
              ) : (
                <p className="mb-3 text-xs text-[#616161]">Click an element to add it. Drag elements on the page to move them. Click the dashed “+” on the page to add to a specific spot.</p>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {addList.map((t) => (
                  <button key={t} type="button" title={ELEMENTS[t].hint} onClick={() => add(t)} className="rounded-lg border border-[#e3e3e3] px-2 py-2.5 text-left text-[13px] font-medium hover:border-[#2c6ecb] hover:bg-[#f4f8ff]">
                    {ELEMENTS[t].label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* centre: canvas */}
          <main ref={stage} className="flex min-w-0 flex-1 justify-center overflow-auto bg-[#dcdcdc] p-4" onClick={() => setSelectedId(null)}>
            <div className="relative h-full shrink-0" style={{ width: target * scale }} onClick={(e) => e.stopPropagation()}>
              <div className="absolute left-0 top-0 origin-top-left" style={{ width: target, height: `${100 / scale}%`, transform: `scale(${scale})` }}>
                <iframe ref={frame} title="Layout canvas" src="/layout-preview" className="size-full rounded-md border border-[#c9c9c9] bg-white shadow-md" />
              </div>
              {!ready ? <LoadingRows /> : null}
            </div>
          </main>

          {/* right: settings */}
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-[#e3e3e3] bg-white">
            {selected ? (
              <>
                <div className="flex items-center gap-0.5 border-b border-[#e3e3e3] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{ELEMENTS[selected.el.type].label}</span>
                  <IconBtn icon={ArrowLeft} label="Move earlier" onClick={() => shift(selected.el.id, -1)} />
                  <IconBtn icon={ArrowRight} label="Move later" onClick={() => shift(selected.el.id, 1)} />
                  <IconBtn icon={Copy} label="Duplicate" onClick={() => duplicate(selected.el.id)} />
                  <IconBtn icon={selected.el.hidden ? EyeOff : Eye} label={selected.el.hidden ? "Show" : "Hide"} onClick={() => commit(mapEl(cur(), selected.el.id, (e) => ({ ...e, hidden: !e.hidden })))} />
                  <IconBtn icon={Trash2} label="Remove" tone="danger" onClick={() => { commit(removeEl(cur(), selected.el.id)); setSelectedId(null); }} />
                  <IconBtn icon={X} label="Close" onClick={() => setSelectedId(null)} />
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  <ElementForm key={selected.el.id} el={selected.el} onChange={(patch) => changeProps(selected.el.id, patch)} />
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-[#e3e3e3] px-3 py-3 text-[13px] font-semibold">{TITLES[kind]} settings</div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {"zones" in layout ? (
                    <>
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={layout.sticky} onChange={(e) => commit({ ...layout, sticky: e.target.checked }, "sticky")} /> Keep the header at the top while scrolling
                      </label>
                      <Choice label="Height" value={layout.height} options={[["compact", "Compact"], ["normal", "Normal"], ["tall", "Tall"]]} onChange={(v) => commit({ ...layout, height: v as HeaderLayout["height"] }, "height")} />
                      <hr className="border-[#e3e3e3]" />
                      <p className="text-[13px] font-semibold">Announcement bar</p>
                      <p className="text-xs text-[#616161]">The scrolling strip above the menu. Leave it empty to hide it.</p>
                      {(layout.announce?.items ?? []).map((a, i) => (
                        <div key={i} className="space-y-2 rounded-lg border border-[#e3e3e3] p-2.5">
                          <Text label={`Line ${i + 1}`} value={a.text} max={160} onChange={(v) => commit({ ...layout, announce: { items: (layout.announce?.items ?? []).map((x, j) => (j === i ? { ...x, text: v } : x)) } }, `a${i}`)} />
                          <LinkField label="Opens (optional)" value={a.url} onChange={(v) => commit({ ...layout, announce: { items: (layout.announce?.items ?? []).map((x, j) => (j === i ? { ...x, url: v } : x)) } })} />
                          <Btn variant="danger" onClick={() => commit({ ...layout, announce: { items: (layout.announce?.items ?? []).filter((_, j) => j !== i) } })}>Remove line</Btn>
                        </div>
                      ))}
                      {(layout.announce?.items.length ?? 0) < 5 ? (
                        <Btn onClick={() => commit({ ...layout, announce: { items: [...(layout.announce?.items ?? []), { text: "", url: "" }] } })}><Plus className="size-4" /> Add a line</Btn>
                      ) : null}
                      <hr className="border-[#e3e3e3]" />
                      <p className="text-xs text-[#616161]">The header has three areas: left, centre and right. Drag any element between them, or click an element to change it. The menu button only shows on phones and tablets.</p>
                    </>
                  ) : (
                    <FooterSettings layout={layout} onChange={(next, key) => commit(next, key)} />
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ element form */

function ElementForm({ el, onChange }: { el: El; onChange: (patch: Record<string, string>) => void }) {
  const def = ELEMENTS[el.type];
  return (
    <>
      {def.fields.length === 0 ? <p className="text-[13px] text-[#616161]">{def.hint}. Nothing to set here — move it by dragging, or hide it with the eye button.</p> : null}
      {[...def.fields, SHOW_FIELD].map((f: FieldDef) => {
        const value = el.props[f.key as keyof El["props"]] ?? (f.key === "show" ? "all" : "");
        switch (f.kind) {
          case "text":
            return <Text key={f.key} label={f.label} value={value} onChange={(v) => onChange({ [f.key]: v })} />;
          case "textarea":
            return <Text key={f.key} label={f.label} value={value} rows={3} max={600} onChange={(v) => onChange({ [f.key]: v })} {...(f.help ? { help: f.help } : {})} />;
          case "link":
            return <LinkField key={f.key} label={f.label} value={value} onChange={(v) => onChange({ [f.key]: v })} />;
          case "image":
            return (
              <div key={f.key}>
                <ImageField label={f.label} value={value} onChange={(v) => onChange({ [f.key]: v })} />
                {f.help ? <p className="mt-1 text-xs text-[#616161]">{f.help}</p> : null}
                {value ? <button type="button" className="mt-1 text-xs text-[#005bd3] underline" onClick={() => onChange({ [f.key]: "" })}>Remove image</button> : null}
              </div>
            );
          case "select":
            return <Choice key={f.key} label={f.label} value={value} options={f.options} onChange={(v) => onChange({ [f.key]: v })} />;
          case "number":
            return (
              <Field key={f.key} label={f.label}>
                <input type="number" className={adminInput} min={f.min} max={f.max} value={value} onChange={(e) => onChange({ [f.key]: e.target.value })} />
              </Field>
            );
        }
      })}
    </>
  );
}

/* ------------------------------------------------------------------ footer settings (columns) */

function FooterSettings({ layout, onChange }: { layout: FooterLayout; onChange: (next: FooterLayout, key?: string) => void }) {
  const setCol = (id: string, patch: Partial<FooterLayout["columns"][number]>, key?: string) =>
    onChange({ ...layout, columns: layout.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }, key);
  const moveCol = (i: number, d: -1 | 1) => {
    const cols = layout.columns.slice();
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j]!, cols[i]!];
    onChange({ ...layout, columns: cols });
  };
  return (
    <>
      <Choice label="Colour" value={layout.tone} options={[["black", "Black"], ["red", `${brand.name} red`]]} onChange={(v) => onChange({ ...layout, tone: v as FooterLayout["tone"] })} />
      <Text label="Bottom line" value={layout.copyright} max={160} onChange={(v) => onChange({ ...layout, copyright: v }, "copyright")} />
      <hr className="border-[#e3e3e3]" />
      <p className="text-[13px] font-semibold">Columns</p>
      {layout.columns.map((c, i) => (
        <div key={c.id} className="space-y-2 rounded-lg border border-[#e3e3e3] p-2.5">
          <div className="flex items-center gap-1">
            <span className="flex-1 text-xs font-semibold text-[#616161]">Column {i + 1}</span>
            <IconBtn icon={ArrowLeft} label="Move left" disabled={i === 0} onClick={() => moveCol(i, -1)} />
            <IconBtn icon={ArrowRight} label="Move right" disabled={i === layout.columns.length - 1} onClick={() => moveCol(i, 1)} />
            <IconBtn icon={Trash2} label="Remove column" tone="danger" disabled={layout.columns.length <= 1} onClick={() => { if (window.confirm("Remove this column and everything in it?")) onChange({ ...layout, columns: layout.columns.filter((x) => x.id !== c.id) }); }} />
          </div>
          <Text label="Title (empty = none)" value={c.title} max={60} onChange={(v) => setCol(c.id, { title: v }, `t:${c.id}`)} />
          <Field label={`Width (${c.width.toFixed(1)})`}>
            <input type="range" min={0.5} max={2.5} step={0.1} value={c.width} onChange={(e) => setCol(c.id, { width: Number(e.target.value) }, `w:${c.id}`)} className="w-full" />
          </Field>
        </div>
      ))}
      {layout.columns.length < 6 ? (
        <Btn onClick={() => onChange({ ...layout, columns: [...layout.columns, { id: newId(), title: "New column", width: 1, elements: [] }] })}>
          <Plus className="size-4" /> Add column
        </Btn>
      ) : null}
      <p className="text-xs text-[#616161]">Click an element on the page to edit it, or the dashed “+” inside a column to add to it. On phones, columns with a title become tap-to-open sections.</p>
    </>
  );
}
