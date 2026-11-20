import { api } from "./api";

/**
 * Admin sign-in, one-time setup, sign-out and password change. These call the
 * PHP API; the browser only ever holds an HttpOnly session cookie.
 */

type Credentials = { email: string; password: string };
type Outcome = { ok: true } | { ok: false; message: string };

/** Tells the sign-in screen whether the very first admin still has to be created. */
export const getAdminSetupStatus = () =>
  api<{ needsSetup: boolean; ready: boolean }>("/auth/setup-status");

/** Who is signed in, if anyone. Drives the admin panel UI. */
export const getAdminSession = () => api<{ email: string | null; name: string | null; role: "super" | "admin" | null }>("/auth/session");

/** Works only while no admin exists. */
export const createFirstAdmin = ({ data }: { data: Credentials }) =>
  api<Outcome>("/auth/first-admin", { method: "POST", body: data });

export const adminSignIn = ({ data }: { data: Credentials }) =>
  api<Outcome>("/auth/sign-in", { method: "POST", body: data });

export const adminSignOut = () => api<{ ok: true }>("/auth/sign-out", { method: "POST" });

/** Requires the current password and signs every browser out afterwards. */
export const changeAdminPassword = ({
  data,
}: {
  data: { currentPassword: string; newPassword: string };
}) => api<Outcome>("/auth/change-password", { method: "POST", body: data });
