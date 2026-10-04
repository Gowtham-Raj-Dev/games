import {
  CATEGORY_IDS,
  FACT_IDS,
  FEATURE_IDS,
  type CategoryId,
  type FactId,
  type FeatureId,
} from "@/i18n/translations";

/**
 * Everything language-independent about the brand lives here.
 * Copy lives in `src/i18n/translations.ts`.
 */
export const site = {
  /** Wordmark in the header and footer. The last word takes the accent. */
  name: "CodeLove Games",
  /** Used for canonical and Open Graph metadata. */
  url: "https://codelove.games",
  /**
   * TODO: add a real inbox to turn on the footer mail link.
   * While empty, no mailto is rendered rather than inventing an address.
   */
  contactEmail: "",
} as const;

export interface NavLink {
  /** Key under `nav` in the dictionary. */
  key: "home" | "games" | "categories" | "experience" | "about";
  href: string;
}

export const navLinks: NavLink[] = [
  { key: "home", href: "#top" },
  { key: "games", href: "#games" },
  { key: "categories", href: "#categories" },
  { key: "experience", href: "#experience" },
  { key: "about", href: "#about" },
];

export const categoryOrder: readonly CategoryId[] = CATEGORY_IDS;
export const featureOrder: readonly FeatureId[] = FEATURE_IDS;
export const factOrder: readonly FactId[] = FACT_IDS;

export type SocialKey = "instagram" | "youtube" | "x" | "discord";

export interface SocialLink {
  key: SocialKey;
  label: string;
  /** TODO: paste the studio profile URLs here to activate these links. */
  href: string;
}

export const socialLinks: SocialLink[] = [
  { key: "instagram", label: "Instagram", href: "" },
  { key: "youtube", label: "YouTube", href: "" },
  { key: "x", label: "X", href: "" },
  { key: "discord", label: "Discord", href: "" },
];
