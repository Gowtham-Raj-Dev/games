"use client";

import { LayoutGrid, Languages, Search, Zap, type LucideIcon } from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import { games } from "@/lib/games";
import { factOrder, featureOrder } from "@/lib/site";
import { CATEGORY_IDS, LANGS, type FactId, type FeatureId } from "@/i18n/translations";

import styles from "./Experience.module.css";

const ICONS: Record<FeatureId, LucideIcon> = {
  instant: Zap,
  tamil: Languages,
  discover: Search,
  genres: LayoutGrid,
};

/**
 * Section 6 - the platform experience.
 *
 * Each figure is counted from real data rather than typed into the dictionary:
 * published titles, browsable categories, and the languages our games ship in.
 * That way they cannot drift when a game is added, and no player, rating or
 * download number is claimed anywhere - none of those exist yet.
 */
const FACT_VALUES: Record<FactId, number> = {
  games: games.length,
  categories: CATEGORY_IDS.length,
  languages: LANGS.length,
};

export function Experience() {
  const { t } = useLanguage();

  return (
    <section
      id="experience"
      className={styles.section}
      aria-labelledby="experience-title"
    >
      <div className="shell">
        <div className={`${styles.head} reveal`}>
          <p className="eyebrow">{t.why.label}</p>
          <h2 id="experience-title" className={styles.title}>
            {t.why.heading}
          </h2>
          <p className={styles.sub}>{t.why.sub}</p>
        </div>

        <dl className={`${styles.facts} reveal`}>
          {factOrder.map((id) => (
            <div key={id} className={styles.fact}>
              <dt className={styles.factValue}>{FACT_VALUES[id]}</dt>
              <dd className={styles.factLabel}>{t.why.facts[id].label}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.factsNote}>{t.why.factsNote}</p>

        <ul className={styles.features}>
          {featureOrder.map((id) => {
            const Icon = ICONS[id];
            const copy = t.why.features[id];

            return (
              <li key={id} className={`${styles.feature} reveal`}>
                <span className={styles.featureIcon}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div>
                  <h3 className={styles.featureTitle}>{copy.name}</h3>
                  <p className={styles.featureDesc}>{copy.desc}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
