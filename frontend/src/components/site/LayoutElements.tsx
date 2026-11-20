import { brand as store } from "@/config/brand";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useBrandLogos } from "@/lib/brand";
import { SmartLink } from "@/components/site/SmartLink";
import { ELEMENTS, type El, type Where } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** What the editor canvas passes down so elements can be selected, dragged between zones and added. */
export type LayoutEdit = {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, where: Where, index: number) => void;
  onAdd: (where: Where) => void;
};

const SAFE_SRC = /^(\/(?!\/)[A-Za-z0-9\-_/.%]+|https:\/\/[^\s<>"']+)$/i;
export const safeSrc = (v: string) => (SAFE_SRC.test(v.trim()) ? v.trim() : "");

/** Classes that limit an element to large screens or to phones & tablets. */
const showClass = (e: El, base: "contents" | "block") =>
  e.props.show === "desktop" ? (base === "contents" ? "hidden lg:contents" : "hidden lg:block") : e.props.show === "mobile" ? `${base} lg:hidden` : base;

/**
 * A row (header) or stack (footer column) of elements. In edit mode it is a drop target: dragging an element over it
 * shows where it will land, and dropping calls onMove with that position.
 */
export function Zone({
  where, items, axis, edit, className, label, render,
}: {
  where: Where;
  items: El[];
  axis: "x" | "y";
  edit?: LayoutEdit | undefined;
  className?: string | undefined;
  label: string;
  render: (el: El) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState<number | null>(null);

  if (!edit) {
    const shown = items.filter((e) => !e.hidden);
    return shown.length ? <div className={className}>{shown.map((e) => <div key={e.id} className={showClass(e, "contents")}>{render(e)}</div>)}</div> : null;
  }

  const indexAt = (x: number, y: number) => {
    const kids = Array.from(box.current?.querySelectorAll<HTMLElement>(":scope > [data-el-id]") ?? []);
    let i = 0;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      const mid = axis === "x" ? r.left + r.width / 2 : r.top + r.height / 2;
      if ((axis === "x" ? x : y) > mid) i++;
      else break;
    }
    return i;
  };

  return (
    <div
      ref={box}
      data-zone={JSON.stringify(where)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(indexAt(e.clientX, e.clientY));
      }}
      onDragLeave={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        const at = indexAt(e.clientX, e.clientY);
        setOver(null);
        if (id) edit.onMove(id, where, at);
      }}
      className={cn(
        "relative min-h-10 min-w-10 rounded outline-dashed outline-1 outline-offset-2 outline-[#2c6ecb]/40",
        over !== null && "bg-[#2c6ecb]/10",
        className,
      )}
    >
      {items.map((e, i) => (
        <div
          key={e.id}
          data-el-id={e.id}
          draggable
          onDragStart={(ev) => {
            ev.dataTransfer.setData("text/plain", e.id);
            ev.dataTransfer.effectAllowed = "move";
          }}
          onClick={(ev) => {
            ev.stopPropagation();
            edit.onSelect(e.id);
          }}
          title={`${ELEMENTS[e.type].label} — click to edit, drag to move`}
          className={cn(
            showClass(e, "block"),
            "relative cursor-grab rounded outline-offset-2 hover:outline hover:outline-1 hover:outline-[#2c6ecb]",
            edit.selectedId === e.id && "outline outline-2 outline-[#2c6ecb]",
            e.hidden && "opacity-40",
            over === i && "before:absolute before:-left-1.5 before:inset-y-0 before:w-1 before:rounded before:bg-[#2c6ecb]",
            axis === "y" && over === i && "before:inset-x-0 before:-top-1.5 before:bottom-auto before:left-0 before:h-1 before:w-auto",
          )}
        >
          <div className="pointer-events-none">{render(e)}</div>
        </div>
      ))}
      <button
        type="button"
        aria-label={`Add an element to ${label}`}
        onClick={(ev) => {
          ev.stopPropagation();
          edit.onAdd(where);
        }}
        title={`Add an element to ${label}`}
        className="flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded border border-dashed border-[#2c6ecb] px-2 text-xs font-medium text-[#2c6ecb] hover:bg-[#2c6ecb]/10"
      >
        <Plus className="size-3.5" />{axis === "y" && items.length === 0 ? " Add" : ""}
      </button>
      {over !== null && over >= items.length ? <span className="pointer-events-none absolute inset-y-0 right-0 w-1 rounded bg-[#2c6ecb]" /> : null}
    </div>
  );
}

/** Wrapper for zones whose children are laid out in a row or a column. */
export const rowClass = "flex flex-nowrap items-center gap-1 sm:gap-2";
export const stackClass = "flex flex-col items-start gap-3";

/* ------------------------------------------------------------------ elements used by both header and footer */

export function LogoEl({ el, tone }: { el: El; tone: "light" | "dark" }) {
  const custom = safeSrc(el.props.image ?? "");
  const brand = useBrandLogos();
  const h = Math.min(120, Math.max(16, Number(el.props.height) || 44));
  const src = custom || (tone === "dark" ? brand.dark || brand.logo : brand.logo);
  // Until a logo is uploaded (Admin → Header & footer / Store details), the store's name stands in.
  const img = src ? (
    <img src={src} alt={store.name} style={{ "--h": `${h}px` } as React.CSSProperties} className="h-[calc(var(--h)*0.72)] w-auto max-w-full lg:h-[var(--h)]" />
  ) : (
    <span className={cn("font-display text-xl uppercase tracking-[0.16em] sm:text-2xl", tone === "dark" ? "text-white" : "text-foreground")}>{store.name}</span>
  );
  const link = (el.props.link || "/").trim();
  return link === "/" ? (
    <Link to="/" aria-label={`${store.name} home`} className="flex shrink-0 items-center">{img}</Link>
  ) : (
    <SmartLink href={link} className="flex shrink-0 items-center">{img}</SmartLink>
  );
}

const TEXT_SIZE = { sm: "text-[0.8125rem]", md: "text-[0.875rem]", lg: "text-lg" } as const;

export function TextEl({ el, tone }: { el: El; tone: "light" | "dark" }) {
  const size = (el.props.size as keyof typeof TEXT_SIZE) in TEXT_SIZE ? (el.props.size as keyof typeof TEXT_SIZE) : "md";
  const body = (
    <p className={cn("max-w-[22rem] whitespace-pre-line leading-relaxed", TEXT_SIZE[size], el.props.italic === "yes" && "font-serif italic", tone === "dark" ? "text-white/80" : "text-foreground/80")}>
      {el.props.text}
    </p>
  );
  return el.props.link ? <SmartLink href={el.props.link}>{body}</SmartLink> : body;
}

export function ImageEl({ el }: { el: El }) {
  const src = safeSrc(el.props.image ?? "");
  const h = Math.min(300, Math.max(16, Number(el.props.height) || 40));
  if (!src) return <span className="flex h-10 items-center rounded border border-dashed px-3 text-xs text-muted-foreground">Image (choose a file)</span>;
  const img = <img src={src} alt={el.props.alt ?? ""} style={{ height: h }} className="w-auto max-w-full" />;
  return el.props.link ? <SmartLink href={el.props.link}>{img}</SmartLink> : img;
}

export function ButtonEl({ el, tone }: { el: El; tone: "light" | "dark" }) {
  const outline = el.props.variant === "outline";
  const cls = cn(
    "eyebrow inline-flex items-center justify-center whitespace-nowrap px-4 py-2.5 transition-colors",
    outline
      ? tone === "dark" ? "border border-white/70 text-white hover:bg-white hover:text-black" : "border border-foreground text-foreground hover:bg-foreground hover:text-background"
      : "bg-brand-red text-white hover:opacity-90",
  );
  return <SmartLink href={el.props.link ?? ""} className={cls}>{el.props.label}</SmartLink>;
}

export function SpacerEl({ el, axis }: { el: El; axis: "x" | "y" }) {
  const n = Math.min(200, Math.max(4, Number(el.props.size) || 24));
  return <span aria-hidden="true" style={axis === "x" ? { width: n, height: 1 } : { height: n, width: 1 }} className="block shrink-0" />;
}
