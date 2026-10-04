import type { MetadataRoute } from "next";

import { translations } from "@/i18n/translations";
import { site } from "@/lib/site";

/**
 * Lets Android and desktop Chrome install the site to a home screen with the
 * controller mark instead of a screenshot of the page. `icon.svg`,
 * `favicon.ico` and `apple-icon.png` cover the browser tab and iOS; the two
 * PNGs below are what the install prompt and app launcher use.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} - ${translations.en.meta.title}`,
    short_name: site.name,
    description: translations.en.meta.description,
    start_url: "/",
    display: "standalone",
    background_color: "#0b0c0e",
    // Matches the `themeColor` already declared in layout.tsx; the site is
    // light-only, so the browser chrome stays white.
    theme_color: "#0b0c0e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Full-bleed and inset into the centre safe zone, so an Android
        // launcher can crop it to a circle or a squircle without clipping
        // the controller grips.
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
