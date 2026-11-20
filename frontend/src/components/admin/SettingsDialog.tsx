import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell, DownloadCloud, LayoutGrid, LifeBuoy, Loader2, Mail, MailCheck, Palette, Plug, SlidersHorizontal, UserCog, X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = { to: string; label: string; icon: LucideIcon };
type Group = { title: string; items: Entry[] };

/** Everything that used to be listed under "Settings" in the sidebar. */
const GROUPS: Group[] = [
  {
    title: "Store",
    items: [
      { to: "/admin/website-content/contact", label: "Store details", icon: Mail },
      { to: "/admin/commerce", label: "Store features", icon: SlidersHorizontal },
      { to: "/admin/emails", label: "Emails", icon: MailCheck },
      { to: "/admin/notifications", label: "Notifications", icon: Bell },
      { to: "/admin/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    title: "Look and feel",
    items: [
      { to: "/admin/theme", label: "Theme colours", icon: Palette },
      { to: "/admin/appearance", label: "Product cards", icon: LayoutGrid },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/admin/settings", label: "Account & security", icon: UserCog },
      { to: "/admin/backup", label: "Export & backup", icon: DownloadCloud },
      { to: "/admin/help", label: "Help", icon: LifeBuoy },
    ],
  },
];

/** Pages only the main administrator may open (payment keys, connected services, account and security). Hidden from everyone else. */
const SUPER_ONLY = ["/admin/integrations", "/admin/notifications", "/admin/settings"];

/** The groups this person may see. */
function groupsFor(isSuper: boolean): Group[] {
  return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => isSuper || !SUPER_ONLY.includes(i.to)) })).filter((g) => g.items.length);
}

/** Paths that live in the Settings pop-up (the sidebar and the search open them there). */
export const SETTINGS_PATHS = GROUPS.flatMap((g) => g.items.map((i) => i.to));
export const isSettingsPath = (path: string) => SETTINGS_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

const LAST_KEY = "shop-admin-settings-last";

function pick(all: Entry[], to?: string): string {
  if (to) {
    const hit = all.find((i) => to === i.to || to.startsWith(`${i.to}/`));
    if (hit) return hit.to;
  }
  try {
    const last = window.localStorage.getItem(LAST_KEY);
    if (last && all.some((i) => i.to === last)) return last;
  } catch {
    /* storage unavailable */
  }
  return all[0]!.to;
}

/**
 * Shopify-style Settings window: a big pop-up with its own side menu. Each settings page opens inside
 * the window (it is the real page, shown without the admin frame), so the main sidebar stays short.
 */
export function SettingsDialog({ initial, isSuper, onClose }: { initial?: string | undefined; isSuper: boolean; onClose: () => void }) {
  const groups = groupsFor(isSuper);
  const all = groups.flatMap((g) => g.items);
  const [active, setActive] = useState(() => pick(all, initial));
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const watcher = useRef<MutationObserver | null>(null);

  /**
   * The settings pages keep their Save button switched off until something changes, so an enabled
   * "Save" button inside the frame means there are edits that have not been saved yet.
   */
  const watch = useCallback(() => {
    watcher.current?.disconnect();
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    let queued = false;
    const check = () => {
      queued = false;
      const buttons = Array.from(doc.querySelectorAll("button"));
      setDirty(buttons.some((b) => /^save( changes)?$/i.test((b.textContent ?? "").trim()) && !b.disabled));
    };
    const observer = new MutationObserver(() => {
      if (!queued) {
        queued = true;
        window.requestAnimationFrame(check);
      }
    });
    observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"], characterData: true });
    watcher.current = observer;
    check();
  }, []);

  useEffect(() => () => watcher.current?.disconnect(), []);

  /** Runs `action` now, or after the owner confirms they want to leave unsaved changes behind. */
  const guard = useCallback((action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pending) setPending(null);
      else guard(onClose);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [guard, onClose, pending]);

  const go = (to: string) => {
    if (to === active) return;
    guard(() => {
      setLoading(true);
      setDirty(false);
      setActive(to);
      try {
        window.localStorage.setItem(LAST_KEY, to);
      } catch {
        /* storage unavailable */
      }
    });
  };
  const close = () => guard(onClose);

  const current = all.find((i) => i.to === active) ?? all[0]!;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0" role="dialog" aria-modal="true" aria-label="Settings">
      <button type="button" aria-label="Close settings" onClick={close} className="absolute inset-0 bg-black/50" />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#f1f1f1] shadow-2xl sm:h-[90vh] sm:w-[90vw] sm:rounded-[14px] lg:flex-row">
        {/* Side menu */}
        <aside className="flex shrink-0 flex-col border-b border-[#d4d4d4] bg-[#ebebeb] lg:w-60 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 py-3 lg:py-4">
            <h2 className="text-[15px] font-semibold text-[#303030]">Settings</h2>
            <button type="button" onClick={close} aria-label="Close settings" className="rounded-lg p-1.5 text-[#303030] hover:bg-black/10 lg:hidden"><X className="size-4" /></button>
          </div>
          <nav aria-label="Settings" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:gap-5 lg:overflow-y-auto lg:overflow-x-visible lg:pb-4">
            {groups.map((g) => (
              <div key={g.title} className="flex shrink-0 gap-1 lg:block">
                <p className="hidden px-3 pb-1 text-xs font-semibold text-[#616161] lg:block">{g.title}</p>
                <ul className="flex gap-1 lg:block lg:space-y-0.5">
                  {g.items.map((i) => {
                    const Icon = i.icon;
                    const on = i.to === active;
                    return (
                      <li key={i.to} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => go(i.to)}
                          aria-current={on ? "page" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[#303030] hover:bg-[#f7f7f7]",
                            on && "bg-white shadow-[0_1px_0_rgba(26,26,26,0.07)]",
                          )}
                        >
                          <Icon className="size-4 shrink-0 text-[#616161]" />
                          {i.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* The page */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <button
            type="button"
            onClick={close}
            aria-label="Close settings"
            className="absolute right-3 top-2.5 z-10 hidden rounded-lg border border-[#c9c9c9] bg-white p-1.5 text-[#303030] shadow-sm hover:bg-[#f7f7f7] lg:block"
          >
            <X className="size-4" />
          </button>
          {loading ? (
            <div className="absolute inset-0 z-[5] flex items-center justify-center bg-[#f1f1f1]" aria-live="polite">
              <Loader2 className="size-6 animate-spin text-[#616161]" aria-label="Loading" />
            </div>
          ) : null}
          <iframe
            ref={frame}
            key={active}
            title={current.label}
            src={active}
            onLoad={() => { setLoading(false); watch(); }}
            className="size-full border-0 bg-[#f1f1f1]"
          />
        </div>

        {pending ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title">
            <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-xl">
              <h3 id="unsaved-title" className="text-[15px] font-semibold text-[#303030]">Leave without saving?</h3>
              <p className="mt-1.5 text-[13px] text-[#616161]">You have unsaved changes on this page. If you leave now, they will be lost.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" autoFocus onClick={() => setPending(null)} className="rounded-lg border border-[#c9c9c9] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#303030] hover:bg-[#f7f7f7]">Keep editing</button>
                <button
                  type="button"
                  onClick={() => { const run = pending; setPending(null); setDirty(false); run(); }}
                  className="rounded-lg bg-[#8e1f0b] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#6f1809]"
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
