import { Reveal } from "./Reveal";
import { SmartLink } from "./SmartLink";
import { SiteImage } from "./SiteImage";

export type BandProps = {
  eyebrow?: string;
  title: string;
  body: string;
  ctaLabel: string;
  url: string;
  mediaKey: string;
  flip?: boolean;
  surface?: boolean;
};

/** Asymmetric image + copy band used for the material stories on the home page. */
export function EditorialBand({
  eyebrow,
  title,
  body,
  ctaLabel,
  url,
  mediaKey,
  flip = false,
  surface = false,
}: BandProps) {
  return (
    <Reveal
      as="section"
      className={`mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 ${
        surface ? "section-surface py-16 lg:py-24" : ""
      }`}
    >
      <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-16">
        <div
          className={
            flip
              ? "lg:order-2 lg:col-span-7 lg:col-start-6"
              : "lg:col-span-7"
          }
        >
          <div className="isolate overflow-hidden rounded-[12px] bg-muted">
            <SiteImage
              mediaKey={mediaKey}
              className="aspect-[4/3] w-full object-cover transition-transform duration-[1200ms] ease-out hover:scale-[1.04]"
            />
          </div>
        </div>
        <div className={flip ? "lg:order-1 lg:col-span-4" : "lg:col-span-5"}>
          {eyebrow ? <p className="eyebrow text-brand-red">{eyebrow}</p> : null}
          <h2 className="mt-3 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
            {title}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            {body}
          </p>
          {ctaLabel && url ? (
            <SmartLink
              href={url}
              className="eyebrow mt-7 inline-block rounded-[12px] border border-foreground px-6 py-3.5 transition-colors hover:border-brand-red hover:bg-brand-red hover:text-background"
            >
              {ctaLabel}
            </SmartLink>
          ) : null}
        </div>
      </div>
    </Reveal>
  );
}
