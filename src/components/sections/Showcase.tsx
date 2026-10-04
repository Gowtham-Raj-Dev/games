"use client";

import Image from "next/image";

import { useLanguage } from "@/i18n/LanguageProvider";
import { showcaseShots } from "@/lib/games";
import type { Shot } from "@/lib/games";

import styles from "./Showcase.module.css";

/**
 * Section 3 - a band of real screenshots from our own titles.
 *
 * Two rows drift in opposite directions. The movement is a pure CSS animation
 * on a track holding the row three times over, so the loop needs no JavaScript
 * and nothing is hidden while it waits to animate. Hovering the band pauses it,
 * and with reduced motion the rows stop and become scrollable instead.
 */
export function Showcase() {
  const { t } = useLanguage();

  const half = Math.ceil(showcaseShots.length / 2);
  const rows = [showcaseShots.slice(0, half), showcaseShots.slice(half)];

  return (
    <section
      id="showcase"
      className={styles.section}
      aria-labelledby="showcase-title"
    >
      <div className={`shell ${styles.head} reveal`}>
        <p className="eyebrow">{t.showcase.label}</p>
        <h2 id="showcase-title" className={styles.title}>
          {t.showcase.heading}
        </h2>
        <p className={styles.sub}>{t.showcase.sub}</p>
      </div>

      <div className={styles.band}>
        {rows.map((row, index) => (
          <div
            key={index}
            className={styles.viewport}
            // The rows are a visual band; the images carry their own alt text.
            role="group"
            aria-label={t.showcase.heading}
          >
            <ul
              className={`${styles.track} ${index === 1 ? styles.reverse : ""}`}
            >
              {row.map((shot) => (
                <Tile key={shot.src} shot={shot} />
              ))}
              {/* Two more passes complete the loop. They are hidden from
                  assistive tech so the captions are not announced three times,
                  and they lazy-load like any other off-screen image. */}
              {[1, 2].map((pass) =>
                row.map((shot) => (
                  <Tile key={`${shot.src}-${pass}`} shot={shot} duplicate />
                )),
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tile({ shot, duplicate = false }: { shot: Shot; duplicate?: boolean }) {
  const { lang } = useLanguage();

  return (
    <li className={styles.tile} aria-hidden={duplicate || undefined}>
      <Image
        src={shot.src}
        alt={duplicate ? "" : shot.caption[lang]}
        width={960}
        height={540}
        sizes="(max-width: 640px) 248px, 330px"
        className={styles.img}
      />
      <span className={styles.caption}>{shot.caption[lang]}</span>
    </li>
  );
}
