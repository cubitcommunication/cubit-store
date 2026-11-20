import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Badge, Btn, IconBtn, adminInput } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";

export type SecretKey = "razorpay_key_id" | "razorpay_key_secret" | "razorpay_webhook_secret" | "recaptcha_secret" | "shiprocket_email" | "shiprocket_password" | "shiprocket_webhook_token";
export type Source = "admin" | "env" | null;

/** Where a value in use comes from, as a small badge. */
export function SourceBadge({ source }: { source: Source | undefined }) {
  if (source === "admin") return <Badge tone="success">Saved in admin</Badge>;
  if (source === "env") return <Badge tone="info">From server .env</Badge>;
  return <Badge tone="attention">Not set</Badge>;
}

/**
 * One secret. The saved value is never shown (the server never sends it back): the box is empty and, when something is
 * saved, says so. Typing a new value and pressing Save replaces it; the bin icon removes the saved value.
 */
export function SecretField({
  label, help, secretKey, source, placeholder, secret = true, current, onSaved,
}: {
  label: string;
  help?: string;
  secretKey: SecretKey;
  source: Source | undefined;
  placeholder: string;
  /** false for the Razorpay key ID, which is public and is shown. */
  secret?: boolean;
  current?: string;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(secret ? "" : current ?? "");
  const [show, setShow] = useState(false);

  const done = async (message: string) => {
    toast.success(message);
    await qc.invalidateQueries({ queryKey: ["admin", "integration-status"] });
    onSaved();
  };
  const save = useMutation({
    mutationFn: () => api("/admin/integrations/secrets", { method: "POST", body: { [secretKey]: value.trim() } }),
    onSuccess: async () => {
      if (secret) setValue("");
      await done(`${label} saved`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save. Please try again."),
  });
  const clear = useMutation({
    mutationFn: () => api("/admin/integrations/secrets", { method: "POST", body: { clear: [secretKey] } }),
    onSuccess: async () => {
      if (!secret) setValue("");
      await done(`${label} removed`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not remove. Please try again."),
  });

  const changed = value.trim() !== "" && (secret || value.trim() !== (current ?? ""));

  return (
    <div className="text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        <SourceBadge source={source} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <input
            type={secret && !show ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={secret && source === "admin" ? "Saved. Type a new value to replace it." : placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-label={label}
            className={`${adminInput} ${secret ? "pr-9" : ""}`}
          />
          {secret ? (
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide" : "Show what you typed"} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#616161] hover:text-[#303030]">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          ) : null}
        </div>
        <Btn variant="primary" disabled={!changed || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Btn>
        {source === "admin" ? <IconBtn icon={Trash2} tone="danger" label={`Remove the saved ${label}`} disabled={clear.isPending} onClick={() => { if (window.confirm(`Remove the saved ${label}? ${source === "admin" ? "If the server .env has one, that will be used instead." : ""}`)) clear.mutate(); }} className="size-8 border-[#c9c9c9] bg-white" /> : null}
      </div>
      {help ? <p className="mt-1 text-xs text-[#616161]">{help}</p> : null}
    </div>
  );
}
