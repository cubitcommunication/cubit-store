import { useSiteMedia } from "@/lib/site-media";

/**
 * Renders a website image slot managed from Admin → Website content.
 * Uses the mobile variant below 768px when one is configured.
 */
export function SiteImage({
  mediaKey,
  className,
  loading = "lazy",
  width,
  height,
  sizes,
  fallback = null,
}: {
  mediaKey: string;
  className?: string;
  loading?: "eager" | "lazy";
  width?: number;
  height?: number;
  sizes?: string;
  fallback?: React.ReactNode;
}) {
  const { src, mobileSrc, alt } = useSiteMedia(mediaKey);
  if (!src && !mobileSrc) return <>{fallback}</>;

  const desktop = src ?? mobileSrc!;
  return (
    <picture>
      {mobileSrc && mobileSrc !== desktop ? (
        <source media="(max-width: 767px)" srcSet={mobileSrc} />
      ) : null}
      <img
        src={desktop}
        alt={alt}
        loading={loading}
        decoding="async"
        {...(width ? { width } : {})}
        {...(height ? { height } : {})}
        {...(sizes ? { sizes } : {})}
        className={className}
      />
    </picture>
  );
}

/** True when a slot has any image configured (for optional banners). */
export function useHasSiteMedia(mediaKey: string): boolean {
  const { src, mobileSrc } = useSiteMedia(mediaKey);
  return Boolean(src || mobileSrc);
}

/**
 * Optional banner: renders nothing unless an image is configured for the slot,
 * so new promotional banners can be switched on purely from the admin panel.
 */
export function OptionalSiteBanner({
  mediaKey,
  className = "aspect-[21/9] w-full object-cover",
  wrapperClassName = "mt-8 overflow-hidden bg-muted",
}: {
  mediaKey: string;
  className?: string;
  wrapperClassName?: string;
}) {
  const has = useHasSiteMedia(mediaKey);
  if (!has) return null;
  return (
    <div className={wrapperClassName}>
      <SiteImage mediaKey={mediaKey} className={className} />
    </div>
  );
}
