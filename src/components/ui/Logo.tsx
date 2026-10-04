import { site } from "@/lib/site";

import styles from "./Logo.module.css";

/**
 * Split the configured brand name so the last word can take the accent:
 * "CodeLove Games" -> "CodeLove" + "Games". A single-word name renders plain.
 */
function splitWordmark(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return [name, ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

/**
 * Brand lockup: the controller mark plus the wordmark.
 *
 * The geometry and the colours are the same ones shipped as
 * `src/app/icon.svg`, so the header, the footer and the browser tab show one
 * mark - edit both files together. The only difference is that the tile and the
 * D-pad cut-out take `currentColor` here (set to the accent by
 * Logo.module.css), where the favicon has to be self-contained.
 *
 * Flat shapes and solid fills only - no gradients, no hairlines - so it stays
 * legible once the browser scales it down to 16px.
 */
export function Logo({ className }: { className?: string }) {
  const [lead, accent] = splitWordmark(site.name);

  return (
    <span className={`${styles.logo} ${className ?? ""}`}>
      <svg
        className={styles.mark}
        viewBox="0 0 32 32"
        role="img"
        aria-label={site.name}
        focusable="false"
      >
        <rect width="32" height="32" rx="8" fill="currentColor" />

        {/* Controller body plus two grips, unioned by overlap. */}
        <g fill="var(--bg, #0b0c0e)">
          <rect x="3" y="8.5" width="26" height="11" rx="5.5" />
          <rect x="3" y="13.5" width="8.5" height="10" rx="4.25" />
          <rect x="20.5" y="13.5" width="8.5" height="10" rx="4.25" />
        </g>

        {/* D-pad, cut back to the tile colour. */}
        <g fill="currentColor">
          <rect x="8.85" y="9.4" width="2.9" height="8.4" rx="0.7" />
          <rect x="6.1" y="12.15" width="8.4" height="2.9" rx="0.7" />
        </g>

        {/* Action buttons knock back out of the dark body. */}
        <g fill="var(--ink, #f5f6f8)">
          <circle cx="20.9" cy="15.7" r="2" />
          <circle cx="24.7" cy="11.9" r="2" />
        </g>
      </svg>

      <span className={styles.word}>
        <span>{lead}</span>
        {accent ? <span className={styles.accent}>{accent}</span> : null}
      </span>
    </span>
  );
}
