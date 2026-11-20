import { useCallback, useEffect, useState } from "react";
import { getAdminSession } from "@/lib/auth.functions";

export type AdminAuthState = {
  loading: boolean;
  /** Email of the signed-in admin, or null when nobody is signed in. */
  email: string | null;
  name: string | null;
  /** "super" for the main administrator (can manage the team and read the activity log). */
  role: "super" | "admin" | null;
  isSuper: boolean;
  isAdmin: boolean;
  refresh: () => void;
};

/**
 * Client-side convenience only. Real authorization lives in the Worker: the
 * session cookie is HttpOnly, so this hook simply asks the server who is
 * signed in and drives the UI from the answer.
 */
export function useAdminAuth(): AdminAuthState {
  const readSession = getAdminSession;
  const [state, setState] = useState<{ loading: boolean; email: string | null; name: string | null; role: "super" | "admin" | null }>({
    loading: true,
    email: null,
    name: null,
    role: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await readSession();
        if (active) setState({ loading: false, email: result.email, name: result.name ?? null, role: result.role ?? null });
      } catch (error) {
        console.error("[admin] session lookup failed", error);
        if (active) setState({ loading: false, email: null, name: null, role: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [readSession, nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return {
    loading: state.loading,
    email: state.email,
    name: state.name,
    role: state.role,
    isSuper: state.role === "super",
    isAdmin: state.email !== null,
    refresh,
  };
}
