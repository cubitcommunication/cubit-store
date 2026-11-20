import { LOCALE, TIMEZONE } from "@/config/brand";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, Monitor, ShieldAlert, Smartphone, UserX } from "lucide-react";
import { Badge, Btn, Card, IconBtn } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { LoadingRows } from "@/components/ui/loading-rows";

export type Device = {
  id: string;
  admin_id: string;
  email: string;
  name: string | null;
  role: "super" | "admin";
  device: string;
  mobile: boolean;
  known: boolean;
  ip: string | null;
  signed_in_at: string | null;
  last_active_at: string | null;
  expires_at: string | null;
  current: boolean;
};

const devicesQuery = () => ({
  queryKey: ["admin", "sessions"] as const,
  queryFn: () => api<{ sessions: Device[] }>("/admin/sessions"),
  staleTime: 0,
  refetchInterval: 30_000,
});

const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(LOCALE, { timeZone: TIMEZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Unknown";

function ago(iso: string | null): string {
  if (!iso) return "Unknown";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "Active now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return stamp(iso);
}

/** Every browser signed in to the admin panel. Main administrator only: sign any device (or person) out. */
export function DevicesPanel() {
  const qc = useQueryClient();
  const list = useQuery(devicesQuery());
  const [confirm, setConfirm] = useState<null | { kind: "others" } | { kind: "user"; id: string; email: string }>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "sessions"] });
  const leave = () => window.location.assign("/admin");

  const revoke = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean; self: boolean }>(`/admin/sessions/${id}/revoke`, { method: "POST", body: {} }),
    onSuccess: (r) => {
      if (r.self) return leave();
      toast.success("Device signed out.");
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeUser = useMutation({
    mutationFn: (adminId: string) => api<{ signedOut: number }>("/admin/sessions/revoke-user", { method: "POST", body: { admin_id: adminId } }),
    onSuccess: (r) => {
      toast.success(r.signedOut === 1 ? "Signed out of 1 device." : `Signed out of ${r.signedOut} devices.`);
      setConfirm(null);
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api<{ signedOut: number }>("/admin/sessions/revoke-others", { method: "POST", body: {} }),
    onSuccess: (r) => {
      toast.success(r.signedOut === 1 ? "Signed out 1 other device." : `Signed out ${r.signedOut} other devices.`);
      setConfirm(null);
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sessions = list.data?.sessions ?? [];
  const groups = new Map<string, Device[]>();
  for (const s of sessions) groups.set(s.admin_id, [...(groups.get(s.admin_id) ?? []), s]);
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="space-y-4">
      <Card
        title="Signed-in devices"
        actions={
          <Btn variant="danger" disabled={others === 0} onClick={() => setConfirm({ kind: "others" })}>
            <ShieldAlert className="mr-1.5 size-4" /> Sign out all other devices
          </Btn>
        }
      >
        <p className="text-[13px] text-[#616161]">
          Every browser or phone that is signed in to this admin panel. If a device is lost, or a password may have leaked, sign it out here and it
          is logged out straight away. Only you, the main administrator, can see this.
        </p>
      </Card>

      {confirm ? (
        <Card className="border-[#fed3d1] bg-[#fff4f4]">
          <p className="text-[13px] text-[#303030]">
            {confirm.kind === "others"
              ? "Sign out every device except this one? Everyone else will need to sign in again."
              : `Sign ${confirm.email} out of all of their devices?`}
          </p>
          <div className="mt-3 flex gap-2">
            <Btn
              variant="danger"
              disabled={revokeOthers.isPending || revokeUser.isPending}
              onClick={() => (confirm.kind === "others" ? revokeOthers.mutate() : revokeUser.mutate(confirm.id))}
            >
              Yes, sign out
            </Btn>
            <Btn onClick={() => setConfirm(null)}>Cancel</Btn>
          </div>
        </Card>
      ) : null}

      {list.isLoading ? <LoadingRows /> : null}
      {list.isError ? <p className="text-[13px] text-[#8e1f0b]">Could not load the devices. Please try again.</p> : null}

      {[...groups.entries()].map(([adminId, devices]) => {
        const first = devices[0]!;
        const hasOther = devices.some((d) => !d.current);
        return (
          <Card
            key={adminId}
            flush
            title={
              <span className="flex flex-wrap items-center gap-2">
                {first.name || first.email}
                {first.name ? <span className="font-normal text-[#616161]">{first.email}</span> : null}
                {first.role === "super" ? <Badge tone="info">Main administrator</Badge> : null}
              </span>
            }
            actions={
              hasOther ? <IconBtn icon={UserX} tone="danger" label={`Sign ${first.email} out of all devices`} onClick={() => setConfirm({ kind: "user", id: adminId, email: first.email })} /> : null
            }
          >
            <ul className="divide-y divide-[#f1f1f1]">
              {devices.map((d) => {
                const Icon = d.mobile ? Smartphone : Monitor;
                return (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f1f1f1] text-[#616161]">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#303030]">
                        {d.known ? d.device : "Older sign-in (no device details)"}
                        {d.current ? <Badge tone="success">This device</Badge> : null}
                      </p>
                      <p className="text-xs text-[#616161]">
                        {d.ip ? `IP ${d.ip} · ` : ""}Signed in {stamp(d.signed_in_at)} · {ago(d.last_active_at)}
                      </p>
                    </div>
                    <IconBtn
                      icon={LogOut}
                      tone="danger"
                      label={d.current ? "Sign out this device" : "Sign out this device"}
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(d.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
