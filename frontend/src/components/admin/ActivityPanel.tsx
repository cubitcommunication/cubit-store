import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Badge, Btn, Card, IconBtn, adminInput } from "@/components/admin/ui";
import { when } from "@/components/admin/TeamPanel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/loading-rows";

type Entry = {
  id: string;
  admin_id: string | null;
  email: string;
  action: string;
  area: string;
  subject_type: string | null;
  subject_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};
type Page = { items: Entry[]; total: number; page: number; pages: number; filters: { users: string[]; actions: string[]; areas: string[] } };

const TONE: Record<string, "success" | "info" | "critical" | "attention" | "neutral"> = {
  login: "success", logout: "neutral", login_failed: "critical", password: "attention",
  create: "success", update: "info", delete: "critical", upload: "info", email: "info", check: "neutral",
  user_create: "attention", user_update: "attention", user_delete: "critical",
};
const LABEL: Record<string, string> = {
  login: "Signed in", logout: "Signed out", login_failed: "Failed sign-in", password: "Password", create: "Added", update: "Changed", delete: "Deleted",
  upload: "Uploaded", email: "E-mail", check: "Checked", user_create: "User added", user_update: "User changed", user_delete: "User deleted",
};
const nice = (a: string) => LABEL[a] ?? a.replace(/_/g, " ");

/** A change shown as "old → new". */
function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-[#8a8a8a]">empty</span>;
  if (typeof v === "boolean") return <>{v ? "yes" : "no"}</>;
  if (typeof v === "object") return <code className="break-all text-[12px]">{JSON.stringify(v)}</code>;
  return <>{String(v)}</>;
}

function Details({ e }: { e: Entry }) {
  const d = e.details ?? {};
  const changes = d["changes"] && typeof d["changes"] === "object" ? (d["changes"] as Record<string, unknown>) : null;
  return (
    <div className="space-y-3 bg-[#fafafa] px-4 py-3 text-xs text-[#303030]">
      <dl className="grid grid-cols-[110px_1fr] gap-y-1">
        <dt className="text-[#616161]">Time</dt><dd>{when(e.created_at)} (India time)</dd>
        <dt className="text-[#616161]">User</dt><dd>{e.email}</dd>
        <dt className="text-[#616161]">Area</dt><dd>{e.area || "—"}</dd>
        {e.subject_id ? (<><dt className="text-[#616161]">Record</dt><dd className="break-all">{e.subject_type ? `${e.subject_type} · ` : ""}{e.subject_id}</dd></>) : null}
        <dt className="text-[#616161]">IP address</dt><dd>{e.ip || "—"}</dd>
        <dt className="text-[#616161]">Device</dt><dd className="break-words">{e.user_agent || "—"}</dd>
      </dl>
      {changes ? (
        <div>
          <p className="mb-1 font-semibold">What changed</p>
          <table className="w-full text-left">
            <tbody>
              {Object.entries(changes).map(([field, v]) => {
                const pair = v && typeof v === "object" && !Array.isArray(v) && "to" in (v as object) ? (v as { from?: unknown; to?: unknown }) : null;
                return (
                  <tr key={field} className="border-t border-[#ebebeb] align-top">
                    <td className="w-36 py-1 pr-2 font-medium">{field}</td>
                    <td className="py-1">{pair ? <><Value v={pair.from} /> <span className="mx-1 text-[#8a8a8a]">→</span> <Value v={pair.to} /></> : <Value v={v} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {Object.keys(d).length ? (
        <details>
          <summary className="cursor-pointer text-[#005bd3]">All details</summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-[#e3e3e3] bg-white p-2 text-[11px] leading-snug">{JSON.stringify(d, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

/** Everything every admin has done: sign-ins, edits, deletions, uploads and team changes. */
export function ActivityPanel() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [area, setArea] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const log = useQuery({
    queryKey: ["admin", "activity", { q, user, action, area, from, to, page }],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page) });
      for (const [k, v] of Object.entries({ q, user, action, area, from, to })) if (v) qs.set(k, v);
      return api<Page>(`/admin/activity?${qs}`);
    },
    placeholderData: (previous) => previous,
    staleTime: 0,
  });
  const data = log.data;
  const reset = (fn: () => void) => { fn(); setPage(1); setOpen(null); };

  return (
    <Card
      title={`Activity log${data ? ` (${data.total})` : ""}`}
      flush
      actions={<IconBtn icon={RefreshCw} label="Refresh" onClick={() => void log.refetch()} className={cn("size-8 border-[#c9c9c9] bg-white", log.isFetching && "[&>svg]:animate-spin")} />}
    >
      <p className="px-4 pb-3 text-xs text-[#616161]">A record of every sign-in and every change made in the admin panel: who did it, what, to which record, when and from which address. Times are India time.</p>
      <div className="flex flex-wrap items-center gap-2 border-t border-[#ebebeb] bg-[#fafafa] px-4 py-2.5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" aria-label="Search the log" className={cn(adminInput, "!w-44")} />
        <select value={user} onChange={(e) => reset(() => setUser(e.target.value))} aria-label="User" className={cn(adminInput, "!w-auto")}>
          <option value="">All users</option>
          {(data?.filters.users ?? []).map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={action} onChange={(e) => reset(() => setAction(e.target.value))} aria-label="Type of action" className={cn(adminInput, "!w-auto")}>
          <option value="">All actions</option>
          {(data?.filters.actions ?? []).map((a) => <option key={a} value={a}>{nice(a)}</option>)}
        </select>
        <select value={area} onChange={(e) => reset(() => setArea(e.target.value))} aria-label="Area" className={cn(adminInput, "!w-auto")}>
          <option value="">All areas</option>
          {(data?.filters.areas ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#616161]">From <input type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} className={cn(adminInput, "!w-auto")} /></label>
        <label className="flex items-center gap-1.5 text-xs text-[#616161]">To <input type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} className={cn(adminInput, "!w-auto")} /></label>
      </div>

      {log.isPending ? (
        <TableSkeleton cols={4} rows={8} checkbox={false} />
      ) : log.isError ? (
        <p className="px-4 py-6 text-[13px] text-[#616161]">Could not load the log. <button type="button" className="text-[#005bd3] underline" onClick={() => void log.refetch()}>Try again</button></p>
      ) : !data?.items.length ? (
        <p className="px-4 py-10 text-center text-[13px] text-[#616161]">Nothing recorded for these filters.</p>
      ) : (
        <ul className="divide-y divide-[#ebebeb]">
          {data.items.map((e) => {
            const isOpen = open === e.id;
            return (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-[#f7f7f7]">
                  <span className="mt-0.5 text-[#8a8a8a]">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span>
                  <span className="w-[8.5rem] shrink-0 text-xs text-[#616161]">{when(e.created_at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[e.action] ?? "neutral"}>{nice(e.action)}</Badge>
                      <span className="break-words text-[13px] text-[#303030]">{e.summary}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-[#616161]">{e.email}{e.ip ? ` · ${e.ip}` : ""}</span>
                  </span>
                </button>
                {isOpen ? <Details e={e} /> : null}
              </li>
            );
          })}
        </ul>
      )}

      {(data?.pages ?? 1) > 1 ? (
        <div className="flex items-center justify-center gap-3 border-t border-[#ebebeb] px-4 py-3 text-[13px]">
          <Btn disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setOpen(null); }}>Newer</Btn>
          <span className="text-[#616161]">Page {data?.page} of {data?.pages}</span>
          <Btn disabled={page >= (data?.pages ?? 1)} onClick={() => { setPage((p) => p + 1); setOpen(null); }}>Older</Btn>
        </div>
      ) : null}
    </Card>
  );
}
