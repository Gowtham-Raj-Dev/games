import type { Metadata } from "next";

import { GameGrid } from "@/components/game/GameGrid";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { translations } from "@/i18n/translations";
import { games } from "@/lib/games";
import { site } from "@/lib/site";

import styles from "./page.module.css";

const en = translations.en;

export const metadata: Metadata = {
  title: en.nav.play,
  description: en.games.sub,
  alternates: { canonical: "/games" },
  openGraph: {
    type: "website",
    title: `${en.nav.play} | ${site.name}`,
    description: en.games.sub,
    url: "/games",
  },
};

/**
 * The full catalogue. This is where the header's "Play games" button leads; the
 * home page keeps a short version of the same grid as a teaser.
 *
 * The list is described as an ItemList so a search result can show the titles
 * rather than just the page.
 */
export default function GamesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: en.games.heading,
    numberOfItems: games.length,
    itemListElement: games.map((game, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${site.url}/${game.slug}`,
      name: game.title.en,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SkipLink />
      <Header />

      <main id="main" className={styles.page}>
        <section className={styles.section} aria-labelledby="collection-title">
          <div className="shell">
            <div className={styles.head}>
              <p className="eyebrow">{en.games.label}</p>
              <h1 id="collection-title" className={styles.title}>
                {en.games.heading}
              </h1>
              <p className={styles.sub}>{en.games.sub}</p>
            </div>

            <GameGrid />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
