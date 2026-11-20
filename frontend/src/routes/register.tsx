import { brand } from "@/config/brand";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { accountApi } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { inputClass, labelClass, primaryButton, safeRedirect, useCommerce } from "@/lib/commerce";
import { StorePage } from "@/components/site/OrderBits";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
  }),
  head: () => ({ meta: [{ title: `Create account — ${brand.name}` }, { name: "robots", content: "noindex, follow" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const { accounts } = useCommerce();
  const { redirect } = Route.useSearch();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", dob: "" });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (!accounts) {
    return (
      <StorePage title="Create account" narrow>
        <p className="text-muted-foreground">Customer accounts aren't available right now.</p>
      </StorePage>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.password.length < 8) {
      toast.error("Please choose a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const result = await accountApi.register({ name: form.name, email: form.email, password: form.password, ...(form.phone ? { phone: form.phone } : {}), ...(form.dob ? { dateOfBirth: form.dob } : {}) });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["customer"] });
      track("sign_up", { method: "email" });
      toast.success(`Welcome to ${brand.name}!`);
      router.history.push(safeRedirect(redirect));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StorePage title="Create account" narrow>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" autoComplete="name" required value={form.name} onChange={set("name")} className={`${inputClass} mt-2`} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>E-mail</label>
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} className={`${inputClass} mt-2`} />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>Phone (optional)</label>
          <input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} className={`${inputClass} mt-2`} />
        </div>
        <div>
          <label htmlFor="dob" className={labelClass}>Date of birth (optional)</label>
          <input id="dob" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={set("dob")} className={`${inputClass} mt-2`} />
          <p className="mt-1 text-xs text-muted-foreground">We may send you a birthday surprise 🎁</p>
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password (min. 8 characters)</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set("password")} className={`${inputClass} mt-2`} />
        </div>
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>{busy ? "Creating…" : "Create account"}</button>
        <p className="text-sm text-muted-foreground">
          Already have an account? <Link to="/login" search={{ redirect }} className="underline hover:text-brand-red">Sign in</Link>
        </p>
      </form>
    </StorePage>
  );
}
