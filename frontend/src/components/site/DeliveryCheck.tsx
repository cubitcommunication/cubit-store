import { useState, type FormEvent } from "react";
import { useLoaderData } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { settingsToMap, type SiteSetting } from "@/lib/site-settings";

type Result = { enabled: boolean; serviceable?: boolean | null; days?: number | null; daysMax?: number | null; message?: string };

/** "Check delivery to your PIN code" on the product page. Shown only when Shiprocket is switched on in the admin. */
export function DeliveryCheck() {
  const data = useLoaderData({ from: "__root__" }) as { siteSettings?: SiteSetting[] } | undefined;
  const on = settingsToMap(data?.siteSettings)["shiprocket_enabled"] === "1";
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ text: string; ok: boolean } | null>(null);
  if (!on) return null;

  async function check(e: FormEvent) {
    e.preventDefault();
    if (!/^[1-9][0-9]{5}$/.test(pin)) {
      setAnswer({ text: "Please enter a valid 6-digit PIN code.", ok: false });
      return;
    }
    setBusy(true);
    setAnswer(null);
    try {
      const r = await api<Result>(`/delivery-check?pincode=${pin}`);
      if (!r.enabled) setAnswer(null);
      else if (r.serviceable === true) {
        const eta = r.days ? (r.daysMax && r.daysMax > r.days ? `${r.days} to ${r.daysMax} days` : `about ${r.days} ${r.days === 1 ? "day" : "days"}`) : "a few days";
        setAnswer({ text: `Delivery to ${pin} is available — usually ${eta}.`, ok: true });
      } else if (r.serviceable === false) setAnswer({ text: `Sorry, we can't deliver to ${pin} yet.`, ok: false });
      else setAnswer({ text: "We couldn't check right now. Please try again in a moment, or message us on WhatsApp.", ok: false });
    } catch (err) {
      setAnswer({ text: err instanceof ApiError ? err.message : "We couldn't check right now. Please try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={check} className="mt-6 border-t border-border pt-5" noValidate>
      <label htmlFor="delivery-pin" className="eyebrow flex items-center gap-2"><MapPin className="size-4" /> Check delivery</label>
      <div className="mt-3 flex gap-2">
        <input
          id="delivery-pin"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Enter your PIN code"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:border-brand-red focus:outline-none"
        />
        <button type="submit" disabled={busy} className="eyebrow h-11 shrink-0 rounded-lg border border-foreground px-5 text-[0.72rem] transition-colors hover:border-brand-red hover:text-brand-red disabled:opacity-50">{busy ? "Checking…" : "Check"}</button>
      </div>
      {answer ? <p role="status" className={`mt-2 text-sm ${answer.ok ? "text-emerald-700" : "text-brand-red"}`}>{answer.text}</p> : null}
    </form>
  );
}
