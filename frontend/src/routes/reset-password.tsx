import { brand } from "@/config/brand";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { accountApi } from "@/lib/account";
import { inputClass, labelClass, primaryButton } from "@/lib/commerce";
import { StorePage } from "@/components/site/OrderBits";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { email?: string | undefined; token?: string | undefined } => ({
    email: typeof search["email"] === "string" ? (search["email"] as string) : undefined,
    token: typeof search["token"] === "string" ? (search["token"] as string) : undefined,
  }),
  head: () => ({ meta: [{ title: `Reset password — ${brand.name}` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const { email, token } = Route.useSearch();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!email || !token) {
    return (
      <StorePage title="Reset password" narrow>
        <p className="text-muted-foreground">This reset link is incomplete. Please request a new one.</p>
        <Link to="/forgot-password" className={`${primaryButton} mt-6`}>Request a new link</Link>
      </StorePage>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await accountApi.reset({ email: email!, token: token!, password });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Password updated. Please sign in.");
      router.history.push("/login");
    } catch {
      toast.error("Could not reset the password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StorePage title="Choose a new password" narrow>
      <form onSubmit={submit} className="space-y-5">
        <p className="text-sm text-muted-foreground">For {email}</p>
        <div>
          <label htmlFor="password" className={labelClass}>New password (min. 8 characters)</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mt-2`} />
        </div>
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </StorePage>
  );
}
