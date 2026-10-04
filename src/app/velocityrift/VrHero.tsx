"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { GamePlayer } from "@/components/game/GamePlayer";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { Game } from "@/lib/games";

import styles from "./VrHero.module.css";

/**
 * Velocity Rift's own hero.
 *
 * The shared `GameHero` puts the version and build size in a 15rem column beside
 * the title. That column only exists from 860px up; below it the two facts drop
 * underneath the tagline as a bordered list and push the player most of a screen
 * down - on a phone the first thing you see is a definition list, and the game
 * is below the fold.
 *
 * This lays the same information out the other way round for a phone: title,
 * tagline, then the facts as three chips on one line, then the player. The
 * desktop arrangement is restored at 860px, so nothing is lost on a big screen -
 * it is simply not the shape the small one starts from.
 */
export function VrHero({ game }: { game: Game }) {
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

          {/*
           * The price badge and the two facts sit on one wrapping row of chips
           * on a phone, and become a badge above a stacked list from 860px up.
           * The badge stays outside the `dl` - "free to play" is a claim about
           * the game, not a label with a value.
           */}
          <div className={styles.meta}>
            <p className={styles.free}>{t.game.free}</p>

            <dl className={styles.facts}>
              <div className={styles.metaItem}>
                <dt className={styles.metaKey}>{t.game.version}</dt>
                <dd className={styles.metaValue}>{game.version}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaKey}>{t.game.sizeLabel}</dt>
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
