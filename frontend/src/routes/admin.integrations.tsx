import { brand } from "@/config/brand";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Btn, Card, Field, adminInput } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";
import { db } from "@/lib/data";
import { useContactInfo } from "@/lib/site-settings";
import { settingsGroupQuery } from "@/lib/settings-group";
import { SecretField, type Source } from "@/components/admin/SecretField";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Lock } from "lucide-react";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({ meta: [{ title: `Integrations — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: IntegrationsGate,
});

/** Integrations hold payment keys and mail logins, so only the main administrator sees them. */
function IntegrationsGate() {
  const { loading, isSuper } = useAdminAuth();
  if (loading) {
    return <AdminShell title="Integrations"><FormSkeleton cards={2} fields={4} /></AdminShell>;
  }
  if (!isSuper) {
    return (
      <AdminShell title="Integrations">
        <Card>
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-[#616161]" />
            <div>
              <p className="text-[13px] font-semibold">Only the main administrator can use this page</p>
              <p className="mt-1 text-xs text-[#616161]">Connected services, payment keys and mail servers are managed by the main administrator. Ask them if something needs changing.</p>
            </div>
          </div>
        </Card>
      </AdminShell>
    );
  }
  return <IntegrationsPage />;
}

type Status = {
  liveTracking: boolean;
  tracking: { ga4: string | null; ga4Mode: "direct" | "gtm"; gtm: string | null; clarity: string | null; meta: string | null; googleVerify: boolean; bingVerify: boolean };
  recaptcha: { siteKey: boolean; secret: boolean; secretSource: Source; active: boolean };
  razorpay: { keyId: boolean; keyIdValue: string; secret: boolean; keyIdSource: Source; secretSource: Source; webhookSource: Source; mode: "test" | "live" | null; webhookSecret: boolean; webhookUrl: string; webhookLastReceived: string | null; switchedOn: boolean; ready: boolean };
  mail: { accounts: number; configured: boolean };
  shiprocket: { email: string; emailSource: Source; password: boolean; passwordSource: Source; webhookSource: Source; webhookUrl: string; webhookLastReceived: string | null; enabled: boolean; ready: boolean; pickupLocation: string };
};

/** The same formats the server accepts. An empty value is always fine (the tool is simply off). */
const RULES: Record<string, { pattern: RegExp; hint: string }> = {
  ga4_measurement_id: { pattern: /^G-[A-Z0-9]{4,20}$/, hint: "Looks like G-XXXXXXXXXX" },
  gtm_container_id: { pattern: /^GTM-[A-Z0-9]{4,12}$/, hint: "Looks like GTM-XXXXXXX" },
  clarity_project_id: { pattern: /^[a-z0-9]{6,20}$/, hint: "A short lowercase code, for example ylt7uihcpe" },
  meta_pixel_id: { pattern: /^[0-9]{8,20}$/, hint: "Digits only, 8 to 20 of them" },
  google_site_verification: { pattern: /^[A-Za-z0-9_-]{20,100}$/, hint: "Only the code inside content=\"…\"" },
  bing_site_verification: { pattern: /^[A-Fa-f0-9]{20,64}$/, hint: "Letters A–F and digits" },
  recaptcha_site_key: { pattern: /^6L[A-Za-z0-9_-]{30,50}$/, hint: "The public site key; it starts with 6L" },
};

const ok = (v: string) => v === "" || true;

function Dot({ on, label }: { on: boolean; label: string }) {
  return <Badge tone={on ? "success" : "neutral"}>{on ? "✓ " : ""}{label}</Badge>;
}

function Section({ title, badge, children, className }: { title: string; badge?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card title={<span className="flex flex-wrap items-center gap-2">{title}{badge}</span>} {...(className ? { className } : {})}>
      <div className="grid gap-3">{children}</div>
    </Card>
  );
}

function IntegrationsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const contact = useContactInfo();
  const settings = useQuery(settingsGroupQuery("integrations"));
  const status = useQuery({ queryKey: ["admin", "integration-status"], queryFn: () => api<Status>("/admin/integrations/status") });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (settings.data) setDraft(Object.fromEntries(settings.data.map((r) => [r.key, r.value ?? ""])));
  }, [settings.data]);

  const v = (key: string) => draft[key] ?? "";
  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = (settings.data ?? []).some((r) => (draft[r.key] ?? "") !== (r.value ?? ""));
  const problem = (key: string) => (v(key) !== "" && RULES[key] && !RULES[key]!.pattern.test(v(key).trim()) ? RULES[key]!.hint : null);
  const anyProblem = Object.keys(RULES).some((k) => problem(k));

  async function save() {
    if (anyProblem) {
      toast.error("Please fix the highlighted fields first.");
      return;
    }
    setSaving(true);
    try {
      for (const r of settings.data ?? []) {
        if ((draft[r.key] ?? "") === (r.value ?? "")) continue;
        const { error } = await db.from("site_settings").update({ value: (draft[r.key] ?? "").trim() }).eq("key", r.key);
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["admin", "site-settings"] });
      await qc.invalidateQueries({ queryKey: ["admin", "integration-status"] });
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      await router.invalidate();
      toast.success("Saved. The website is updated.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const [pickups, setPickups] = useState<{ ok: boolean; message: string; locations?: { name: string; pincode: string; city: string }[] } | null>(null);
  const testShiprocket = useMutation({
    mutationFn: () => api<{ ok: boolean; message: string; locations?: { name: string; pincode: string; city: string }[] }>("/admin/integrations/test-shiprocket", { method: "POST" }),
    onSuccess: (r) => setPickups(r),
    onError: (e) => setPickups({ ok: false, message: e instanceof ApiError ? e.message : "Could not run the test." }),
  });

  const testRazorpay = useMutation({
    mutationFn: () => api<{ ok: boolean; message: string }>("/admin/integrations/test-razorpay", { method: "POST" }),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not run the test."),
  });

  const text = (key: string, label: string, help: string, placeholder: string, upper = false) => (
    <Field label={label} help={problem(key) ?? help}>
      <input
        className={`${adminInput} ${problem(key) ? "!border-[#c70a24] focus:!border-[#c70a24]" : ""} ${upper ? "uppercase" : ""}`}
        value={v(key)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => set(key, upper ? e.target.value.toUpperCase() : e.target.value)}
      />
    </Field>
  );

  const s = status.data;
  const live = s?.liveTracking ?? true;
  const gtmOn = v("gtm_container_id") !== "" && !problem("gtm_container_id");
  const gaOn = v("ga4_measurement_id") !== "" && !problem("ga4_measurement_id");
  const clarityOn = v("clarity_project_id") !== "" && !problem("clarity_project_id");
  const metaOn = v("meta_pixel_id") !== "" && !problem("meta_pixel_id");
  const keyOn = v("recaptcha_site_key") !== "" && !problem("recaptcha_site_key");
  void ok;

  return (
    <AdminShell title="Integrations" actions={<Btn variant="primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</Btn>}>
      <p className="mb-4 max-w-3xl text-[13px] text-[#616161]">
        Connect {brand.name} to Google, Microsoft, Meta and your payment service. Secret keys you enter here (Razorpay, reCAPTCHA secret) are stored encrypted and are never shown again:
        the boxes stay empty and only say whether a key is saved. Mail servers are in Emails → Mail servers. Only the main administrator can see this page.
      </p>
      {!live ? (
        <p className="mb-4 max-w-3xl rounded-lg border border-[#ffd79d] bg-[#fff7e6] px-3 py-2 text-[13px] text-[#5e4200]">
          This is a local copy: analytics, Tag Manager, Clarity and the Meta Pixel are not loaded here, so your own testing is never counted. They load on the live website.
        </p>
      ) : null}

      {settings.isPending ? (
        <FormSkeleton cards={2} fields={4} />
      ) : settings.isError ? (
        <Card><p className="text-[13px]">Something went wrong. <Btn onClick={() => void settings.refetch()}>Retry</Btn></p></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section className="lg:col-span-2" title="Google Analytics & Tag Manager" badge={<><Dot on={gaOn} label="Analytics" /><Dot on={gtmOn} label="Tag Manager" /></>}>
            <div className="grid gap-3 lg:grid-cols-2">
              {text("ga4_measurement_id", "Google Analytics 4 measurement ID", "Find it in Analytics → Admin → Data streams.", "G-XXXXXXXXXX", true)}
              {text("gtm_container_id", "Google Tag Manager container ID", "Find it at the top of your container in Tag Manager.", "GTM-XXXXXXX", true)}
            </div>
            <fieldset className="rounded-lg border border-[#e3e3e3] p-3">
              <legend className="px-1 text-[13px] font-medium">How is Google Analytics installed?</legend>
              <label className="flex items-start gap-2 py-1 text-[13px]">
                <input type="radio" name="ga4mode" className="mt-0.5" checked={v("ga4_mode") !== "gtm"} onChange={() => set("ga4_mode", "direct")} />
                <span><b>Directly, with the ID above</b> — the website loads Analytics itself. Choose this if your Tag Manager container has no Analytics tag.</span>
              </label>
              <label className="flex items-start gap-2 py-1 text-[13px]">
                <input type="radio" name="ga4mode" className="mt-0.5" checked={v("ga4_mode") === "gtm"} onChange={() => set("ga4_mode", "gtm")} />
                <span><b>Inside Tag Manager</b> — your container already contains a Google Analytics 4 tag. The website then loads only Tag Manager, so visits are never counted twice.</span>
              </label>
            </fieldset>
            {gaOn && gtmOn && v("ga4_mode") !== "gtm" ? (
              <p role="alert" className="rounded-lg border border-[#ffd79d] bg-[#fff7e6] px-3 py-2 text-[13px] text-[#5e4200]">
                Analytics and Tag Manager are both on. If your Tag Manager container also has a Google Analytics tag for the same property, every visit is counted twice — in that case choose “Inside Tag Manager”.
              </p>
            ) : null}
            <div className="rounded-lg bg-[#f7f7f7] p-3 text-[13px] text-[#303030]">
              <p className="font-medium">Shop events the website sends (standard Google Analytics 4 names)</p>
              <p className="mt-1 text-[#616161]">
                view_item · add_to_cart · remove_from_cart · view_cart · begin_checkout · purchase (with order number, total, shipping and discount code) · whatsapp_enquiry · whatsapp_click · generate_lead (newsletter) · sign_up · login · and a virtual_page_view for every page change inside the site.
                Analytics’ standard e-commerce reports work with no extra set-up. To check it, use Analytics → Admin → DebugView, or Tag Assistant, on your live website.
              </p>
            </div>
          </Section>

          <Section title="Microsoft Clarity" badge={<Dot on={clarityOn} label="On" />}>
            {text("clarity_project_id", "Clarity project ID", "Clarity → Settings → Overview → Project ID.", "ylt7uihcpe")}
            <p className="text-xs text-[#616161]">Heatmaps and session recordings. Leave empty to turn it off.</p>
          </Section>

          <Section title="Meta (Facebook / Instagram) Pixel" badge={<Dot on={metaOn} label="On" />}>
            {text("meta_pixel_id", "Pixel ID", "Meta Events Manager → Data sources → your Pixel.", "123456789012345")}
            <p className="text-xs text-[#616161]">Reports page views, product views, add to cart, checkout and purchases to Meta for ads. Leave empty to turn it off.</p>
          </Section>

          <Section title="Search engines" badge={<><Dot on={s?.tracking.googleVerify ?? false} label="Google" /><Dot on={s?.tracking.bingVerify ?? false} label="Bing" /></>}>
            {text("google_site_verification", "Google Search Console verification code", "Search Console → Settings → Ownership verification → HTML tag. Paste only the code from content=\"…\".", "abcdEFGH…")}
            {text("bing_site_verification", "Bing Webmaster verification code", "Bing Webmaster Tools → Verify → HTML meta tag (msvalidate.01).", "0123ABCD…")}
          </Section>

          <Section title="Google reCAPTCHA v3" badge={s ? <Dot on={s.recaptcha.active} label={s.recaptcha.active ? "Protecting forms" : "Off"} /> : undefined}>
            {text("recaptcha_site_key", "Site key (public)", "From google.com/recaptcha/admin: create a v3 site, add example.com as the domain.", "6L…")}
            <div className="rounded-lg bg-[#f7f7f7] p-3 text-[13px]">
              <SecretField label="Secret key" secretKey="recaptcha_secret" source={s?.recaptcha.secretSource} placeholder="6L… (the secret key, kept private)" help="Protection switches on only when both the site key and the secret key exist." onSaved={() => void status.refetch()} />
              {s && s.recaptcha.secret && !keyOn ? <p className="mt-1.5 text-[#616161]">Enter the public site key above to switch protection on.</p> : null}
              <p className="mt-1.5 text-[#616161]">Protects, invisibly: newsletter sign-up, customer sign-up, sign-in, forgotten password and checkout. If Google can’t be reached, customers are never blocked.</p>
            </div>
          </Section>

          <Section title="Razorpay payments" badge={s ? <><Dot on={s.razorpay.ready} label={s.razorpay.ready ? "Ready" : "Not ready"} />{s.razorpay.mode ? <Badge tone={s.razorpay.mode === "live" ? "attention" : "info"}>{s.razorpay.mode === "live" ? "Live mode" : "Test mode"}</Badge> : null}</> : undefined}>
            <SecretField label="Key ID" secret={false} current={s?.razorpay.keyIdValue ?? ""} key={`kid-${s?.razorpay.keyIdValue ?? ""}`} secretKey="razorpay_key_id" source={s?.razorpay.keyIdSource} placeholder="rzp_test_… or rzp_live_…" help="Razorpay dashboard → Settings → API keys. Use test keys first and place a test order before switching to live keys." onSaved={() => void status.refetch()} />
            <SecretField label="Key secret" secretKey="razorpay_key_secret" source={s?.razorpay.secretSource} placeholder="The key secret shown once when the key is created" help="Stored encrypted. It is never shown again, so keep your own copy." onSaved={() => void status.refetch()} />
            <ul className="grid gap-1.5 text-[13px]">
              <li>“Online payment” switch: {s ? <Dot on={s.razorpay.switchedOn} label={s.razorpay.switchedOn ? "on" : "off"} /> : "…"} <Link to="/admin/commerce" className="ml-1 text-[#005bd3] hover:underline">Change in Store features</Link></li>
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Btn disabled={testRazorpay.isPending} onClick={() => testRazorpay.mutate()}>{testRazorpay.isPending ? "Testing…" : "Test the connection"}</Btn>
              <span className="text-xs text-[#616161]">Asks Razorpay whether the keys are accepted. It creates nothing.</span>
            </div>
            <div className="grid gap-1.5 border-t border-[#e3e3e3] pt-3 text-[13px]">
              <b>Webhook (so payments are never missed)</b>
              <p className="text-xs text-[#616161]">
                If a customer pays but closes the browser before the site hears back, Razorpay tells the server directly and the order is marked paid.
                Failed payments and refunds are recorded on the order too.
              </p>
              <SecretField label="Webhook secret" secretKey="razorpay_webhook_secret" source={s?.razorpay.webhookSource} placeholder="The secret you chose when adding the webhook" onSaved={() => void status.refetch()} />
              <ul className="grid gap-1.5">
                <li>Last call from Razorpay: {s ? (s.razorpay.webhookLastReceived ? new Date(s.razorpay.webhookLastReceived).toLocaleString() : "none yet") : "…"}</li>
                <li>Webhook URL: <code className="break-all">{s?.razorpay.webhookUrl ?? "…"}</code></li>
              </ul>
              <p className="text-xs text-[#616161]">
                In Razorpay → Settings → Webhooks → Add new webhook: paste the URL, choose a secret, tick <code>payment.captured</code>, <code>payment.failed</code>,{" "}
                <code>order.paid</code> and <code>refund.processed</code>, then save the same secret in the Webhook secret box above.
              </p>
            </div>
          </Section>

          <Section className="lg:col-span-2" title="Shiprocket shipping" badge={s ? <Dot on={s.shiprocket.ready} label={s.shiprocket.ready ? "Ready" : s.shiprocket.enabled ? "Needs login" : "Off"} /> : undefined}>
            <p className="text-xs text-[#616161]">
              Books couriers, prints labels and tracks parcels from each order, and lets shoppers check delivery to their PIN code on the product page. Create an <b>API user</b> in Shiprocket
              (Settings → API → Configure → Create an API user) and enter its e-mail and password here: it must be a different e-mail from your normal Shiprocket login. The password is stored encrypted and never shown again.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <SecretField label="API user e-mail" secret={false} current={s?.shiprocket.email ?? ""} key={`sre-${s?.shiprocket.email ?? ""}`} secretKey="shiprocket_email" source={s?.shiprocket.emailSource} placeholder="api-user@yourdomain.com" onSaved={() => void status.refetch()} />
              <SecretField label="API user password" secretKey="shiprocket_password" source={s?.shiprocket.passwordSource} placeholder="The API user's password" onSaved={() => void status.refetch()} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn disabled={testShiprocket.isPending} onClick={() => testShiprocket.mutate()}>{testShiprocket.isPending ? "Connecting…" : "Test the connection"}</Btn>
              <span className="text-xs text-[#616161]">Signs in to Shiprocket and loads your pickup addresses. It creates nothing and costs nothing.</span>
            </div>
            {pickups ? (
              <p role="status" className={`rounded-lg border px-3 py-2 text-[13px] ${pickups.ok ? "border-[#b4e4c4] bg-[#f0fbf4] text-[#0c5132]" : "border-[#f3c5c0] bg-[#fff4f4] text-[#8e1f0b]"}`}>{pickups.message}</p>
            ) : null}
            <div className="grid gap-3 border-t border-[#e3e3e3] pt-3 lg:grid-cols-2">
              <label className="flex items-start gap-2 text-[13px] lg:col-span-2">
                <input type="checkbox" className="mt-0.5 size-4 accent-[#303030]" checked={v("shiprocket_enabled") === "1"} onChange={(e) => set("shiprocket_enabled", e.target.checked ? "1" : "0")} />
                <span><b>Use Shiprocket for shipping</b><span className="block text-xs text-[#616161]">Switches on the Shipping box on every order and the delivery check on product pages. Press “Save changes” at the top to apply.</span></span>
              </label>
              <Field label="Pickup address" help="The pickup address name in Shiprocket (Settings → Pickup addresses). Test the connection to pick it from your list.">
                <input className={adminInput} list="sr-pickups" value={v("shiprocket_pickup_location")} onChange={(e) => set("shiprocket_pickup_location", e.target.value)} placeholder="Warehouse" autoComplete="off" />
                <datalist id="sr-pickups">{(pickups?.locations ?? []).map((p) => <option key={p.name} value={p.name}>{p.city} {p.pincode}</option>)}</datalist>
              </Field>
              <Field label="Default parcel weight (grams)" help="Used for a product that has no weight of its own."><input inputMode="numeric" className={adminInput} value={v("shiprocket_default_weight_g")} onChange={(e) => set("shiprocket_default_weight_g", e.target.value.replace(/\D/g, ""))} /></Field>
              <div className="grid grid-cols-3 gap-2 lg:col-span-2">
                <Field label="Default length (cm)"><input inputMode="decimal" className={adminInput} value={v("shiprocket_default_length_cm")} onChange={(e) => set("shiprocket_default_length_cm", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
                <Field label="Default breadth (cm)"><input inputMode="decimal" className={adminInput} value={v("shiprocket_default_breadth_cm")} onChange={(e) => set("shiprocket_default_breadth_cm", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
                <Field label="Default height (cm)"><input inputMode="decimal" className={adminInput} value={v("shiprocket_default_height_cm")} onChange={(e) => set("shiprocket_default_height_cm", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              </div>
            </div>
            <div className="grid gap-1.5 border-t border-[#e3e3e3] pt-3 text-[13px]">
              <b>Webhook (automatic tracking updates)</b>
              <p className="text-xs text-[#616161]">In Shiprocket → Settings → API → Webhooks, paste the URL below and a token you choose, then save the same token here. Parcel status then updates on the order by itself.</p>
              <SecretField label="Webhook token" secretKey="shiprocket_webhook_token" source={s?.shiprocket.webhookSource} placeholder="The token you entered in Shiprocket" onSaved={() => void status.refetch()} />
              <ul className="grid gap-1.5">
                <li>Last update from Shiprocket: {s ? (s.shiprocket.webhookLastReceived ? new Date(s.shiprocket.webhookLastReceived).toLocaleString() : "none yet") : "…"}</li>
                <li>Webhook URL: <code className="break-all">{s?.shiprocket.webhookUrl ?? "…"}</code></li>
              </ul>
            </div>
          </Section>

          <Section title="E-mail (order confirmations)" badge={s ? <Dot on={s.mail.configured} label={s.mail.configured ? "Mail server connected" : "Not set up"} /> : undefined}>
            <p className="text-[13px]">Mail accounts added: <b>{s?.mail.accounts ?? "…"}</b></p>
            <p className="text-xs text-[#616161]">
              {s && !s.mail.configured
                ? "E-mails are not being sent yet. Add your SMTP details (host, port, login and password) in Emails → Mail servers."
                : "Customers get an order receipt and you get a new-order alert by e-mail. Manage the mail accounts in Emails → Mail servers."}
            </p>
            <Link to="/admin/emails" className="text-[13px] text-[#005bd3] hover:underline">Open Emails → Mail servers</Link>
          </Section>

          <Section title="WhatsApp">
            <p className="text-[13px]">Enquiry number: <b>{contact.phoneDisplay}</b></p>
            <p className="text-xs text-[#616161]">Every “Enquire on WhatsApp” button opens a chat with this number. Visits to those buttons are reported to Analytics as <code>whatsapp_enquiry</code> and <code>whatsapp_click</code>.</p>
            <Link to="/admin/website-content/contact" className="text-[13px] text-[#005bd3] hover:underline">Change the number in Contact &amp; social</Link>
          </Section>
        </div>
      )}
    </AdminShell>
  );
}
