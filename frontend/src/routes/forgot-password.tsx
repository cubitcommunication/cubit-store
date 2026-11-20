import { brand } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { accountApi } from "@/lib/account";
import { inputClass, labelClass, primaryButton } from "@/lib/commerce";
import { StorePage } from "@/components/site/OrderBits";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: `Forgot password — ${brand.name}` }, { name: "robots", content: "noindex, follow" }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await accountApi.forgot(email);
      setSent(true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not send the reset link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StorePage title="Forgot password" narrow>
      {sent ? (
        <p className="text-muted-foreground">If an account exists for {email}, we've sent a link to choose a new password. It is valid for one hour.</p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="email" className={labelClass}>E-mail</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-2`} />
          </div>
          <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link to="/login" className="text-muted-foreground hover:text-brand-red">Back to sign in</Link></p>
    </StorePage>
  );
}
