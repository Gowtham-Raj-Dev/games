import type { Metadata } from "next";

import { GameDownloads } from "@/components/game/GameDownloads";
import { GameHero } from "@/components/game/GameHero";
import { GameInfo } from "@/components/game/GameInfo";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { deliveryHero } from "@/lib/games";
import { site } from "@/lib/site";

import styles from "./page.module.css";

const game = deliveryHero;

export const metadata: Metadata = {
  title: game.title.en,
  description: game.tagline.en,
  alternates: { canonical: `/${game.slug}` },
  openGraph: {
    type: "article",
    title: game.title.en,
    description: game.tagline.en,
    url: `/${game.slug}`,
    images: [{ url: game.poster, width: 1600, height: 900 }],
  },
};

/**
 * The Delivery Hero page: title, the browser player, then the desktop and
 * Android downloads, then the details.
 *
 * Structured data describes the game itself, so a search result can show it as
 * a free, browser-playable title rather than a plain page.
 */
export default function DeliveryHeroPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title.en,
    description: game.about.en,
    url: `${site.url}/${game.slug}`,
    image: `${site.url}${game.poster}`,
    inLanguage: ["en", "ta"],
    applicationCategory: "Game",
    gamePlatform: ["Web browser", "Windows", "Android"],
    softwareVersion: game.version,
    publisher: { "@type": "Organization", name: site.name },
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    isAccessibleForFree: true,
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
        <GameHero game={game} />
        <GameDownloads game={game} />
        <GameInfo game={game} />
      </main>

      <Footer />
    </>
  );
}
