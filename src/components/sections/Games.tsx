"use client";

import { ArrowRight } from "lucide-react";

import { GameGrid } from "@/components/game/GameGrid";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/i18n/LanguageProvider";

import styles from "./Games.module.css";

/**
 * Section 5 - the games collection.
 *
 * The grid itself is `GameGrid`, shared with the /games page. Everything the
 * grid needs comes from `src/lib/games.ts`, so adding a title adds a card here
 * and there at once.
 */
export function Games() {
  const { t } = useLanguage();

  return (
    <section id="games" className={styles.section} aria-labelledby="games-title">
      <div className="shell">
        <div className={`${styles.head} reveal`}>
          <p className="eyebrow">{t.games.label}</p>
          <h2 id="games-title" className={styles.title}>
            {t.games.heading}
          </h2>
          <p className={styles.sub}>{t.games.sub}</p>
        </div>

        <GameGrid />

        <div className={styles.more}>
          <Button
            href="/games"
            variant="secondary"
            icon={<ArrowRight size={15} aria-hidden="true" />}
          >
            {t.nav.play}
          </Button>
        </div>
      </div>
    </section>
  );
}
