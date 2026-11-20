/**
 * Tiny same-origin client for the store's PHP (Laravel) API.
 *
 * Authentication is an HttpOnly session cookie set by the API, so nothing
 * secret ever lives in the browser. In development Vite proxies `/api` to
 * `php artisan serve`; in production the API and the site share one domain.
 */

import { recaptchaToken } from "@/lib/recaptcha";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** `recaptcha` names the action ("newsletter", "register"...) so a reCAPTCHA token travels with the request. */
type Options = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; recaptcha?: string };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body } = options;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (options.recaptcha) {
    const token = await recaptchaToken(options.recaptcha);
    if (token) headers["X-Recaptcha-Token"] = token;
  }

  const init: RequestInit = { method, headers, credentials: "same-origin" };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`/api${path}`, init);

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* non-JSON body */
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}
