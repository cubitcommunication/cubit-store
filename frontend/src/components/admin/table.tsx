import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Btn } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/**
 * Small building blocks shared by the admin lists: click a column title to sort, tick rows to select them,
 * and a bar of bulk actions that appears while rows are selected.
 */

/* ------------------------------------------------------------------ sorting (rows already loaded in the browser) */

export type SortState = { key: string; dir: "asc" | "desc" } | null;
type Cell = string | number | boolean | null | undefined;

const norm = (v: Cell): string | number | null => (v === null || v === undefined || v === "" ? null : typeof v === "boolean" ? Number(v) : v);

/** Sorts `rows` by the chosen column. Clicking a title cycles ascending → descending → original order. */
export function useSort<T>(rows: T[], getters: Record<string, (row: T) => Cell>, initial: SortState = null) {
  const [sort, setSort] = useState<SortState>(initial);
  const sorted = useMemo(() => {
    const get = sort ? getters[sort.key] : undefined;
    if (!sort || !get) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return rows
      .map((row, i) => ({ row, i, v: norm(get(row)) }))
      .sort((a, b) => {
        if (a.v === null && b.v === null) return a.i - b.i;
        if (a.v === null) return 1; // empty values always last
        if (b.v === null) return -1;
        const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: "base" });
        return c !== 0 ? c * factor : a.i - b.i;
      })
      .map((x) => x.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: string) => setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  return { rows: sorted, sort, toggle };
}

/** A column title that sorts when clicked. */
export function SortTh({
  label, k, sort, onToggle, className, align = "left",
}: {
  label: ReactNode;
  k: string;
  sort: SortState;
  onToggle: (key: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort?.key === k;
  const Icon = !active ? ChevronsUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("font-medium", align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        title="Click to sort"
        className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 hover:bg-black/5", align === "right" && "flex-row-reverse", active && "text-[#303030]")}
      >
        {label}
        <Icon className={cn("size-3", active ? "opacity-100" : "opacity-40")} aria-hidden="true" />
      </button>
    </th>
  );
}

/* ------------------------------------------------------------------ selection */

export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const api = {
    selected,
    count: selected.size,
    has: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    setMany: (ids: string[], on: boolean) =>
      setSelected((s) => {
        const n = new Set(s);
        for (const id of ids) {
          if (on) n.add(id);
          else n.delete(id);
        }
        return n;
      }),
    clear: () => setSelected(new Set()),
  };
  return api;
}
export type Selection = ReturnType<typeof useSelection>;

/** Header checkbox: selects or clears every row currently shown. */
export function SelectTh({ ids, sel }: { ids: string[]; sel: Selection }) {
  const ref = useRef<HTMLInputElement>(null);
  const on = ids.filter((id) => sel.has(id)).length;
  const all = ids.length > 0 && on === ids.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = on > 0 && !all;
  }, [on, all]);
  return (
    <th className="w-10 pl-3">
      <input ref={ref} type="checkbox" aria-label="Select all rows" checked={all} disabled={ids.length === 0} onChange={() => sel.setMany(ids, !all)} className="size-4 accent-[#303030]" />
    </th>
  );
}

/** Row checkbox. */
export function SelectTd({ id, label, sel }: { id: string; label: string; sel: Selection }) {
  return (
    <td className="w-10 pl-3">
      <input type="checkbox" aria-label={`Select ${label}`} checked={sel.has(id)} onChange={() => sel.toggle(id)} className="size-4 accent-[#303030]" />
    </td>
  );
}

/** Bar shown above the table while rows are selected. Put the action buttons inside. */
export function BulkBar({ sel, children }: { sel: Selection; children: ReactNode }) {
  if (sel.count === 0) return null;
  return (
    <div className="sticky top-[110px] z-20 flex flex-wrap items-center gap-2 border-b border-[#e3e3e3] bg-[#f7f7f7] px-3 py-2 text-[13px]">
      <span className="font-semibold">{sel.count} selected</span>
      {children}
      <Btn variant="plain" className="ml-auto" onClick={sel.clear}>Clear</Btn>
    </div>
  );
}

/** Keeps a selection tidy when rows disappear (deleted, filtered away). */
export function useDropMissing(sel: Selection, ids: string[]) {
  const key = ids.join("|");
  useEffect(() => {
    const present = new Set(ids);
    const stale = [...sel.selected].filter((id) => !present.has(id));
    if (stale.length) sel.setMany(stale, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
