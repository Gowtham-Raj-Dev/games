"use client";

import Image from "next/image";
import { ArrowRight, Play } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { featuredGame } from "@/lib/games";

import styles from "./Featured.module.css";

/**
 * Section 2 - the flagship title.
 *
 * Everything on show here - name, tagline, tags, version, download weight and
 * the still itself - is read from the game in `src/lib/games.ts`. Changing the
 * flagship is a one-line edit to `featuredGame`; nothing in this file or in the
 * dictionary has to follow.
 */
export function Featured() {
  const { t, lang } = useLanguage();
  const game = featuredGame;

  return (
    <section
      id="featured"
      className={styles.section}
      aria-labelledby="featured-title"
    >
      <div className="shell">
        <article className={`${styles.card} reveal`}>
          <div className={styles.media}>
            <Image
              src={game.poster}
              alt={`${game.title[lang]} - in-game view`}
              width={1600}
              height={900}
              sizes="(min-width: 900px) 1200px, 100vw"
              className={styles.image}
            />
            {/* Only painted on the wide layout, where the copy sits on top. */}
            <span className={styles.scrim} aria-hidden="true" />
          </div>

          <div className={styles.body}>
            <p className={styles.label}>{t.featured.label}</p>

            <h2 id="featured-title" className={styles.title}>
              {game.title[lang]}
            </h2>

            <p className={styles.tagline}>{game.tagline[lang]}</p>

            <ul className={styles.tags}>
              {game.tags.map((tag) => (
                <li key={tag.en} className={styles.tag}>
                  {tag[lang]}
                </li>
              ))}
            </ul>

            <div className={styles.actions}>
              <Button
                href={`/${game.slug}`}
                variant="onDark"
                icon={<Play size={15} />}
              >
                {t.featured.button}
              </Button>
              <Button
                href="/games"
                variant="onDarkOutline"
                icon={<ArrowRight size={15} />}
              >
                {t.featured.more}
              </Button>
            </div>

            <p className={styles.meta}>
              {t.featured.version(game.version)}
              <span className={styles.dot} aria-hidden="true" />
              {t.game.firstLoad(game.webSize)}
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
