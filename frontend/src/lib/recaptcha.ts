/**
 * Google reCAPTCHA v3 (invisible). The public site key comes from Admin → Integrations; without it, or without
 * the server's secret key, nothing is checked and nothing is loaded.
 */
declare global {
  interface Window {
    grecaptcha?: { ready: (cb: () => void) => void; execute: (key: string, options: { action: string }) => Promise<string> };
  }
}

const KEY_PATTERN = /^6L[A-Za-z0-9_-]{30,50}$/;
let siteKey = "";
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (!siteKey || typeof document === "undefined") return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();   // blocked by an ad blocker: carry on without a token
    document.head.appendChild(script);
  });
  return loading;
}

/** Called by the app once the site settings are known. Loads Google's script on the first sign of a real visitor. */
export function setRecaptchaSiteKey(key: string): void {
  siteKey = KEY_PATTERN.test(key.trim()) ? key.trim() : "";
  if (!siteKey || typeof window === "undefined") return;
  const start = () => void load();
  for (const type of ["pointerdown", "keydown", "touchstart", "scroll"] as const) window.addEventListener(type, start, { once: true, passive: true });
}

export const recaptchaEnabled = () => siteKey !== "";

/** A token for one action, or null when reCAPTCHA is off or could not run. */
export async function recaptchaToken(action: string): Promise<string | null> {
  if (!siteKey) return null;
  try {
    await load();
    const g = window.grecaptcha;
    if (!g) return null;
    return await Promise.race([
      new Promise<string>((resolve, reject) => g.ready(() => g.execute(siteKey, { action }).then(resolve, reject))),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
  } catch {
    return null;
  }
}
