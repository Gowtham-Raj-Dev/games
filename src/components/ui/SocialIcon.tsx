import type { SocialKey } from "@/lib/site";

/**
 * Social glyphs drawn by hand.
 *
 * lucide-react v1 removed brand icons, so these are authored in the same visual
 * language as the rest of the icon set (24x24 box, 1.7 stroke, round joins) so
 * the footer stays consistent.
 */
export function SocialIcon({ name }: { name: SocialKey }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };

  switch (name) {
    case "instagram":
      return (
        <svg {...common}>
          <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5.2" />
          <circle cx="12" cy="12" r="3.9" />
          <path d="M17.4 6.7h.01" strokeWidth="2.4" />
        </svg>
      );

    case "youtube":
      return (
        <svg {...common}>
          <rect x="2.5" y="4.75" width="19" height="14.5" rx="4" />
          <path
            d="M10.4 9.1 15.6 12l-5.2 2.9z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );

    case "x":
      return (
        <svg {...common}>
          <path d="M4.2 3.6 19.8 20.4M19.8 3.6 4.2 20.4" />
        </svg>
      );

    case "discord":
      return (
        <svg {...common}>
          <path d="M5.4 7.1A13 13 0 0 1 12 5.5a13 13 0 0 1 6.6 1.6c1.6 2.7 2.3 6 2 9.4a15 15 0 0 1-4.6 2.4l-.9-1.8a11 11 0 0 1-6.2 0l-.9 1.8a15 15 0 0 1-4.6-2.4c-.3-3.4.4-6.7 2-9.4z" />
          <circle cx="9.3" cy="13.1" r="1.15" fill="currentColor" stroke="none" />
          <circle
            cx="14.7"
            cy="13.1"
            r="1.15"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
  }
}
