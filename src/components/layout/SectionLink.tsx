"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { idFromHref, scrollToId } from "@/lib/scroll";

interface SectionLinkProps {
  /** In-page anchor such as "#games". */
  href: string;
  children: ReactNode;
  className?: string;
  /** Runs before navigating, whichever branch is taken. */
  onActivate?: () => void;
  "aria-current"?: "true";
  "aria-label"?: string;
}

/**
 * An in-page anchor that keeps working from a game page.
 *
 * On the home page it smooth-scrolls, the same as before. On any other route
 * the target section is not in the document, so the link becomes a client-side
 * navigation to `/#section` and the browser scrolls to it on arrival. Either
 * way the element stays a real anchor, so middle-click and copy-link behave.
 */
export function SectionLink({
  href,
  children,
  className,
  onActivate,
  ...aria
}: SectionLinkProps) {
  const onHome = usePathname() === "/";
  const id = idFromHref(href);

  if (onHome) {
    return (
      <a
        href={href}
        className={className}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          onActivate?.();
          scrollToId(id);
        }}
        {...aria}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      // "top" is the page itself rather than an element, so it has no hash.
      href={id === "top" ? "/" : `/#${id}`}
      className={className}
      onClick={() => onActivate?.()}
      {...aria}
    >
      {children}
    </Link>
  );
}
