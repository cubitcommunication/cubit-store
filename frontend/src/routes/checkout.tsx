import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { item as analyticsItem, money, track } from "@/lib/analytics";
import { formatPrice, brand } from "@/config/brand";
import { api, ApiError } from "@/lib/api";
import { accountApi, useCustomer, type SavedAddress } from "@/lib/account";
import { useCart, useCartQuote } from "@/lib/cart";
import { ShippingProgress } from "@/components/site/CartDrawer";
import { INDIAN_STATES, inputClass, labelClass, outlineButton, primaryButton, useCommerce } from "@/lib/commerce";
import { OrderTotals, StorePage } from "@/components/site/OrderBits";
import { CouponBox } from "@/components/site/Offers";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: `Checkout — ${brand.name}` }, { name: "robots", content: "noindex, follow" }] }),
  component: CheckoutPage,
});

type RazorpayOptions = {
  key: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  prefill: { name: string; email: string; contact: string };
};
type PlacedOrder = { number: number; token: string; paymentMethod: "cod" | "razorpay"; razorpay?: RazorpayOptions };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const empty = { name: "", email: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", notes: "" };

function CheckoutPage() {
  const flags = useCommerce();
  const { items, clear, coupon } = useCart();
  const { customer } = useCustomer();
  const navigate = useNavigate();
  const [method, setMethod] = useState<"cod" | "razorpay">("cod");
  const [form, setForm] = useState(empty);
  // The delivery state decides the shipping fee (shipping zones), so the totals follow the chosen state.
  const quote = useCartQuote(items, method, form.state);
  const reportedCheckout = useRef(false);
  useEffect(() => {
    if (!quote.data || quote.isPlaceholderData || reportedCheckout.current || !quote.data.lines.length) return;
    reportedCheckout.current = true;
    const reported = quote.data.lines.map((l) => analyticsItem({ id: l.id, sku: l.sku, name: l.name, price: l.price, qty: l.qty, variant: l.variantTitle }));
    track("begin_checkout", { currency: "INR", value: money(reported), items: reported, ...(coupon ? { coupon } : {}) });
  }, [quote.data, quote.isPlaceholderData, coupon]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [waiting, setWaiting] = useState<PlacedOrder | null>(null);
  const prefilled = useRef(false);

  const addresses = useQuery({ queryKey: ["account", "addresses"], queryFn: accountApi.addresses, enabled: Boolean(customer) });

  const set = (key: keyof typeof empty) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  // Prefill from the signed-in account (once).
  useEffect(() => {
    if (prefilled.current || !customer) return;
    const fallback = addresses.data?.addresses.find((a) => a.isDefault) ?? addresses.data?.addresses[0];
    if (customer && addresses.isPending) return;
    prefilled.current = true;
    setForm((f) => ({
      ...f,
      name: f.name || customer.name,
      email: f.email || customer.email,
      phone: f.phone || customer.phone || "",
      ...(fallback ? { name: fallback.name, phone: fallback.phone, line1: fallback.line1, line2: fallback.line2 ?? "", city: fallback.city, state: fallback.state, pincode: fallback.pincode } : {}),
    }));
  }, [customer, addresses.data, addresses.isPending]);

  // Keep a copy of the basket once a valid e-mail is typed, so a reminder can be sent if the order is not finished.
  const captured = useRef("");
  useEffect(() => {
    const email = form.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || !items.length) return;
    const body = { email, name: form.name.trim() || undefined, phone: form.phone.trim() || undefined, items: items.map((i) => ({ id: i.id, variant: i.variantId, qty: i.qty })) };
    const signature = JSON.stringify([body.email, body.name, body.phone, body.items]);
    if (signature === captured.current) return;
    const timer = window.setTimeout(() => {
      captured.current = signature;
      void api("/cart/capture", { method: "POST", body }).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [form.email, form.name, form.phone, items]);

  const methods = quote.data?.paymentMethods ?? (flags.cod ? ["cod"] : []);
  useEffect(() => {
    if (methods.length && !methods.includes(method)) setMethod(methods[0]!);
  }, [methods, method]);

  function useSaved(a: SavedAddress) {
    setForm((f) => ({ ...f, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, pincode: a.pincode }));
  }

  if (!flags.checkout) {
    return (
      <StorePage title="Checkout" narrow>
        <p className="text-muted-foreground">Online checkout isn't open yet. Please enquire on WhatsApp and we'll help you place your order.</p>
        <Link to="/shop" className={`${primaryButton} mt-6`}>
          Back to shop
        </Link>
      </StorePage>
    );
  }
  if (items.length === 0) {
    return (
      <StorePage title="Checkout" narrow>
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Link to="/shop" className={`${primaryButton} mt-6`}>
          Continue shopping
        </Link>
      </StorePage>
    );
  }
  if (!flags.guestCheckout && !customer) {
    return (
      <StorePage title="Checkout" narrow>
        <p className="text-muted-foreground">Please sign in to place your order.</p>
        <Link to="/login" search={{ redirect: "/checkout" }} className={`${primaryButton} mt-6`}>
          Sign in
        </Link>
      </StorePage>
    );
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e["name"] = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e["email"] = "Please enter a valid e-mail address.";
    if (!/^[0-9+\-\s]{10,15}$/.test(form.phone)) e["phone"] = "Please enter a valid phone number.";
    if (!form.line1.trim()) e["line1"] = "Please enter your address.";
    if (!form.city.trim()) e["city"] = "Please enter your city.";
    if (!form.state) e["state"] = "Please choose your state.";
    if (!/^[1-9][0-9]{5}$/.test(form.pincode)) e["pincode"] = "Please enter a valid 6-digit PIN code.";
    return e;
  }

  async function finish(placed: PlacedOrder) {
    clear();
    await navigate({ to: "/checkout/thank-you/$number", params: { number: String(placed.number) }, search: { token: placed.token } });
  }

  async function openPayment(placed: PlacedOrder) {
    const options = placed.razorpay;
    if (!options) return;
    if (!(await loadRazorpay()) || !window.Razorpay) {
      toast.error("Could not load the payment window. Please check your connection and try again.");
      setBusy(false);
      return;
    }
    const popup = new window.Razorpay({
      key: options.key,
      amount: options.amount,
      currency: options.currency,
      name: options.name,
      order_id: options.orderId,
      prefill: options.prefill,
      theme: { color: "#F30C38" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          await api("/checkout/verify-payment", { method: "POST", body: { number: placed.number, token: placed.token, ...response } });
          await finish(placed);
        } catch {
          toast.error("We received your payment but could not confirm it yet. Please contact us on WhatsApp with order #" + placed.number);
          await finish(placed);
        }
      },
      modal: {
        ondismiss: () => {
          setBusy(false);
          setWaiting(placed);
        },
      },
    });
    popup.open();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Please check the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const placed = await api<PlacedOrder>("/checkout", {
        method: "POST",
        body: {
          items: items.map((i) => ({ id: i.id, variant: i.variantId, qty: i.qty })),
          paymentMethod: method,
          customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() },
          address: { name: form.name.trim(), phone: form.phone.trim(), line1: form.line1.trim(), line2: form.line2.trim() || null, city: form.city.trim(), state: form.state, pincode: form.pincode.trim() },
          notes: form.notes.trim() || null,
          coupon: coupon || null,
        },
        recaptcha: "checkout",
      });
      if (placed.paymentMethod === "razorpay") await openPayment(placed);
      else await finish(placed);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not place your order. Please try again.");
      setBusy(false);
    }
  }

  const lines = quote.data?.lines ?? [];
  const hasIssue = lines.some((l) => l.issue);
  const fieldError = (key: string) => (errors[key] ? <p className="mt-1 text-xs text-brand-red">{errors[key]}</p> : null);

  return (
    <StorePage title="Checkout">
      {waiting ? (
        <div role="status" className="mb-8 border border-brand-red p-5 text-sm">
          <p className="font-medium">Order #{waiting.number} is waiting for payment.</p>
          <p className="mt-1 text-muted-foreground">The payment window was closed before the payment finished. You can try again now.</p>
          <button type="button" onClick={() => void openPayment(waiting)} className={`${primaryButton} mt-4`}>
            Pay now
          </button>
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-10">
          {!customer && flags.accounts ? (
            <p className="text-sm text-muted-foreground">
              Have an account?{" "}
              <Link to="/login" search={{ redirect: "/checkout" }} className="underline hover:text-brand-red">
                Sign in
              </Link>{" "}
              for faster checkout.
            </p>
          ) : null}

          <section>
            <h2 className="font-display text-xl">Contact</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="name" className={labelClass}>Full name</label>
                <input id="name" autoComplete="name" value={form.name} onChange={set("name")} className={`${inputClass} mt-2`} />
                {fieldError("name")}
              </div>
              <div>
                <label htmlFor="email" className={labelClass}>E-mail</label>
                <input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} className={`${inputClass} mt-2`} />
                {fieldError("email")}
              </div>
              <div>
                <label htmlFor="phone" className={labelClass}>Phone</label>
                <input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} className={`${inputClass} mt-2`} />
                {fieldError("phone")}
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl">Delivery address</h2>
            {addresses.data?.addresses.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {addresses.data.addresses.map((a) => (
                  <button key={a.id} type="button" onClick={() => useSaved(a)} className="border border-border px-3 py-2 text-left text-xs hover:border-brand-red">
                    {a.name}, {a.line1}, {a.city} {a.pincode}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="line1" className={labelClass}>Address</label>
                <input id="line1" autoComplete="address-line1" value={form.line1} onChange={set("line1")} className={`${inputClass} mt-2`} placeholder="House / flat, street" />
                {fieldError("line1")}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="line2" className={labelClass}>Apartment, landmark (optional)</label>
                <input id="line2" autoComplete="address-line2" value={form.line2} onChange={set("line2")} className={`${inputClass} mt-2`} />
              </div>
              <div>
                <label htmlFor="city" className={labelClass}>City</label>
                <input id="city" autoComplete="address-level2" value={form.city} onChange={set("city")} className={`${inputClass} mt-2`} />
                {fieldError("city")}
              </div>
              <div>
                <label htmlFor="pincode" className={labelClass}>PIN code</label>
                <input id="pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={form.pincode} onChange={set("pincode")} className={`${inputClass} mt-2`} />
                {fieldError("pincode")}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="state" className={labelClass}>State</label>
                <select id="state" autoComplete="address-level1" value={form.state} onChange={set("state")} className={`${inputClass} mt-2`}>
                  <option value="">Choose a state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {fieldError("state")}
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl">Payment</h2>
            {methods.length === 0 ? (
              <p className="mt-4 text-sm text-brand-red">No payment method is available right now. Please enquire on WhatsApp.</p>
            ) : (
              <div className="mt-4 divide-y divide-border border border-border">
                {methods.map((m) => (
                  <label key={m} className="flex cursor-pointer items-start gap-3 p-4">
                    <input type="radio" name="payment" checked={method === m} onChange={() => setMethod(m)} className="mt-1 accent-[var(--brand-red)]" />
                    <span>
                      <span className="block text-sm font-medium">{m === "cod" ? "Cash on Delivery" : "Pay online (UPI, cards, net banking)"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {m === "cod" ? (flags.codFee > 0 ? `A ${formatPrice(flags.codFee)} handling fee applies.` : "Pay in cash when your order arrives.") : "Secure payment with Razorpay."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section>
            <label htmlFor="notes" className={labelClass}>Order notes (optional)</label>
            <textarea id="notes" rows={3} maxLength={500} value={form.notes} onChange={set("notes")} className={`${inputClass} mt-2`} placeholder="Gift message, delivery instructions…" />
          </section>
        </div>

        <aside className="h-fit space-y-5 border border-border bg-surface p-6 lg:sticky lg:top-28">
          <h2 className="eyebrow">Order summary</h2>
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li key={`${l.id}:${l.variantId ?? ""}`} className="flex gap-3 py-3 text-sm">
                <div className="relative size-14 shrink-0 bg-background">
                  {l.image ? <img src={l.image} alt="" className="size-full object-cover" /> : <LogoPlaceholder className="size-full" />}
                  <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] text-background">{l.qty}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{l.name}</p>
                  {l.variantTitle ? <p className="text-xs text-muted-foreground">{l.variantTitle}</p> : null}
                  {l.issue ? <p className="text-xs text-brand-red">{l.issue}</p> : null}
                </div>
                <p>{formatPrice(l.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <CouponBox quote={quote.data} />
          <ShippingProgress subtotal={quote.data?.subtotal ?? 0} threshold={quote.data?.freeShippingOver ?? flags.freeShippingOver} gifts={flags.gifts} compact />
          <OrderTotals subtotal={quote.data?.subtotal ?? 0} discount={quote.data?.discount ?? 0} couponCode={quote.data?.coupon?.code ?? null} shipping={quote.data?.shipping ?? 0} codFee={quote.data?.codFee ?? 0} total={quote.data?.total ?? 0} />
          <button type="submit" disabled={busy || hasIssue || methods.length === 0 || quote.isPending} className={`${primaryButton} w-full`}>
            {busy ? "Please wait…" : method === "razorpay" ? `Pay ${formatPrice(quote.data?.total ?? 0)}` : "Place order"}
          </button>
          <Link to="/cart" className={`${outlineButton} w-full`}>
            Back to cart
          </Link>
          {hasIssue ? <p className="text-xs text-brand-red">Some items need attention. Please update your cart.</p> : null}
        </aside>
      </form>
    </StorePage>
  );
}
