/**
 * Smooth in-page navigation that accounts for the sticky header and honours the
 * reduced-motion preference.
 */
export function scrollToId(id: string) {
  if (typeof document === "undefined") return;

  if (id === "top") {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    return;
  }

  const target = document.getElementById(id);
  if (!target) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const headerOffset = 78;
  const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;

  window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
}

/** Turns an `#anchor` href into the bare id. */
export function idFromHref(href: string): string {
  return href.startsWith("#") ? href.slice(1) : href;
}
