import type { Metadata } from "next";

import { GameInfo } from "@/components/game/GameInfo";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { velocityRift } from "@/lib/games";
import { site } from "@/lib/site";

import { VrDownloads } from "./VrDownloads";
import { VrHero } from "./VrHero";
import { VrTouchControls } from "./VrTouchControls";
import styles from "./page.module.css";

const game = velocityRift;

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
 * The Velocity Rift page: title, the browser player, the downloads, how the
 * game is played with a thumb, then the details.
 *
 * The first three sections are this page's own rather than the shared game
 * components. Velocity Rift is the title most likely to be opened on a phone -
 * it is a few megabytes, it locks to landscape and it ships an on-screen control
 * rig - so its hero, its download block and the touch section beneath them are
 * laid out for a 360px screen first and widened from there. Delivery Hero keeps
 * the shared components unchanged.
 *
 * Structured data describes the game itself, so a search result can show it as
 * a free, browser-playable title rather than a plain page.
 */
export default function VelocityRiftPage() {
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
    playMode: ["SinglePlayer", "MultiPlayer"],
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
        <VrHero game={game} />
        <VrDownloads game={game} />
        <VrTouchControls game={game} />
        <GameInfo game={game} />
      </main>

      <Footer />
    </>
  );
}
