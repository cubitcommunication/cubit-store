import { useEffect, useState } from "react";

/**
 * The first screen of a brand-new site (the server shows it only while the site has no settings file yet).
 * It collects the database, the store's name and the owner's admin account, and the server does the rest.
 * Deliberately standalone: it uses no store data, so it works before there is a database.
 */

type Requirement = { label: string; ok: boolean; hint: string };

const field =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-[15px] text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";
const label = "block text-sm font-medium text-neutral-800";
const hint = "mt-1 text-xs text-neutral-500";

export function InstallApp() {
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [v, setV] = useState({
    siteName: "", siteUrl: "", tagline: "", phone: "", supportEmail: "",
    dbName: "", dbUser: "", dbPassword: "", adminEmail: "", adminPassword: "", adminPassword2: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { existing: boolean }>(null);

  useEffect(() => {
    fetch("/api/install/status", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        if (!r.ok) throw new Error("This site is already set up.");
        return r.json() as Promise<{ requirements: Requirement[]; siteUrl: string }>;
      })
      .then((d) => {
        setRequirements(d.requirements);
        setV((x) => ({ ...x, siteUrl: d.siteUrl }));
      })
      .catch((e: Error) => setLoadError(e.message || "Could not reach the server."));
  }, []);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const blocked = requirements?.some((r) => !r.ok) ?? false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (v.adminPassword !== v.adminPassword2) return setError("The two passwords are not the same.");
    setBusy(true);
    try {
      const { adminPassword2: _unused, ...body } = v;
      void _unused;
      const res = await fetch("/api/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; existing?: boolean };
      if (!res.ok) throw new Error(data.message || "Something went wrong. Please check the details and try again.");
      setDone({ existing: Boolean(data.existing) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-10 text-neutral-900">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your store</h1>
        <p className="mt-1 text-sm text-neutral-600">One form, about two minutes. You can change the store details later in the admin panel.</p>

        {loadError ? (
          <div className="mt-6 rounded-lg border border-neutral-300 bg-white p-5 text-sm">
            {loadError} <a className="underline" href="/admin">Go to the admin panel</a>
          </div>
        ) : !requirements ? (
          <div className="mt-6 h-40 animate-pulse rounded-lg bg-white" />
        ) : done ? (
          <div className="mt-6 rounded-lg border border-emerald-300 bg-white p-6">
            <h2 className="text-lg font-semibold">Your store is ready</h2>
            <p className="mt-2 text-sm text-neutral-700">
              {done.existing
                ? "This database already held a store, so its data and admin accounts were kept. Sign in with your existing admin account."
                : "The database tables and your admin account were created. Sign in with the e-mail and password you just chose."}
            </p>
            <a href="/admin" className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Open the admin panel</a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-6">
            <section className="rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-semibold">Server check</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {requirements.map((r) => (
                  <li key={r.label} className={r.ok ? "text-neutral-700" : "text-red-700"}>
                    {r.ok ? "✓" : "✗"} {r.label}
                    {!r.ok ? <span className="block pl-4 text-xs">{r.hint}</span> : null}
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-semibold">Your store</h2>
              <div>
                <label className={label} htmlFor="siteName">Store name</label>
                <input id="siteName" required maxLength={80} className={field} value={v.siteName} onChange={set("siteName")} placeholder="e.g. Acme Gems" />
              </div>
              <div>
                <label className={label} htmlFor="siteUrl">Website address</label>
                <input id="siteUrl" required type="url" className={field} value={v.siteUrl} onChange={set("siteUrl")} />
                <p className={hint}>Filled in from the address you opened. Change it only if the final domain is different.</p>
              </div>
              <div>
                <label className={label} htmlFor="tagline">One-line description <span className="font-normal text-neutral-500">(optional)</span></label>
                <input id="tagline" maxLength={160} className={field} value={v.tagline} onChange={set("tagline")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="phone">WhatsApp / phone <span className="font-normal text-neutral-500">(optional)</span></label>
                  <input id="phone" inputMode="tel" className={field} value={v.phone} onChange={set("phone")} placeholder="+91 98765 43210" />
                  <p className={hint}>With the country code. Used for WhatsApp enquiry buttons.</p>
                </div>
                <div>
                  <label className={label} htmlFor="supportEmail">Store e-mail <span className="font-normal text-neutral-500">(optional)</span></label>
                  <input id="supportEmail" type="email" className={field} value={v.supportEmail} onChange={set("supportEmail")} />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-semibold">Database</h2>
              <p className="text-xs text-neutral-500">Create these in hPanel → Databases → MySQL Databases. The names usually start with your hosting prefix.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="dbName">Database name</label>
                  <input id="dbName" required autoComplete="off" className={field} value={v.dbName} onChange={set("dbName")} />
                </div>
                <div>
                  <label className={label} htmlFor="dbUser">Database user</label>
                  <input id="dbUser" required autoComplete="off" className={field} value={v.dbUser} onChange={set("dbUser")} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="dbPassword">Database password</label>
                <input id="dbPassword" required type="password" autoComplete="new-password" className={field} value={v.dbPassword} onChange={set("dbPassword")} />
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-semibold">Owner account</h2>
              <p className="text-xs text-neutral-500">The main administrator: the only account that can add other admins and enter payment and mail settings.</p>
              <div>
                <label className={label} htmlFor="adminEmail">E-mail</label>
                <input id="adminEmail" required type="email" autoComplete="off" className={field} value={v.adminEmail} onChange={set("adminEmail")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="adminPassword">Password</label>
                  <input id="adminPassword" required minLength={10} type="password" autoComplete="new-password" className={field} value={v.adminPassword} onChange={set("adminPassword")} />
                  <p className={hint}>At least 10 characters.</p>
                </div>
                <div>
                  <label className={label} htmlFor="adminPassword2">Repeat the password</label>
                  <input id="adminPassword2" required type="password" autoComplete="new-password" className={field} value={v.adminPassword2} onChange={set("adminPassword2")} />
                </div>
              </div>
            </section>

            {error ? <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

            <button
              type="submit"
              disabled={busy || blocked}
              className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Setting up… this can take a few seconds" : "Install"}
            </button>
            {blocked ? <p className="text-center text-xs text-red-700">Fix the items marked ✗ above first.</p> : null}
          </form>
        )}
      </div>
    </div>
  );
}
