"use client";

import { Check } from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import { ORIGINAL_POINT_IDS } from "@/i18n/translations";

import styles from "./Originals.module.css";

/**
 * Section 3 - the "our own games" statement, which also serves as the About
 * target.
 *
 * Claims are limited to what is true of the studio: authorship and in-house
 * development. No ownership assertions beyond that, no counts, no awards.
 */
export function Originals() {
  const { t } = useLanguage();

  return (
    <section id="about" className={styles.section} aria-labelledby="about-title">
      <div className={`shell ${styles.inner}`}>
        <div className={`${styles.head} reveal`}>
          <p className={styles.badge}>{t.originals.badge}</p>
          <h2 id="about-title" className={styles.title}>
            {t.originals.heading}
          </h2>
          <p className={styles.sub}>{t.originals.sub}</p>
        </div>

        <div className={`${styles.side} reveal`}>
          <ul className={styles.points}>
            {ORIGINAL_POINT_IDS.map((id) => (
              <li key={id} className={styles.point}>
                <span className={styles.check} aria-hidden="true">
                  <Check size={14} />
                </span>
                {t.originals.points[id]}
              </li>
            ))}
          </ul>
          <p className={styles.disclaimer}>{t.originals.disclaimer}</p>
        </div>
      </div>
    </section>
  );
}
