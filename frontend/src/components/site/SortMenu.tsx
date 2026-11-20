import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortOption<T extends string> = { value: T; label: string };

/**
 * A branded dropdown for the shop's "Sort" control (replaces the browser's plain <select>).
 * Keyboard: Enter / Space / arrows open it, arrows move, Enter chooses, Escape closes.
 */
export function SortMenu<T extends string>({
  value,
  options,
  onChange,
  label = "Sort by",
  className,
}: {
  value: T;
  options: SortOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0]!;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (v: T) => {
    onChange(v);
    setOpen(false);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(options[active]!.value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2.5 rounded-full sm:w-auto sm:justify-start border bg-background pl-4 pr-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red",
          open ? "border-foreground" : "border-border hover:border-foreground",
        )}
      >
        <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="eyebrow hidden text-muted-foreground sm:inline">{label}</span>
        <span className="min-w-0 truncate font-medium">{current.label}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="shop-fade absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-background py-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]"
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-sm transition-colors",
                  i === active && "bg-muted",
                  selected ? "font-semibold text-brand-red" : "text-foreground",
                )}
              >
                {o.label}
                {selected ? <Check className="size-4" aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
