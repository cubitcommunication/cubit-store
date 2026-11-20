import { brand } from "@/config/brand";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Send, Star, Trash2, X } from "lucide-react";
import { Badge, Btn, Card, IconBtn, adminInput } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { cn } from "@/lib/utils";
import { LoadingRows } from "@/components/ui/loading-rows";

export type SmtpAccount = {
  id: string; name: string; host: string; port: number; security: "ssl" | "tls"; username: string | null;
  hasPassword: boolean; from_email: string; from_name: string | null; is_default: boolean;
};
type SmtpData = { accounts: SmtpAccount[]; assignments: Record<string, string>; envFallback: boolean };

export const smtpQuery = () => ({ queryKey: ["admin", "smtp"] as const, queryFn: () => api<SmtpData>("/admin/smtp"), staleTime: 0 });
const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

/** "Send this e-mail from" choice for one template. Only the main administrator sees it. */
export function SendFrom({ templateKey }: { templateKey: string }) {
  const qc = useQueryClient();
  const { isSuper } = useAdminAuth();
  const q = useQuery({ ...smtpQuery(), enabled: isSuper });
  const set = useMutation({
    mutationFn: (account: string) => api("/admin/smtp/assign", { method: "POST", body: { template: templateKey, account } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "smtp"] }); toast.success("Saved"); },
    onError: (e) => toast.error(msg(e)),
  });
  const accounts = q.data?.accounts ?? [];
  if (!isSuper || !accounts.length) return null;
  const def = accounts.find((a) => a.is_default);
  return (
    <label className="mb-3 block text-[13px]">
      <span className="font-medium">Send this e-mail from</span>
      <select
        value={q.data?.assignments[templateKey] ?? ""}
        onChange={(e) => set.mutate(e.target.value)}
        disabled={set.isPending}
        className={cn(adminInput, "mt-1 !w-auto min-w-[16rem]")}
      >
        <option value="">Default mail account{def ? ` (${def.name} — ${def.from_email})` : ""}</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.from_email}</option>)}
      </select>
    </label>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className={cn("relative max-h-full w-full overflow-y-auto rounded-[14px] bg-white p-5 shadow-2xl", wide ? "max-w-xl" : "max-w-md")}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[#303030]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-[#f1f1f1]"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Admin → Emails → Mail servers: the SMTP accounts e-mails go out through. Main administrator only. */
export function MailServersPanel({ defaultTo }: { defaultTo: string }) {
  const qc = useQueryClient();
  const q = useQuery(smtpQuery());
  const [editing, setEditing] = useState<SmtpAccount | "new" | null>(null);
  const [deleting, setDeleting] = useState<SmtpAccount | null>(null);
  const [testing, setTesting] = useState<SmtpAccount | null>(null);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin", "smtp"] }), qc.invalidateQueries({ queryKey: ["admin", "emails"] }), qc.invalidateQueries({ queryKey: ["admin", "integration-status"] })]);
  const makeDefault = useMutation({
    mutationFn: (a: SmtpAccount) => api(`/admin/smtp/${a.id}/default`, { method: "POST" }),
    onSuccess: async () => { toast.success("Default mail account changed"); await refresh(); },
    onError: (e) => toast.error(msg(e)),
  });
  const remove = useMutation({
    mutationFn: (a: SmtpAccount) => api(`/admin/smtp/${a.id}/delete`, { method: "POST" }),
    onSuccess: async () => { toast.success("Mail account deleted"); setDeleting(null); await refresh(); },
    onError: (e) => toast.error(msg(e)),
  });

  const accounts = q.data?.accounts ?? [];

  return (
    <div className="grid max-w-3xl gap-4">
      <Card
        title={`Mail servers${accounts.length ? ` (${accounts.length})` : ""}`}
        flush
        actions={<IconBtn icon={Plus} label="Add mail account" onClick={() => setEditing("new")} className="size-8 border-[#c9c9c9] bg-white" />}
      >
        <p className="px-4 pb-3 text-xs text-[#616161]">
          The mail accounts (SMTP logins) your e-mails are sent through. Add one for each mailbox you use, for example orders@ and support@. Every e-mail goes out through the <b>default</b> account unless you choose another one for it in the E-mail templates tab. Passwords are stored encrypted and are never shown again.
        </p>
        {q.isPending ? (
          <LoadingRows />
        ) : q.isError ? (
          <p className="px-4 pb-4 text-[13px] text-[#616161]">Could not load. <button type="button" className="text-[#005bd3] underline" onClick={() => void q.refetch()}>Try again</button></p>
        ) : !accounts.length ? (
          <div className="border-t border-[#ebebeb] px-4 py-8 text-center">
            <p className="text-[13px] font-semibold">No mail account yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[#616161]">{q.data?.envFallback ? "E-mails are currently sent with the settings in the server .env file. Add an account here to manage them from the admin instead." : "Add your SMTP details (for Hostinger: smtp.hostinger.com, port 465, your mailbox and its password) so order e-mails can be sent."}</p>
            <Btn variant="primary" className="mt-3" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add mail account</Btn>
          </div>
        ) : (
          <ul className="divide-y divide-[#ebebeb] border-t border-[#ebebeb]">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#303030]">
                    <span className="truncate">{a.name}</span>
                    {a.is_default ? <Badge tone="success">Default</Badge> : null}
                    {!a.hasPassword ? <Badge tone="attention">No password</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-[#616161]">{a.from_name ? `${a.from_name} · ` : ""}{a.from_email}</p>
                  <p className="truncate text-xs text-[#8a8a8a]">{a.host}:{a.port} · {a.security === "ssl" ? "SSL" : "TLS"}{a.username ? ` · ${a.username}` : ""}</p>
                </div>
                <div className="ml-auto flex items-center gap-0.5">
                  <IconBtn icon={Send} label={`Send a test through ${a.name}`} onClick={() => setTesting(a)} />
                  <IconBtn icon={Star} label={a.is_default ? "This is the default account" : `Make ${a.name} the default`} disabled={a.is_default || makeDefault.isPending} onClick={() => makeDefault.mutate(a)} className={a.is_default ? "text-[#b98900]" : ""} />
                  <IconBtn icon={Pencil} label={`Edit ${a.name}`} onClick={() => setEditing(a)} />
                  <IconBtn icon={Trash2} tone="danger" label={`Delete ${a.name}`} onClick={() => setDeleting(a)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing ? <AccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} /> : null}

      {testing ? <TestDialog account={testing} defaultTo={defaultTo} onClose={() => setTesting(null)} /> : null}

      {deleting ? (
        <Modal title="Delete this mail account?" onClose={() => setDeleting(null)}>
          <p className="text-[13px] text-[#303030]"><strong>{deleting.name}</strong> ({deleting.from_email}) will be removed, with its saved password. E-mails that used it will go out through the default account instead.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Btn onClick={() => setDeleting(null)}>Cancel</Btn>
            <Btn variant="primary" className="!bg-[#8e1f0b] hover:!bg-[#6f1809]" disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>{remove.isPending ? "Deleting…" : "Delete account"}</Btn>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function AccountDialog({ account, onClose, onSaved }: { account: SmtpAccount | null; onClose: () => void; onSaved: () => void }) {
  const isNew = account === null;
  const [name, setName] = useState(account?.name ?? "");
  const [host, setHost] = useState(account?.host ?? "smtp.hostinger.com");
  const [security, setSecurity] = useState<"ssl" | "tls">(account?.security ?? "ssl");
  const [port, setPort] = useState(String(account?.port ?? 465));
  const [username, setUsername] = useState(account?.username ?? "");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState(account?.from_email ?? "");
  const [fromName, setFromName] = useState(account?.from_name ?? brand.name);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give this account a name, for example Orders.");
      if (!/^[A-Za-z0-9.-]+$/.test(host.trim())) throw new Error("The server name looks wrong. Use something like smtp.hostinger.com.");
      if (!(Number(port) >= 1 && Number(port) <= 65535)) throw new Error("Enter a port number, usually 465 or 587.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail.trim())) throw new Error("Enter the e-mail address e-mails are sent from.");
      const body = { name: name.trim(), host: host.trim(), port: Number(port), security, username: username.trim(), from_email: fromEmail.trim(), from_name: fromName.trim(), ...(password ? { password } : {}) };
      return isNew ? api("/admin/smtp", { method: "POST", body }) : api(`/admin/smtp/${account.id}`, { method: "POST", body });
    },
    onSuccess: () => { toast.success(isNew ? "Mail account added" : "Mail account saved"); onSaved(); },
    onError: (e) => setError(msg(e)),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setError(null); save.mutate(); };

  const pickSecurity = (s: "ssl" | "tls") => {
    setSecurity(s);
    // The usual port for each choice, unless the owner typed their own.
    if (port === "465" || port === "587") setPort(s === "ssl" ? "465" : "587");
  };
  const lbl = "block text-[13px]";

  return (
    <Modal title={isNew ? "Add mail account" : `Edit ${account.name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <label className={lbl}><span className="font-medium">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Orders" className={cn(adminInput, "mt-1")} autoComplete="off" />
          <span className="mt-1 block text-xs text-[#616161]">Only for you, to tell accounts apart.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_6rem]">
          <label className={lbl}><span className="font-medium">SMTP server</span>
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.hostinger.com" className={cn(adminInput, "mt-1")} autoComplete="off" spellCheck={false} />
          </label>
          <label className={lbl}><span className="font-medium">Security</span>
            <select value={security} onChange={(e) => pickSecurity(e.target.value as "ssl" | "tls")} className={cn(adminInput, "mt-1")}>
              <option value="ssl">SSL (port 465)</option>
              <option value="tls">TLS / STARTTLS (port 587)</option>
            </select>
          </label>
          <label className={lbl}><span className="font-medium">Port</span>
            <input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} className={cn(adminInput, "mt-1")} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}><span className="font-medium">Login (username)</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="orders@example.com" className={cn(adminInput, "mt-1")} autoComplete="off" spellCheck={false} />
          </label>
          <label className={lbl}><span className="font-medium">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={account?.hasPassword ? "Saved. Type to replace." : ""} className={cn(adminInput, "mt-1")} autoComplete="new-password" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}><span className="font-medium">Send from (address)</span>
            <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="orders@example.com" className={cn(adminInput, "mt-1")} autoComplete="off" />
            <span className="mt-1 block text-xs text-[#616161]">Normally the same mailbox as the login.</span>
          </label>
          <label className={lbl}><span className="font-medium">Sender name</span>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={80} className={cn(adminInput, "mt-1")} autoComplete="off" />
          </label>
        </div>
        {error ? <p role="alert" className="text-[13px] text-[#8e1f0b]">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : isNew ? "Add account" : "Save"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function TestDialog({ account, defaultTo, onClose }: { account: SmtpAccount; defaultTo: string; onClose: () => void }) {
  const [to, setTo] = useState(defaultTo);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const send = useMutation({
    mutationFn: () => api(`/admin/smtp/${account.id}/test`, { method: "POST", body: { to: to.trim() } }),
    onSuccess: () => setResult({ ok: true, text: `Sent. Check the inbox of ${to.trim()}.` }),
    onError: (e) => setResult({ ok: false, text: msg(e) }),
  });
  return (
    <Modal title={`Test ${account.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); setResult(null); send.mutate(); }} className="space-y-3" noValidate>
        <label className="block text-[13px]"><span className="font-medium">Send a test message to</span>
          <input autoFocus type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" className={cn(adminInput, "mt-1")} />
        </label>
        {result ? <p role="status" className={cn("rounded-lg border px-3 py-2 text-[13px]", result.ok ? "border-[#b4e4c4] bg-[#f0fbf4] text-[#0c5132]" : "border-[#f3c5c0] bg-[#fff4f4] text-[#8e1f0b]")}>{result.text}</p> : null}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Close</Btn>
          <Btn variant="primary" type="submit" disabled={send.isPending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())}>{send.isPending ? "Sending…" : "Send test"}</Btn>
        </div>
      </form>
    </Modal>
  );
}
