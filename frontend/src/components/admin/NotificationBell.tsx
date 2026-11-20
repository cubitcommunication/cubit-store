import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, Check, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  ago, disablePush, enablePush, feedQuery, playChime, primeSound, pushState, refreshSubscription, setSound, soundOn,
  type AdminNotification, type PushState,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const EVENT_DOT: Record<string, string> = {
  order_new: "bg-emerald-500", payment_received: "bg-emerald-500", payment_failed: "bg-red-500", order_cancelled: "bg-red-500",
  order_refunded: "bg-amber-500", low_stock: "bg-amber-500", out_of_stock: "bg-red-500", shipment_delivered: "bg-sky-500", shipment_returned: "bg-amber-500",
};

/**
 * The bell in the admin's top bar: the latest events (new orders and more), a count of what is unread, a chime and a pop-up when
 * something new arrives while the panel is open, and the switch for system notifications on this phone or computer.
 */
export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const feed = useQuery(feedQuery());
  const [open, setOpen] = useState(false);
  const [unreadAtOpen, setUnreadAtOpen] = useState<Set<string>>(new Set());
  const [sound, setSoundState] = useState(soundOn());
  const [push, setPush] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string> | null>(null);
  const items = feed.data?.items ?? [];
  const unread = feed.data?.unread ?? 0;

  useEffect(() => {
    primeSound();
    void pushState().then(setPush);
    void refreshSubscription();
  }, []);

  // A new notification while the panel is open: chime and a pop-up. The first load only learns what is already there.
  useEffect(() => {
    if (!feed.data) return;
    if (known.current === null) {
      known.current = new Set(feed.data.items.map((n) => n.id));
      return;
    }
    const fresh = feed.data.items.filter((n) => !known.current!.has(n.id));
    fresh.forEach((n) => known.current!.add(n.id));
    if (!fresh.length) return;
    playChime(feed.data.sound);
    fresh.slice(0, 3).forEach((n) =>
      toast(n.title, { description: n.body, duration: 8000, action: n.url ? { label: "Open", onClick: () => void navigate({ to: n.url as never }) } : undefined }),
    );
  }, [feed.data, navigate]);

  // "(2) …" in the browser tab, so a background tab still shows something happened.
  useEffect(() => {
    const clean = document.title.replace(/^\(\d+\)\s/, "");
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${clean}` : clean;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s/, "");
    };
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const seen = useMutation({
    mutationFn: () => api("/admin/notifications/seen", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });

  function toggle() {
    if (!open) {
      setUnreadAtOpen(new Set(items.filter((n) => n.unread).map((n) => n.id)));
      if (unread > 0) seen.mutate();
    }
    setOpen((o) => !o);
  }

  async function turnOn() {
    setBusy(true);
    try {
      const state = await enablePush();
      setPush(state);
      if (state === "on") {
        toast.success("Notifications are on for this device.");
        void qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
      } else if (state === "denied") toast.error("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
    } catch {
      toast.error("Could not turn on notifications on this device.");
    } finally {
      setBusy(false);
    }
  }
  async function turnOff() {
    setBusy(true);
    try {
      await disablePush();
      setPush(await pushState());
      void qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    } finally {
      setBusy(false);
    }
  }

  const open_ = (n: AdminNotification) => {
    setOpen(false);
    if (n.url) void navigate({ to: n.url as never });
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative rounded-lg p-2 hover:bg-white/10"
      >
        {unread > 0 ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-[#e11d48] px-1 text-[10px] font-bold leading-[1.1rem] text-white">{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>

      {open ? (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-2 top-14 z-50 mt-1 max-h-[80vh] overflow-hidden rounded-xl border border-[#e3e3e3] bg-white text-[#303030] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[380px]">
          <div className="flex items-center justify-between gap-2 border-b border-[#ebebeb] px-4 py-2.5">
            <p className="text-[13px] font-semibold">Notifications</p>
            <button type="button" onClick={() => { setSound(!sound); setSoundState(!sound); }} aria-label={sound ? "Turn the sound off" : "Turn the sound on"} title={sound ? "Sound on" : "Sound off"} className="rounded-lg p-1.5 text-[#616161] hover:bg-[#f1f1f1]">
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          </div>

          <ul className="max-h-[48vh] divide-y divide-[#f1f1f1] overflow-y-auto">
            {items.length ? items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open_(n)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#f7f7f7]">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", unreadAtOpen.has(n.id) ? (EVENT_DOT[n.event] ?? "bg-[#005bd3]") : "bg-transparent ring-1 ring-[#d4d4d4]")} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13px]", unreadAtOpen.has(n.id) ? "font-semibold" : "font-medium")}>{n.title}</span>
                    {n.body ? <span className="block truncate text-xs text-[#616161]">{n.body}</span> : null}
                    <span className="mt-0.5 block text-[11px] text-[#8a8a8a]">{ago(n.at)}</span>
                  </span>
                </button>
              </li>
            )) : (
              <li className="px-4 py-8 text-center text-[13px] text-[#616161]">Nothing yet. New orders and other events will show here.</li>
            )}
          </ul>

          <div className="space-y-2 border-t border-[#ebebeb] bg-[#fafafa] px-4 py-3 text-xs">
            {push === "on" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[#0c5132]"><Check className="size-3.5" /> Notifications are on for this device</span>
                <button type="button" disabled={busy} onClick={() => void turnOff()} className="text-[#616161] underline hover:text-[#303030] disabled:opacity-50">Turn off</button>
              </div>
            ) : push === "off" ? (
              <div>
                <p className="text-[#616161]">Get a notification on this device even when the admin is closed.</p>
                <button type="button" disabled={busy} onClick={() => void turnOn()} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-[#303030] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#1a1a1a] disabled:opacity-50"><BellRing className="size-3.5" /> {busy ? "Turning on…" : "Turn on for this device"}</button>
              </div>
            ) : push === "denied" ? (
              <p className="flex items-start gap-1.5 text-[#8e1f0b]"><BellOff className="mt-0.5 size-3.5 shrink-0" /> Notifications are blocked for this site. Allow them in your browser's site settings (the padlock next to the address), then reload.</p>
            ) : push === "needs-install" ? (
              <p className="text-[#616161]"><b>On iPhone and iPad:</b> tap Share, then “Add to Home Screen”, and open the admin from that icon. Then you can turn on notifications here.</p>
            ) : push === "unsupported" ? (
              <p className="text-[#616161]">This browser cannot show system notifications. You still get the bell, the pop-up and the sound while the admin is open.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
