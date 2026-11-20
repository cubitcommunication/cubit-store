import { brand } from "@/config/brand";
import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type Status = { locked: boolean; message: string };

/**
 * Storefront password (Admin → Store features → Password protection). While it is on, visitors see only this page until they
 * enter the password; signed-in admins pass straight through. The server enforces it too: the shop's data is refused without it.
 */
export function PasswordGate({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const adminArea = path === "/admin" || path.startsWith("/admin/") || path === "/layout-preview" || path === "/page-preview";
  const status = useQuery({
    queryKey: ["storefront-gate"],
    queryFn: () => api<Status>("/storefront/status"),
    enabled: !adminArea,
    staleTime: 0,
    retry: 1,
  });

  if (adminArea) return <>{children}</>;
  // Nothing of the shop is drawn until we know the visitor may see it.
  if (status.isPending) return <div className="min-h-screen bg-background" aria-busy="true" />;
  if (status.data?.locked) return <PasswordPage message={status.data.message} />;
  return <>{children}</>;
}

function PasswordPage({ message }: { message: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/storefront/unlock", { method: "POST", body: { password } });
      // Reload so every page loads its data with the new access.
      window.location.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-16 text-center">
      <p className="font-display text-4xl tracking-[0.18em] sm:text-5xl">{brand.name}</p>
      <p className="eyebrow mt-3 text-muted-foreground">Opening soon</p>
      <p className="mt-8 max-w-sm text-sm leading-relaxed text-muted-foreground">{message}</p>
      <form onSubmit={submit} className="mt-8 w-full max-w-xs" noValidate>
        <label htmlFor="store-password" className="sr-only">Password</label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="store-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "store-password-error" : undefined}
            className="h-12 w-full rounded-full border border-border bg-background pl-11 pr-4 text-base outline-none focus:border-foreground"
          />
        </div>
        {error ? <p id="store-password-error" role="alert" className="mt-3 text-sm text-brand-red">{error}</p> : null}
        <button type="submit" disabled={busy || !password} className="eyebrow mt-4 h-12 w-full rounded-full bg-foreground text-background transition-colors hover:bg-brand-red disabled:opacity-60">
          {busy ? "Checking…" : "Enter store"}
        </button>
      </form>
    </main>
  );
}
