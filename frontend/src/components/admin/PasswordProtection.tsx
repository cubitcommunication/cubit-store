import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Btn, Card, Field, adminInput } from "@/components/admin/ui";
import { Switch } from "@/components/ui/switch";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { api, ApiError } from "@/lib/api";

type State = { enabled: boolean; passwordSet: boolean; message: string };

/** Storefront password: keep the shop private while it is being built. Main administrator only. */
export function PasswordProtection() {
  const { isSuper } = useAdminAuth();
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["admin", "storefront-password"], queryFn: () => api<State>("/admin/storefront-password"), enabled: isSuper, retry: false });
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (state.data) setMessage(state.data.message);
  }, [state.data]);

  const save = useMutation({
    mutationFn: (body: Partial<{ enabled: boolean; password: string; message: string }>) => api<State>("/admin/storefront-password", { method: "POST", body }),
    onSuccess: (data) => {
      qc.setQueryData(["admin", "storefront-password"], data);
      void qc.invalidateQueries({ queryKey: ["storefront-gate"] });
      setPassword("");
      toast.success("Saved.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save. Please try again."),
  });

  if (!isSuper || !state.data) return null;
  const s = state.data;
  const messageChanged = message.trim() !== s.message.trim();

  return (
    <Card
      title={<span className="flex flex-wrap items-center gap-2">Password protection <Badge tone={s.enabled ? "attention" : "neutral"}>{s.enabled ? "On: store is private" : "Off: store is public"}</Badge></span>}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold">Restrict access to visitors with the password</p>
          <p className="text-xs text-[#616161]">While this is on, everyone else sees only a password page, and search engines are told not to index the store. Signed-in admins always see the store.</p>
        </div>
        <Switch
          checked={s.enabled}
          disabled={save.isPending || (!s.enabled && !s.passwordSet)}
          onCheckedChange={(v) => save.mutate({ enabled: v })}
          aria-label="Password protection"
        />
      </div>
      {!s.passwordSet ? <p className="mt-2 text-xs text-[#8a6116]">Set a password below, then turn protection on.</p> : null}

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length < 4) return void toast.error("Please use a password of at least 4 characters.");
          save.mutate({ password });
        }}
      >
        <Field label={s.passwordSet ? "Change password" : "Password"} help="Share it only with your team. It is stored encrypted and never shown again. Changing it signs every visitor out of the store.">
          <input type="text" autoComplete="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={s.passwordSet ? "Type a new password" : "At least 4 characters"} className={adminInput} />
        </Field>
        <div className="flex items-end"><Btn variant="primary" type="submit" disabled={save.isPending || password.length < 4}>{s.passwordSet ? "Change password" : "Save password"}</Btn></div>
      </form>

      <div className="mt-4">
        <Field label="Message on the password page" help="Shown above the password box. Leave empty for the default message.">
          <textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} className={adminInput} />
        </Field>
        <Btn className="mt-2" disabled={save.isPending || !messageChanged} onClick={() => save.mutate({ message })}>Save message</Btn>
      </div>
    </Card>
  );
}
