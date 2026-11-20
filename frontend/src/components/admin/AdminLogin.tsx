import { brand } from "@/config/brand";
import { useEffect, useState } from "react";
import { adminSignIn, createFirstAdmin, getAdminSetupStatus } from "@/lib/auth.functions";

/** The account the store uses for the admin panel. The password is never stored here. */
const DEFAULT_ADMIN_EMAIL = "";

export function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const readStatus = getAdminSetupStatus;
  const signIn = adminSignIn;
  const createAdmin = createFirstAdmin;

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await readStatus();
        if (active) setNeedsSetup(result.needsSetup);
      } catch (error) {
        console.error("[admin] setup status failed", error);
        // Fail closed: never offer the one-time setup form when unsure.
        if (active) setNeedsSetup(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [readStatus]);

  const setupMode = needsSetup === true;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (setupMode) {
        if (password.length < 10) {
          setMessage("Please use a password of at least 10 characters.");
          return;
        }
        if (password !== confirm) {
          setMessage("The two passwords don't match.");
          return;
        }
        const result = await createAdmin({ data: { email, password } });
        if (!result.ok) {
          setMessage(result.message);
          setNeedsSetup(false);
          return;
        }
        onSignedIn();
        return;
      }

      const result = await signIn({ data: { email, password } });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onSignedIn();
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="eyebrow text-brand-red">{brand.name}</p>
        <h1 className="mt-2 font-display text-2xl tracking-tight">
          {setupMode ? "Create admin account" : "Admin sign in"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {setupMode
            ? "No admin account exists yet. Set one up once to manage the catalogue."
            : `Private area. Sign in to manage the ${brand.name} catalogue.`}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="admin-email" className="eyebrow block">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full border border-border bg-background px-3 py-3 text-sm focus:border-brand-red focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="eyebrow block">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              minLength={setupMode ? 10 : undefined}
              autoComplete={setupMode ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full border border-border bg-background px-3 py-3 text-sm focus:border-brand-red focus:outline-none"
            />
          </div>

          {setupMode ? (
            <div>
              <label htmlFor="admin-confirm" className="eyebrow block">
                Repeat password
              </label>
              <input
                id="admin-confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-3 text-sm focus:border-brand-red focus:outline-none"
              />
            </div>
          ) : null}

          {message ? (
            <p role="alert" className="text-sm text-brand-red">
              {message}
            </p>
          ) : null}

          {setupMode ? (
            <p className="text-xs text-muted-foreground">
              Choose your own password — at least 10 characters. It is stored only as an irreversible hash and never
              appears anywhere in the website. This setup screen disappears for good once the account exists.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Lost the password? It cannot be emailed to you. Ask your developer to clear the admin account so setup can
              run once more.
            </p>
          )}

          <button
            type="submit"
            disabled={busy || needsSetup === null}
            className="eyebrow w-full bg-foreground px-6 py-4 text-background transition-colors hover:bg-brand-red disabled:opacity-60"
          >
            {busy ? "Please wait…" : setupMode ? "Create admin" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
