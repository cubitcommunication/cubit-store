import { useMediaQuery } from "@/lib/use-media-query";
import { useSiteTextExact } from "@/lib/site-settings";
import { SmartLink } from "@/components/site/SmartLink";
import { useLayouts, type HeaderLayout } from "@/lib/layout";

/** How many times the lines are repeated in one group, so a group is always wider than the screen. */
const REPEAT = 3;

/**
 * The strip above the menu. The lines set in Admin → Header & footer scroll across it as a
 * marquee on every device. For visitors who asked for less motion it stays still and shows line 1.
 */
export function AnnouncementBar({ layout }: { layout?: HeaderLayout } = {}) {
  const t = useSiteTextExact();
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const stored = useLayouts().header;
  const announce = (layout ?? stored).announce;
  // The lines live in the header design (Admin -> Header & footer). A header saved before that still reads the old settings.
  const lines = (announce
    ? announce.items
    : [
        { text: t("announcement"), url: t("announcement_url") },
        { text: t("announcement_2"), url: t("announcement_2_url") },
      ]
  ).filter((l) => l.text);
  if (!lines.length) return null;

  const wrap = "border-b border-brand-red/25 bg-brand-red/5";
  const text = "eyebrow whitespace-nowrap text-brand-red";

  if (still) {
    const line = lines[0]!;
    return (
      <div className={wrap}>
        <p className={`${text} mx-auto flex min-h-14 max-w-[1400px] items-center justify-center whitespace-normal px-4 py-2.5 text-center sm:min-h-10 sm:px-6 lg:px-10`}>
          {line.url ? <SmartLink href={line.url} className="hover:underline">{line.text}</SmartLink> : line.text}
        </p>
      </div>
    );
  }

  // About 60 pixels per second whatever the length of the text.
  const chars = lines.reduce((n, l) => n + l.text.length, 0) * REPEAT;
  const seconds = Math.max(20, Math.round((chars * 9.5 + lines.length * REPEAT * 90) / 60));

  const group = (copy: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={copy === 1 ? true : undefined}>
      {Array.from({ length: REPEAT }).flatMap((_, r) =>
        lines.map((l, i) => (
          <span key={`${r}-${i}`} className="flex items-center">
            <span className={`${text} px-6 sm:px-10`}>
              {l.url ? (
                <SmartLink href={l.url} tabIndex={copy === 1 ? -1 : undefined} className="hover:underline">{l.text}</SmartLink>
              ) : (
                l.text
              )}
            </span>
            <span className="text-[0.55rem] text-brand-red/50" aria-hidden="true">✦</span>
          </span>
        )),
      )}
    </div>
  );

  return (
    <div className={wrap}>
      <div className="shop-marquee relative flex h-10 items-center overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_5%,#000_95%,transparent)]" role="region" aria-label="Announcements">
        <div className="shop-marquee-track flex w-max items-center" style={{ ["--marquee-duration" as string]: `${seconds}s` }}>
          {group(0)}
          {group(1)}
        </div>
      </div>
    </div>
  );
}
