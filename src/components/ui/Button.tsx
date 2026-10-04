"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { SectionLink } from "@/components/layout/SectionLink";

import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "onDark" | "onDarkOutline" | "quiet";
type Size = "md" | "lg" | "sm";

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /**
   * In-page anchor such as "#games", which smooth-scrolls on the home page and
   * routes to `/#games` from anywhere else, or a route such as "/deliveryhero".
   * Either way the button renders as a link.
   */
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  block?: boolean;
  className?: string;
}

/**
 * The one button in the system: an anchor when given an `href`, a button
 * otherwise, so each call site produces the right element for assistive tech.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  onClick,
  icon,
  block = false,
  className,
}: ButtonProps) {
  const classes = [
    styles.btn,
    styles[variant],
    size !== "md" ? styles[size] : "",
    block ? styles.block : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <span>{children}</span>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
    </>
  );

  if (href?.startsWith("#")) {
    return (
      <SectionLink href={href} className={classes} onActivate={onClick}>
        {body}
      </SectionLink>
    );
  }

  if (href) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick}>
      {body}
    </button>
  );
}
