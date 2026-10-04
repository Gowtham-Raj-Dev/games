import type { Metadata } from "next";

import { GameDownloads } from "@/components/game/GameDownloads";
import { GameHero } from "@/components/game/GameHero";
import { GameInfo } from "@/components/game/GameInfo";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { withRoom } from "@/lib/games";
import { site } from "@/lib/site";

import styles from "./page.module.css";

const game = withRoom;

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
 * WITHROOM: title, the browser player, then the details.
 *
 * There is no desktop or Android build yet, so `game.downloads` is empty and
 * the download block renders the browser card alone - which is the whole
 * point of that component taking an optional field.
 */
export default function WithRoomPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title.en,
    description: game.about.en,
    url: `${site.url}/${game.slug}`,
    image: `${site.url}${game.poster}`,
    inLanguage: ["en", "ta"],
    applicationCategory: "Game",
    genre: ["Horror", "Puzzle", "Adventure"],
    gamePlatform: ["Web browser"],
    playMode: "SinglePlayer",
    softwareVersion: game.version,
    publisher: { "@type": "Organization", name: site.name },
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    isAccessibleForFree: true,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // `JSON.stringify` does not escape `<`, so a string containing a
        // closing script tag would end this block early. The copy here is
        // ours and contains none, but escaping it costs nothing and means
        // the next person to edit the game blurb cannot break the page.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
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
