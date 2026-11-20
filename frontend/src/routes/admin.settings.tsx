import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ExternalLink, Lock, ShieldCheck } from "lucide-react";
import { ActivityPanel } from "@/components/admin/ActivityPanel";
import { DevicesPanel } from "@/components/admin/DevicesPanel";
import { AdminShell } from "@/components/admin/AdminShell";
import { TeamPanel } from "@/components/admin/TeamPanel";
import { Badge, Btn, Card, Field, adminInput } from "@/components/admin/ui";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { changeAdminPassword } from "@/lib/auth.functions";
import { cn } from "@/lib/utils";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: `Account & security — ${brand.name} Admin` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountGate,
});

type Tab = "account" | "team" | "devices" | "activity";

/** Account & security (password, team, devices, activity log) belongs to the main administrator only. */
function AccountGate() {
  const { loading, isSuper } = useAdminAuth();
  if (loading) return <AdminShell title="Account & security"><FormSkeleton cards={2} fields={4} /></AdminShell>;
  if (!isSuper) {
    return (
      <AdminShell title="Account & security">
        <Card>
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-[#616161]" />
            <div>
              <p className="text-[13px] font-semibold">Only the main administrator can use this page</p>
              <p className="mt-1 text-xs text-[#616161]">Account, team, signed-in devices and the activity log are managed by the main administrator.</p>
            </div>
          </div>
        </Card>
      </AdminShell>
    );
  }
  return <AccountPage />;
}

function AccountPage() {
  const { email, name, isSuper } = useAdminAuth();
  const [tab, setTab] = useState<Tab>("account");

  const tabs: { id: Tab; label: string }[] = [
    { id: "account", label: "Your account" },
    ...(isSuper ? [{ id: "team" as const, label: "Team" }, { id: "devices" as const, label: "Devices" }, { id: "activity" as const, label: "Activity log" }] : []),
  ];

  return (
    <AdminShell title="Account & security">
      {tabs.length > 1 ? (
        <div role="tablist" aria-label="Account sections" className="mb-4 inline-flex overflow-hidden rounded-lg border border-[#c9c9c9] bg-white">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn("px-4 py-1.5 text-[13px] font-medium", tab === t.id ? "bg-[#303030] text-white" : "text-[#303030] hover:bg-[#f7f7f7]")}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "account" || !isSuper ? <YourAccount email={email} name={name} isSuper={isSuper} /> : null}
      {tab === "team" && isSuper ? <TeamPanel meEmail={email} /> : null}
      {tab === "devices" && isSuper ? <DevicesPanel /> : null}
      {tab === "activity" && isSuper ? <ActivityPanel /> : null}
    </AdminShell>
  );
}

function YourAccount({ email, name, isSuper }: { email: string | null; name: string | null; isSuper: boolean }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!current) return void toast.error("Please enter your current password.");
    if (password.length < 10) return void toast.error("Please use a new password of at least 10 characters.");
    if (password !== confirm) return void toast.error("The two new passwords don't match.");
    setBusy(true);
    try {
      const result = await changeAdminPassword({ data: { currentPassword: current, newPassword: password } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Password changed. Signing you in again…");
      setTimeout(() => window.location.assign("/admin"), 1200);
    } catch {
      toast.error("Could not change the password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Your account">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-[#303030] text-base font-bold text-white">{(name || email || "A").slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
              {name || email || "—"}
              {isSuper ? <Badge tone="info"><ShieldCheck className="mr-1 size-3" />Super admin</Badge> : <Badge>Admin</Badge>}
            </p>
            <p className="truncate text-xs text-[#616161]">{email}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-[#616161]">
          Your e-mail and password are your login for this panel. Keep the password private: it is never stored anywhere in readable form, and there is no e-mail reset.
          {isSuper ? " As the main administrator you can add other admins in the Team tab and see everything they do in the Activity log." : " Your actions in this panel are recorded in the activity log."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9c9] bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-[#f7f7f7]"><ExternalLink className="size-3.5" /> View live website</a>
          <a href="/shop" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9c9] bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-[#f7f7f7]"><ExternalLink className="size-3.5" /> View shop</a>
        </div>
      </Card>

      <Card title="Change password">
        <form onSubmit={changePassword} className="space-y-3" noValidate>
          <Field label="Current password"><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={adminInput} /></Field>
          <Field label="New password" help="At least 10 characters."><input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className={adminInput} /></Field>
          <Field label="Repeat new password"><input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={adminInput} /></Field>
          <Btn variant="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Btn>
          <p className="text-xs text-[#616161]">Changing the password signs every browser out, including this one.</p>
        </form>
      </Card>
    </div>
  );
}
