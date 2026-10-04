"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Inline script for <head>, so it runs before the first paint.
 *
 * Turning off the browser's scroll restoration is what makes a reload start at
 * the top. Doing it here rather than in an effect matters: an effect runs after
 * hydration, by which time the visitor may already have scrolled, and resetting
 * then would yank the page out from under them.
 *
 * It only touches history behaviour, so a failure here cannot affect rendering.
 */
export const SCROLL_BOOTSTRAP_SCRIPT = `(function(){try{history.scrollRestoration="manual"}catch(e){}})()`;

/**
 * Starts a newly navigated page at the top.
 *
 * The router's own behaviour is to scroll to the first element of the new page,
 * measured while the page is still settling - images resolving, and on a game
 * page the `content-visibility` sections rendering and growing the document.
 * That landed part-way down, or at the footer.
 *
 * Only route changes are reset. The first run is skipped on purpose: the
 * initial position is already handled by the script above, and resetting on
 * mount would fight a visitor who scrolled while the page was hydrating.
 *
 * A real anchor in the URL is left alone, so the header and footer links that
 * point at `/#games` still land on that section.
 */
export function ScrollReset() {
  const pathname = usePathname();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (window.location.hash) return;
    // `instant` so it can never be animated into a chase.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
