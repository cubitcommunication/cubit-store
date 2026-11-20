import { CURRENCY } from "@/config/brand";
import { brand } from "@/config/brand";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Btn, Card, Field, adminInput } from "@/components/admin/ui";
import { ShippingZones } from "@/components/admin/ShippingZones";
import { PasswordProtection } from "@/components/admin/PasswordProtection";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { db } from "@/lib/data";

export const Route = createFileRoute("/admin/commerce")({
  head: () => ({ meta: [{ title: `Store features — ${brand.name} Admin` }] }),
  component: CommercePage,
});

type Values = Record<string, string>;
const DEFAULTS: Values = {
  commerce_cart_enabled: "0", commerce_checkout_enabled: "0", commerce_wishlist_enabled: "0", commerce_accounts_enabled: "0",
  commerce_guest_checkout: "1", commerce_cod_enabled: "1", commerce_online_enabled: "0", commerce_shipping_flat: "99",
  commerce_free_shipping_over: "1999", commerce_cod_fee: "0", commerce_max_qty: "10", commerce_gifts: "[]", commerce_returns_enabled: "0", commerce_return_days: "7",
};
type TabId = "store" | "payments" | "shipping" | "gifts" | "returns" | "emails";
const TABS: { id: TabId; label: string }[] = [
  { id: "store", label: "Online store" },
  { id: "payments", label: "Payments" },
  { id: "shipping", label: "Shipping" },
  { id: "gifts", label: "Free gifts" },
  { id: "returns", label: "Returns" },
  { id: "emails", label: "Order e-mails" },
];
type GiftRow ={ amount: string; label: string };
function readGifts(raw: string | undefined): GiftRow[] {
  try {
    const list = JSON.parse(raw || "[]") as { amount?: unknown; label?: unknown }[];
    return Array.isArray(list) ? list.map((g) => ({ amount: g.amount ? String(g.amount) : "", label: String(g.label ?? "") })) : [];
  } catch {
    return [];
  }
}
const META: Record<string, { label: string; help: string; sort: number }> = {
  commerce_cart_enabled: { label: "Cart", help: "Turn on the shopping cart and mini-cart. \"Add to cart\" replaces the single enquiry button.", sort: 10 },
  commerce_checkout_enabled: { label: "Checkout", help: "Let customers place orders. Needs the cart to be on.", sort: 20 },
  commerce_wishlist_enabled: { label: "Wishlist", help: "Show the heart icon so customers can save pieces.", sort: 30 },
  commerce_accounts_enabled: { label: "Customer accounts", help: "Let customers register and see their orders, addresses and wishlist.", sort: 40 },
  commerce_guest_checkout: { label: "Guest checkout", help: "Allow ordering without creating an account.", sort: 50 },
  commerce_cod_enabled: { label: "Cash on Delivery", help: "Offer Cash on Delivery at checkout.", sort: 60 },
  commerce_online_enabled: { label: "Online payment (Razorpay)", help: "Offer UPI / cards / net banking. Needs the Razorpay keys, which the main administrator saves in Integrations.", sort: 70 },
  commerce_shipping_flat: { label: `Shipping fee (${CURRENCY})`, help: "Flat shipping fee per order.", sort: 80 },
  commerce_free_shipping_over: { label: `Free shipping over (${CURRENCY})`, help: `Orders at or above this amount ship free. Shoppers see an animated "Spend ${CURRENCY}X more" meter in the mini-cart and cart page. Use 0 to always charge shipping (no meter).`, sort: 90 },
  commerce_cod_fee: { label: `Cash on Delivery fee (${CURRENCY})`, help: "Extra fee added to Cash on Delivery orders.", sort: 100 },
  commerce_max_qty: { label: "Max quantity per item", help: "Most of one piece a customer can order at once.", sort: 110 },
  commerce_gifts: { label: "Free gifts", help: "Spend-and-get steps shown on the cart meter, as JSON: amount and gift name.", sort: 120 },
  commerce_returns_enabled: { label: "Customer returns", help: "Let signed-in customers ask to return pieces from a shipped order.", sort: 130 },
  commerce_return_days: { label: "Return window (days)", help: "How many days after shipping a customer can ask for a return.", sort: 140 },
};

function CommercePage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [values, setValues] = useState<Values>(DEFAULTS);
  const [saved, setSaved] = useState<Values>(DEFAULTS);

  const settings = useQuery({
    queryKey: ["admin", "commerce-settings"],
    queryFn: async () => {
      const { data, error } = await db.from("site_settings").select("key,value").eq("group_name", "commerce");
      if (error) throw new Error(error.message);
      return Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    },
  });
  const status = useQuery({ queryKey: ["admin", "store-status"], queryFn: () => api<{ razorpayConfigured: boolean; mailConfigured: boolean }>("/admin/store-status"), retry: false });

  useEffect(() => {
    if (settings.data) {
      const merged = { ...DEFAULTS, ...settings.data };
      setValues(merged);
      setSaved(merged);
    }
  }, [settings.data]);

  const dirty = Object.keys(DEFAULTS).some((k) => values[k] !== saved[k]);
  const on = (k: string) => values[k] === "1";
  const toggle = (k: string) => (v: boolean) => setValues((s) => {
    const next = { ...s, [k]: v ? "1" : "0" };
    // Checkout cannot work without the cart, so keep the pair consistent.
    if (k === "commerce_cart_enabled" && !v) next["commerce_checkout_enabled"] = "0";
    if (k === "commerce_checkout_enabled" && v) next["commerce_cart_enabled"] = "1";
    return next;
  });
  const num = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((s) => ({ ...s, [k]: e.target.value.replace(/[^0-9.]/g, "") }));

  const save = useMutation({
    mutationFn: async () => {
      const rows = Object.keys(DEFAULTS).map((key) => ({
        key, value: values[key] ?? DEFAULTS[key]!, group_name: "commerce", label: META[key]!.label, help: META[key]!.help, multiline: false, sort_order: META[key]!.sort,
      }));
      const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setSaved(values);
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      await qc.invalidateQueries({ queryKey: ["admin"] });
      await router.invalidate();
      toast.success("Store features saved");
    },
    onError: () => toast.error("Could not save. Please try again."),
  });

  const gifts = readGifts(values["commerce_gifts"]);
  const setGifts = (next: GiftRow[]) => setValues((s) => ({ ...s, commerce_gifts: JSON.stringify(next.map((g) => ({ amount: Number(g.amount) || 0, label: g.label }))) }));
  const editGift = (i: number, p: Partial<GiftRow>) => setGifts(gifts.map((g, n) => (n === i ? { ...g, ...p } : g)));

  // Every tab stays mounted (just hidden), so unsaved edits in one are not lost when you look at another.
  const [tab, setTab] = useState<TabId>("store");
  const pane = (id: TabId) => (tab === id ? "" : "hidden");

  const selling = on("commerce_cart_enabled") && on("commerce_checkout_enabled");

  return (
    <AdminShell
      title="Store features"
      actions={<><Btn disabled={!dirty || save.isPending} onClick={() => setValues(saved)}>Discard</Btn><Btn variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Btn></>}
    >
      <div className={`mb-4 flex items-center gap-3 rounded-[12px] border p-4 text-[13px] ${selling ? "border-[#9be5be] bg-[#e8fbf0]" : "border-[#e3e3e3] bg-white"}`}>
        <Badge tone={selling ? "success" : "neutral"}>{selling ? "Selling online" : "Enquiry only"}</Badge>
        <span>{selling ? "Customers can add to cart and place orders." : "Customers browse and enquire on WhatsApp. Nothing below changes the live site until you press Save."}</span>
      </div>

      <div role="tablist" aria-label="Store feature sections" className="mb-4 flex max-w-full overflow-x-auto rounded-lg border border-[#c9c9c9] bg-white sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-[13px] font-medium ${tab === t.id ? "bg-[#303030] text-white" : "text-[#303030] hover:bg-[#f7f7f7]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div className={pane("store")}>
        <div className="mb-4"><PasswordProtection /></div>
        <Card title="Online store">
          <ul className="divide-y divide-[#ebebeb]">
            {[
              ["commerce_cart_enabled", "Cart & mini-cart", "Adds an \"Add to cart\" button to every product, the cart icon in the header and the slide-in cart."],
              ["commerce_checkout_enabled", "Checkout", "Customers can place orders (needs the cart). Without it the cart sends the basket to WhatsApp."],
              ["commerce_wishlist_enabled", "Wishlist", "Heart icon on every product so customers can save pieces. Saved to the account when signed in."],
              ["commerce_accounts_enabled", "Customer accounts", "Sign in, order history, saved addresses, profile and password reset."],
              ["commerce_guest_checkout", "Guest checkout", "Allow ordering without an account."],
            ].map(([key, label, help]) => (
              <li key={key} className="flex items-center justify-between gap-4 py-3">
                <div><p className="text-[13px] font-semibold">{label}</p><p className="text-xs text-[#616161]">{help}</p></div>
                <Switch checked={on(key!)} onCheckedChange={toggle(key!)} aria-label={label} />
              </li>
            ))}
          </ul>
        </Card>
        </div>

        <div className={pane("payments")}>
        <Card title="Payments">
          <ul className="divide-y divide-[#ebebeb]">
            <li className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-[13px] font-semibold">Cash on Delivery</p><p className="text-xs text-[#616161]">Customers pay in cash when the order arrives.</p></div>
                <Switch checked={on("commerce_cod_enabled")} onCheckedChange={toggle("commerce_cod_enabled")} aria-label="Cash on Delivery" />
              </div>
              {on("commerce_cod_enabled") ? <div className="mt-3 max-w-xs"><Field label={`COD fee (${CURRENCY})`} help="Added to Cash on Delivery orders. 0 for none."><input inputMode="decimal" value={values["commerce_cod_fee"]} onChange={num("commerce_cod_fee")} className={adminInput} /></Field></div> : null}
            </li>
            <li className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-[13px] font-semibold">Online payment — Razorpay {status.data ? <Badge tone={status.data.razorpayConfigured ? "success" : "attention"}>{status.data.razorpayConfigured ? "Keys found" : "Keys missing"}</Badge> : null}</p>
                  <p className="text-xs text-[#616161]">UPI, cards and net banking. The main administrator adds the Razorpay keys in Integrations first — customers only see this option once the keys exist.</p>
                </div>
                <Switch checked={on("commerce_online_enabled")} onCheckedChange={toggle("commerce_online_enabled")} aria-label="Online payment" />
              </div>
            </li>
          </ul>
        </Card>
        </div>

        <div className={`space-y-4 ${tab === "shipping" ? "" : "hidden"}`}>
        <Card title="Shipping & limits">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`Standard shipping fee (${CURRENCY})`} help="For every state that is not in a shipping zone below."><input inputMode="decimal" value={values["commerce_shipping_flat"]} onChange={num("commerce_shipping_flat")} className={adminInput} /></Field>
            <Field label={`Free shipping over (${CURRENCY})`} help="Also drives the animated free-shipping meter in the cart. 0 = always charge shipping."><input inputMode="decimal" value={values["commerce_free_shipping_over"]} onChange={num("commerce_free_shipping_over")} className={adminInput} /></Field>
            <Field label="Max quantity per item"><input inputMode="numeric" value={values["commerce_max_qty"]} onChange={num("commerce_max_qty")} className={adminInput} /></Field>
          </div>
          <p className="mt-3 text-xs text-[#616161]">Stock is tracked per product (Products → edit → Available quantity). Leave it blank for pieces you always have.</p>
        </Card>

        <ShippingZones standardFee={values["commerce_shipping_flat"] ?? ""} standardFreeOver={values["commerce_free_shipping_over"] ?? ""} />
        </div>

        <div className={pane("gifts")}>
        <Card title="Free gifts on the cart meter">
          <p className="text-[13px] text-[#616161]">
            Add steps to the same meter that shows free shipping: `Spend ${CURRENCY}X more and get a free gift`. When the cart reaches an amount the gift is unlocked, and the order's timeline tells you which gift to put in the parcel. Press Save at the top to apply.
          </p>
          <ul className="mt-3 space-y-2">
            {gifts.map((g, i) => (
              <li key={i} className="grid items-end gap-2 sm:grid-cols-[9rem_1fr_auto]">
                <Field label={`Cart amount (${CURRENCY})`}><input inputMode="decimal" value={g.amount} onChange={(e) => editGift(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="3000" className={adminInput} /></Field>
                <Field label="Free gift"><input value={g.label} maxLength={120} onChange={(e) => editGift(i, { label: e.target.value })} placeholder="e.g. Free pair of earrings" className={adminInput} /></Field>
                <Btn variant="danger" onClick={() => setGifts(gifts.filter((_, n) => n !== i))} aria-label="Remove this gift">Remove</Btn>
              </li>
            ))}
          </ul>
          {gifts.length === 0 ? <p className="mt-2 text-[13px] text-[#616161]">No gifts yet. Free shipping still shows on the meter.</p> : null}
          {gifts.length < 10 ? <div className="mt-3"><Btn onClick={() => setGifts([...gifts, { amount: "", label: "" }])}>Add a free gift</Btn></div> : null}
          <p className="mt-3 text-xs text-[#616161]">Up to 10 gifts. The shopper sees the next step to reach and what they have already earned. The free-shipping amount above is shown on the same meter.</p>
        </Card>
        </div>

        <div className={pane("returns")}>
        <Card title="Customer returns">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold">Let customers request returns</p>
              <p className="text-xs text-[#616161]">Signed-in customers see a "Return items" button on a shipped order. Requests appear in Returns, where you approve, receive and refund them. Needs customer accounts.</p>
            </div>
            <Switch checked={on("commerce_returns_enabled")} onCheckedChange={toggle("commerce_returns_enabled")} aria-label="Customer returns" />
          </div>
          {on("commerce_returns_enabled") ? (
            <div className="mt-4 max-w-xs"><Field label="Return window (days)" help="Counted from the day the order was marked shipped."><input inputMode="numeric" value={values["commerce_return_days"]} onChange={num("commerce_return_days")} className={adminInput} /></Field></div>
          ) : null}
        </Card>
        </div>

        <div className={pane("emails")}>
        <Card title="Order e-mails">
          <p className="text-[13px]">
            {status.data?.mailConfigured ? <Badge tone="success">E-mail is set up</Badge> : <Badge tone="attention">E-mail not set up</Badge>}
            <span className="ml-2 text-[#616161]">Customers get a receipt and you get a new-order alert. The main administrator adds the mail server (SMTP) in Emails → Mail servers. Until then orders are saved but no e-mails are sent.</span>
          </p>
        </Card>
        </div>
      </div>
    </AdminShell>
  );
}
