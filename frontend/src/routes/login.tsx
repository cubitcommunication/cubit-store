import { brand } from "@/config/brand";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { ApiError } from "@/lib/api";
import { accountApi } from "@/lib/account";
import { inputClass, labelClass, primaryButton, safeRedirect, useCommerce } from "@/lib/commerce";
import { StorePage } from "@/components/site/OrderBits";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
  }),
  head: () => ({ meta: [{ title: `Sign in — ${brand.name}` }, { name: "robots", content: "noindex, follow" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { accounts } = useCommerce();
  const { redirect } = Route.useSearch();
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!accounts) {
    return (
      <StorePage title="Sign in" narrow>
        <p className="text-muted-foreground">Customer accounts aren't available right now.</p>
      </StorePage>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await accountApi.signIn({ email, password });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["customer"] });
      track("login", { method: "email" });
      router.history.push(safeRedirect(redirect));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StorePage title="Sign in" narrow>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="email" className={labelClass}>E-mail</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-2`} />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mt-2`} />
        </div>
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="flex justify-between text-sm text-muted-foreground">
          <Link to="/forgot-password" className="hover:text-brand-red">Forgot your password?</Link>
          <Link to="/register" search={{ redirect }} className="hover:text-brand-red">Create an account</Link>
        </div>
      </form>
    </StorePage>
  );
}
