"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { Game } from "@/lib/games";

import { GamePlayer } from "./GamePlayer";
import styles from "./GameHero.module.css";

/**
 * Top of a game page: who the game is, then the player.
 *
 * The player sits directly under the title rather than below the description,
 * because somebody arriving from the collection came to press play.
 */
export function GameHero({ game }: { game: Game }) {
  const { t, lang } = useLanguage();

  return (
    <section className={styles.section} aria-labelledby="game-title">
      <div className="shell">
        <Link href="/games" className={styles.back}>
          <ArrowLeft size={15} aria-hidden="true" />
          {t.game.back}
        </Link>

        <div className={styles.top}>
          <div className={styles.intro}>
            <h1 id="game-title" className={styles.title}>
              {game.title[lang]}
            </h1>
            <p className={styles.tagline}>{game.tagline[lang]}</p>

            <ul className={styles.tags}>
              {game.tags.map((tag) => (
                <li key={tag.en} className={styles.tag}>
                  {tag[lang]}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.side}>
            <p className={styles.free}>{t.game.free}</p>

            <dl className={styles.meta}>
              <div className={styles.metaItem}>
                <dt className={styles.metaKey}>{t.game.version}</dt>
                <dd className={styles.metaValue}>{game.version}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaKey}>{t.game.browser}</dt>
                <dd className={styles.metaValue}>{game.webSize}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* The download cards scroll here, so the id lives on the player. */}
        <div id="play" className={styles.player}>
          <GamePlayer game={game} />
        </div>
      </div>
    </section>
  );
}
