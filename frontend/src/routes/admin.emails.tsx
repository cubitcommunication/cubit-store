import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Btn, Card, Field, adminInput, when } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";
import { MailServersPanel, SendFrom } from "@/components/admin/MailServersPanel";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/emails")({
  head: () => ({ meta: [{ title: `Emails — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Emails,
});

type Template = {
  key: string; label: string; audience: "customer" | "admin"; help: string; tokens: string[];
  subject: string; body: string; enabled: boolean; customised: boolean; defaultSubject: string; defaultBody: string;
};
type Data = {
  settings: Record<string, string>;
  templates: Template[];
  smtp: { live: boolean; isSuper: boolean; accounts: number | null; defaultName: string | null; defaultHost: string | null };
  log: { id: string; template: string; to: string; subject: string; status: string; error: string | null; at: string }[];
};

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

function Emails() {
  const q = useQuery({ queryKey: ["admin", "emails"], queryFn: () => api<Data>("/admin/emails"), staleTime: 0, refetchOnWindowFocus: false });
  const [tab, setTab] = useState<"addresses" | "templates" | "servers" | "log">("addresses");
  const isSuper = q.data?.smtp.isSuper ?? false;
  return (
    <AdminShell title="Emails">
      <p className="mb-3 max-w-3xl text-[13px] text-[#616161]">
        Everything about the e-mails your shop sends: which addresses are used, who gets order alerts, and the wording of every automatic e-mail
        (order, shipping, cancellation, refund and abandoned cart).
      </p>
      <div className="mb-4 flex gap-1 border-b border-[#e3e3e3]">
        {([["addresses", "Addresses & alerts"], ["templates", "E-mail templates"], ...(isSuper ? [["servers", "Mail servers"] as const] : []), ["log", "Sent log"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${tab === k ? "border-[#303030] text-[#303030]" : "border-transparent text-[#616161] hover:text-[#303030]"}`}>{l}</button>
        ))}
      </div>
      {q.isPending ? <FormSkeleton cards={2} fields={4} /> : q.isError ? <p className="text-[13px]">Could not load the e-mail settings. Please refresh.</p> : tab === "addresses" ? <Addresses data={q.data} /> : tab === "templates" ? <Templates data={q.data} /> : tab === "servers" && isSuper ? <MailServersPanel defaultTo={(q.data.settings["admin_emails"] ?? "").split(/[\s,;]+/)[0] ?? ""} /> : <Log data={q.data} />}
    </AdminShell>
  );
}

/* ------------------------------------------------------------------ addresses */

function Toggle({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-[13px]">
      <input type="checkbox" className="mt-0.5 size-4 accent-[#303030]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="font-medium">{label}</span>{help ? <span className="block text-xs text-[#616161]">{help}</span> : null}</span>
    </label>
  );
}

function Addresses({ data }: { data: Data }) {
  const qc = useQueryClient();
  const [v, setV] = useState(data.settings);
  const set = (k: string) => (value: string) => setV((s) => ({ ...s, [k]: value }));
  const save = useMutation({
    mutationFn: () => api("/admin/emails/settings", { method: "POST", body: { values: v } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "emails"] });
      void qc.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("E-mail settings saved");
    },
    onError: (e) => toast.error(msg(e)),
  });
  const dirty = JSON.stringify(v) !== JSON.stringify(data.settings);
  const s = data.smtp;

  return (
    <div className="grid max-w-3xl gap-4">
      <Card title="Sending status">
        {s.live ? (
          <p className="text-[13px]"><Badge tone="success">On</Badge> E-mails are being sent{s.isSuper && s.defaultName ? <> through <strong>{s.defaultName}</strong> ({s.defaultHost})</> : null}.</p>
        ) : (
          <p className="text-[13px]"><Badge tone="critical">Off</Badge> No mail server is set up yet, so e-mails are not being sent.{s.isSuper ? " Add one in the Mail servers tab." : " Ask the main administrator to set one up."}</p>
        )}
        <p className="mt-2 text-xs text-[#616161]">Use <strong>Send test</strong> in the templates tab to check that e-mail really arrives.</p>
      </Card>

      <Card title="Company e-mail addresses">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sender name" help="Shown as the sender of every e-mail."><input className={adminInput} value={v["from_name"] ?? ""} maxLength={80} onChange={(e) => set("from_name")(e.target.value)} /></Field>
          <Field label="Orders e-mail" help="Used as the sender when no mail account (Mail servers tab) is chosen for an e-mail. Otherwise the account's own From address is used."><input className={adminInput} type="email" value={v["orders_email"] ?? ""} onChange={(e) => set("orders_email")(e.target.value)} /></Field>
          <Field label="Support e-mail" help="Customers' replies go here, and it is shown on your website (header, footer, Contact page, policies)."><input className={adminInput} type="email" value={v["support_email"] ?? ""} onChange={(e) => set("support_email")(e.target.value)} /></Field>
          <Field label="Alert e-mails" help="Who is told about new orders, payments, cancellations and abandoned carts. Separate several addresses with commas."><input className={adminInput} value={v["admin_emails"] ?? ""} onChange={(e) => set("admin_emails")(e.target.value)} /></Field>
        </div>
      </Card>

      <Card title="What is sent">
        <div className="space-y-3">
          <Toggle label="E-mails to customers" help="Order confirmation, payment, shipping, cancellation, refund and abandoned-cart reminders. Each can also be switched off in the templates tab." checked={v["send_customer_emails"] === "1"} onChange={(c) => set("send_customer_emails")(c ? "1" : "0")} />
          <Toggle label="Alert me about new orders" checked={v["notify_admin_new_order"] === "1"} onChange={(c) => set("notify_admin_new_order")(c ? "1" : "0")} />
          <Toggle label="Alert me when a payment is recorded" checked={v["notify_admin_payment"] === "1"} onChange={(c) => set("notify_admin_payment")(c ? "1" : "0")} />
          <Toggle label="Alert me when an order is cancelled" checked={v["notify_admin_cancel"] === "1"} onChange={(c) => set("notify_admin_cancel")(c ? "1" : "0")} />
          <p className="text-xs text-[#616161]">Abandoned-cart reminders and alerts are set up in Admin → Abandoned carts.</p>
        </div>
      </Card>

      <div className="flex justify-end"><Btn variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Btn></div>
    </div>
  );
}

/* ------------------------------------------------------------------ templates */

function Templates({ data }: { data: Data }) {
  const [key, setKey] = useState(data.templates[0]!.key);
  const groups = [["customer", "Customer e-mails"], ["admin", "Alerts to you"]] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
      <nav aria-label="E-mails" className="space-y-4">
        {groups.map(([aud, title]) => (
          <div key={aud}>
            <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-[#616161]">{title}</p>
            <ul className="space-y-0.5">
              {data.templates.filter((t) => t.audience === aud).map((t) => (
                <li key={t.key}>
                  <button type="button" onClick={() => setKey(t.key)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${key === t.key ? "bg-white font-semibold shadow-[0_0_0_1px_#e3e3e3]" : "hover:bg-white/60"}`}>
                    <span>{t.label}</span>
                    {!t.enabled ? <Badge tone="attention">Off</Badge> : t.customised ? <Badge tone="info">Edited</Badge> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <TemplateEditor key={key} template={data.templates.find((t) => t.key === key)!} defaultTo={(data.settings["admin_emails"] ?? "").split(/[\s,;]+/)[0] ?? ""} />
    </div>
  );
}

function TemplateEditor({ template: t, defaultTo }: { template: Template; defaultTo: string }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [enabled, setEnabled] = useState(t.enabled);
  const [to, setTo] = useState(defaultTo);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = subject !== t.subject || body !== t.body || enabled !== t.enabled;

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "emails"] });
  const save = useMutation({
    mutationFn: () => api("/admin/emails/template", { method: "POST", body: { key: t.key, subject, body, enabled } }),
    onSuccess: () => { void refresh(); toast.success("E-mail saved"); },
    onError: (e) => toast.error(msg(e)),
  });
  const reset = useMutation({
    mutationFn: () => api("/admin/emails/template", { method: "POST", body: { key: t.key, reset: true } }),
    onSuccess: () => { setSubject(t.defaultSubject); setBody(t.defaultBody); setEnabled(true); void refresh(); toast.success("Back to the standard wording"); },
    onError: (e) => toast.error(msg(e)),
  });
  const show = useMutation({
    mutationFn: () => api<{ subject: string; html: string }>("/admin/emails/preview", { method: "POST", body: { key: t.key, subject, body } }),
    onSuccess: setPreview,
    onError: (e) => toast.error(msg(e)),
  });
  const test = useMutation({
    mutationFn: () => api("/admin/emails/test", { method: "POST", body: { key: t.key, subject, body, to } }),
    onSuccess: () => { void refresh(); toast.success(`Test e-mail sent to ${to}`); },
    onError: (e) => { void refresh(); toast.error(msg(e)); },
  });

  // Show the preview of the saved text the first time.
  useEffect(() => { show.mutate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function insert(token: string) {
    const el = area.current;
    const text = `{{${token}}}`;
    if (!el) return setBody((b) => `${b}${text}`);
    const a = el.selectionStart ?? body.length;
    const z = el.selectionEnd ?? body.length;
    setBody(body.slice(0, a) + text + body.slice(z));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + text.length, a + text.length); });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title={t.label} actions={<label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="size-4 accent-[#303030]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Send this e-mail</label>}>
        <p className="mb-3 text-xs text-[#616161]">{t.help}</p>
        <SendFrom templateKey={t.key} />
        <div className="space-y-3">
          <Field label="Subject"><input className={adminInput} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Message" help="A blank line starts a new paragraph. **text** makes bold. Click a tag below to put it in the message.">
            <textarea ref={area} className={`${adminInput} font-mono text-[12.5px]`} rows={14} maxLength={8000} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-[#616161]">Details you can insert</p>
            <div className="flex flex-wrap gap-1.5">
              {[...t.tokens, "store_name", "support_email"].map((k) => (
                <button key={k} type="button" onClick={() => insert(k)} className="rounded-full border border-[#d4d4d4] bg-[#f7f7f7] px-2 py-0.5 font-mono text-[11px] hover:border-[#303030]">{`{{${k}}}`}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Btn variant="danger" disabled={!t.customised || reset.isPending} onClick={() => { if (window.confirm("Go back to the standard wording of this e-mail?")) reset.mutate(); }}>Reset to standard</Btn>
            <div className="flex gap-2">
              <Btn disabled={show.isPending} onClick={() => show.mutate()}>{show.isPending ? "Updating…" : "Refresh preview"}</Btn>
              <Btn variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="Preview (with sample details)">
          {preview ? (
            <>
              <p className="mb-2 text-[13px]"><span className="text-[#616161]">Subject:</span> <strong>{preview.subject}</strong></p>
              <iframe title="E-mail preview" sandbox="" srcDoc={preview.html} className="h-[560px] w-full rounded-lg border border-[#e3e3e3] bg-white" />
            </>
          ) : <FormSkeleton cards={2} fields={4} />}
        </Card>
        <Card title="Send a test">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1"><Field label="Send to"><input className={adminInput} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" /></Field></div>
            <Btn disabled={!to.trim() || test.isPending} onClick={() => test.mutate()}>{test.isPending ? "Sending…" : "Send test"}</Btn>
          </div>
          <p className="mt-2 text-xs text-[#616161]">Sends this wording (even if unsaved) with made-up order details, from your orders address.</p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ log */

function Log({ data }: { data: Data }) {
  const names = Object.fromEntries(data.templates.map((t) => [t.key, t.label]));
  return (
    <Card title="Latest e-mails (newest first)" flush>
      {data.log.length === 0 ? (
        <p className="p-6 text-[13px] text-[#616161]">Nothing has been sent yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead><tr className="border-y border-[#e3e3e3] bg-[#f7f7f7] text-xs text-[#616161]"><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">E-mail</th><th className="px-3 py-2 font-medium">To</th><th className="px-3 py-2 font-medium">Result</th></tr></thead>
            <tbody>
              {data.log.map((r) => (
                <tr key={r.id} className="border-b border-[#ebebeb] last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-[#616161]">{when(r.at)}</td>
                  <td className="px-3 py-2"><span className="font-medium">{names[r.template] ?? r.template}</span><br /><span className="text-xs text-[#616161]">{r.subject}</span></td>
                  <td className="px-3 py-2">{r.to}</td>
                  <td className="px-3 py-2">{r.status === "sent" ? <Badge tone="success">Sent</Badge> : <><Badge tone="critical">Failed</Badge>{r.error ? <p className="mt-1 max-w-xs text-xs text-[#8e1f0b]">{r.error}</p> : null}</>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
