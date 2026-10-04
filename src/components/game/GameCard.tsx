"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { Game } from "@/lib/games";

import styles from "./GameCard.module.css";

/**
 * One game in the collection grid.
 *
 * The whole card is the link, so the hit target is the box the visitor sees
 * rather than the title alone.
 */
export function GameCard({ game }: { game: Game }) {
  const { t, lang } = useLanguage();

  return (
    <li>
      <Link href={`/${game.slug}`} className={styles.card}>
        <div className={styles.media}>
          <Image
            src={game.cover}
            alt=""
            width={1600}
            height={900}
            sizes="(min-width: 980px) 33vw, (min-width: 620px) 50vw, 100vw"
            className={styles.cover}
          />
          <span className={styles.badge}>{t.games.playable}</span>
        </div>

        <div className={styles.body}>
          <h3 className={styles.name}>{game.title[lang]}</h3>
          <p className={styles.tagline}>{game.tagline[lang]}</p>

          <ul className={styles.tags}>
            {game.tags.map((tag) => (
              <li key={tag.en} className={styles.tag}>
                {tag[lang]}
              </li>
            ))}
          </ul>

          <p className={styles.cta}>
            {t.games.open}
            <ArrowRight size={14} aria-hidden="true" />
          </p>
        </div>
      </Link>
    </li>
  );
}
