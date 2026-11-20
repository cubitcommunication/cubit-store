import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { parseLink } from "@/lib/links";

/**
 * A link whose destination is typed or picked in the admin. Pages on this site use the router
 * (no reload); https addresses open normally. An address that is not allowed renders nothing,
 * so a mistake in the admin can never produce a broken or unsafe link.
 */
export function SmartLink({
  href,
  className,
  activeClassName,
  newTab = false,
  onClick,
  ariaLabel,
  tabIndex,
  children,
}: {
  href: string;
  className?: string | undefined;
  activeClassName?: string | undefined;
  newTab?: boolean | undefined;
  onClick?: (() => void) | undefined;
  ariaLabel?: string | undefined;
  tabIndex?: number | undefined;
  children: ReactNode;
}) {
  const link = parseLink(href);
  if (!link) return null;

  if (link.kind === "external") {
    return (
      <a href={link.href} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer noopener" : "noopener"} className={className} onClick={onClick} aria-label={ariaLabel} tabIndex={tabIndex}>
        {children}
      </a>
    );
  }

  const search = Object.keys(link.search).length ? link.search : undefined;
  return (
    <Link
      to={link.pathname as "/"}
      {...(search ? { search: search as never } : {})}
      activeOptions={{ exact: link.pathname === "/" }}
      {...(activeClassName ? { activeProps: { className: activeClassName } } : {})}
      {...(newTab ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
    >
      {children}
    </Link>
  );
}
