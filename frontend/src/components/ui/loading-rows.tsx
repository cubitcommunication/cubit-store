import { cn } from "@/lib/utils";

/**
 * Loading placeholders. Each one copies the shape of the content that will replace it (a table, a form, a product grid...),
 * and every bar shimmers (`.skel`). Never use one shape for every page.
 */
type Variant = "admin" | "store";
const barOf = (v: Variant) => (v === "admin" ? "bg-[#ebebeb]" : "");

function Bar({ className, v, style }: { className?: string; v: Variant; style?: React.CSSProperties }) {
  return <div className={cn(v === "admin" ? "skel rounded" : "soft-load rounded-full", barOf(v), className)} style={style} />;
}

/** A short list of rows: a picture and two lines of text (team, devices, mail servers, saved addresses). */
export function LoadingRows({ rows = 4, variant = "admin", className }: { rows?: number; variant?: Variant; className?: string }) {
  return (
    <div className={cn("space-y-3 py-1", variant === "admin" ? "p-4" : "", className)} role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Bar v={variant} className="size-10 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bar v={variant} className="h-3" style={{ width: `${70 - (i % 3) * 15}%` }} />
            <Bar v={variant} className="h-2.5" style={{ width: `${40 + (i % 2) * 15}%` }} />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** A data table: a header row, then rows with an optional tick box, an optional thumbnail and `cols` cells. */
export function TableSkeleton({ rows = 8, cols = 5, checkbox = true, thumb = false, className }: { rows?: number; cols?: number; checkbox?: boolean; thumb?: boolean; className?: string }) {
  const v: Variant = "admin";
  return (
    <div className={cn("w-full overflow-hidden", className)} role="status" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-4 border-b border-[#e3e3e3] px-4 py-2.5">
        {checkbox ? <Bar v={v} className="size-4 shrink-0" /> : null}
        {Array.from({ length: cols }).map((_, c) => <Bar key={c} v={v} className="h-3" style={{ flex: c === 0 ? 2.2 : 1 }} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-[#ebebeb] px-4 py-3 last:border-0">
          {checkbox ? <Bar v={v} className="size-4 shrink-0" /> : null}
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="flex min-w-0 items-center gap-3" style={{ flex: c === 0 ? 2.2 : 1 }}>
              {c === 0 && thumb ? <Bar v={v} className="size-10 shrink-0 rounded-md" /> : null}
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bar v={v} className="h-3" style={{ width: `${c === 0 ? 60 + ((r * 7) % 30) : 45 + ((r + c * 3) % 4) * 12}%` }} />
                {c === 0 && thumb ? <Bar v={v} className="h-2.5 w-1/3" /> : null}
              </div>
            </div>
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Settings-style cards: a card title, then a few "label above input" fields. */
export function FormSkeleton({ cards = 2, fields = 3 }: { cards?: number; fields?: number }) {
  const v: Variant = "admin";
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-[12px] border border-[#e3e3e3] bg-white p-4">
          <Bar v={v} className="h-4 w-40" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: fields }).map((_, f) => (
              <div key={f} className="space-y-2">
                <Bar v={v} className="h-3 w-24" />
                <Bar v={v} className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** A grid of square picture tiles (Media, Reels). */
export function TilesSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => <Bar key={i} v="admin" className="aspect-square rounded-lg" />)}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Admin Home: number tiles, a bar chart and two lists. */
export function DashboardSkeleton() {
  const v: Variant = "admin";
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[12px] border border-[#e3e3e3] bg-white p-4"><Bar v={v} className="h-3 w-20" /><Bar v={v} className="mt-3 h-6 w-28" /></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4">
          <Bar v={v} className="h-4 w-48" />
          <div className="mt-4 flex h-44 items-end gap-[3px]">{Array.from({ length: 14 }).map((_, i) => <Bar key={i} v={v} className="flex-1 rounded-t-[4px]" style={{ height: `${20 + ((i * 37) % 70)}%` }} />)}</div>
        </div>
        <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4"><Bar v={v} className="h-4 w-32" /><LoadingRows rows={5} className="!p-0 pt-4" /></div>
      </div>
    </div>
  );
}

/** Reports: number tiles, a chart and a pair of tables. */
export function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <DashboardSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="rounded-[12px] border border-[#e3e3e3] bg-white"><TableSkeleton rows={5} cols={3} checkbox={false} /></div>)}
      </div>
    </div>
  );
}

/** One order: items and payment on the left, the customer on the right. */
export function OrderSkeleton() {
  const v: Variant = "admin";
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]" role="status" aria-busy="true" aria-label="Loading">
      <div className="space-y-4">
        <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4"><Bar v={v} className="h-5 w-28" /><LoadingRows rows={2} className="!p-0 pt-4" /></div>
        <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4"><Bar v={v} className="h-5 w-24" />{[60, 40, 70].map((w, i) => <div key={i} className="mt-3 flex justify-between"><Bar v={v} className="h-3" style={{ width: `${w / 2}%` }} /><Bar v={v} className="h-3 w-16" /></div>)}</div>
        <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4"><Bar v={v} className="h-5 w-20" /><Bar v={v} className="mt-4 h-9 w-full rounded-lg" /></div>
      </div>
      <div className="space-y-4">
        {[0, 1].map((i) => <div key={i} className="rounded-[12px] border border-[#e3e3e3] bg-white p-4 space-y-2.5"><Bar v={v} className="h-4 w-24" /><Bar v={v} className="h-3 w-3/4" /><Bar v={v} className="h-3 w-1/2" /><Bar v={v} className="h-3 w-2/3" /></div>)}
      </div>
    </div>
  );
}

/** Page title bar used while a whole admin page loads. */
export function AdminTitleSkeleton() {
  return <div className="mb-4 flex items-center justify-between"><Bar v="admin" className="h-6 w-44" /><Bar v="admin" className="h-8 w-24 rounded-lg" /></div>;
}

/** Shop-style product grid: a filter row, then cards (picture, name, price). */
export function PageLoading({ variant = "store", withFilters = true }: { variant?: Variant; withFilters?: boolean }) {
  const v = variant;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" role="status" aria-busy="true" aria-label="Loading">
      <Bar v={v} className="h-7 w-1/3" />
      <Bar v={v} className="mt-3 h-3 w-1/2" />
      {withFilters ? <div className="mt-6 flex gap-2">{[20, 24, 18, 22].map((w, i) => <Bar key={i} v={v} className="h-9 rounded-full" style={{ width: `${w * 4}px` }} />)}</div> : null}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <Bar v={v} className="aspect-[4/5]" />
            <Bar v={v} className="mt-3 h-3 w-3/4" />
            <Bar v={v} className="mt-2 h-3 w-1/3" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Product page: pictures on the left, name, price, options and buttons on the right. */
export function ProductSkeleton() {
  const v: Variant = "store";
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2" role="status" aria-busy="true" aria-label="Loading">
      <div className="flex gap-3">
        <div className="hidden w-16 space-y-3 sm:block">{Array.from({ length: 4 }).map((_, i) => <Bar key={i} v={v} className="aspect-square" />)}</div>
        <Bar v={v} className="aspect-[4/5] flex-1" />
      </div>
      <div className="space-y-4">
        <Bar v={v} className="h-3 w-24" />
        <Bar v={v} className="h-8 w-3/4" />
        <Bar v={v} className="h-6 w-28" />
        <div className="space-y-2 pt-2"><Bar v={v} className="h-3 w-full" /><Bar v={v} className="h-3 w-11/12" /><Bar v={v} className="h-3 w-2/3" /></div>
        <div className="flex gap-2 pt-2">{[0, 1, 2].map((i) => <Bar key={i} v={v} className="h-10 w-16" />)}</div>
        <Bar v={v} className="mt-4 h-12 w-full" />
        <Bar v={v} className="h-12 w-full" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Cart / checkout: lines on the left, an order summary on the right. */
export function CartSkeleton() {
  const v: Variant = "store";
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px]" role="status" aria-busy="true" aria-label="Loading">
      <div className="space-y-5">
        <Bar v={v} className="h-7 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4"><Bar v={v} className="size-20 shrink-0" /><div className="flex-1 space-y-2"><Bar v={v} className="h-3 w-2/3" /><Bar v={v} className="h-3 w-1/4" /><Bar v={v} className="h-8 w-24" /></div></div>
        ))}
      </div>
      <div className="space-y-3 border border-border p-6">
        <Bar v={v} className="h-3 w-28" /><Bar v={v} className="h-12 w-full" />
        {[0, 1, 2].map((i) => <div key={i} className="flex justify-between"><Bar v={v} className="h-3 w-20" /><Bar v={v} className="h-3 w-16" /></div>)}
        <Bar v={v} className="h-12 w-full" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Account area: a side menu and a list of cards. */
export function AccountSkeleton() {
  const v: Variant = "store";
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[200px_1fr]" role="status" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Bar key={i} v={v} className="h-4 w-3/4" />)}</div>
      <div className="space-y-4">
        <Bar v={v} className="h-7 w-40" />
        {[0, 1, 2].map((i) => <div key={i} className="space-y-2 border border-border p-4"><div className="flex justify-between"><Bar v={v} className="h-4 w-32" /><Bar v={v} className="h-5 w-20 rounded-full" /></div><Bar v={v} className="h-3 w-1/2" /></div>)}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** A reading page (about, policies, blog post): a title and paragraphs. */
export function ArticleSkeleton() {
  const v: Variant = "store";
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6" role="status" aria-busy="true" aria-label="Loading">
      <Bar v={v} className="h-9 w-2/3" />
      {[100, 95, 90, 100, 70].map((w, i) => <Bar key={i} v={v} className="h-3" style={{ width: `${w}%` }} />)}
      <Bar v={v} className="mt-6 h-6 w-1/3" />
      {[100, 92, 80].map((w, i) => <Bar key={i} v={v} className="h-3" style={{ width: `${w}%` }} />)}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Home page: a hero banner, a row of category circles and a row of products. */
export function HomeSkeleton() {
  const v: Variant = "store";
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      <Bar v={v} className="h-[46vh] min-h-[260px] w-full rounded-none" />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Bar v={v} className="mx-auto h-6 w-56" />
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i}><Bar v={v} className="aspect-square" /><Bar v={v} className="mx-auto mt-3 h-3 w-1/2" /></div>)}</div>
        <Bar v={v} className="mx-auto mt-12 h-6 w-48" />
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i}><Bar v={v} className="aspect-[4/5]" /><Bar v={v} className="mt-3 h-3 w-3/4" /><Bar v={v} className="mt-2 h-3 w-1/3" /></div>)}</div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Just the product cards (no title), for a list inside a page that already has its own heading. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  const v: Variant = "store";
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}><Bar v={v} className="aspect-[4/5]" /><Bar v={v} className="mt-3 h-3 w-3/4" /><Bar v={v} className="mt-2 h-3 w-1/3" /></div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
