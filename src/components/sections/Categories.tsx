"use client";

import {
  ArrowRight,
  Compass,
  Dices,
  Gauge,
  Joystick,
  Puzzle,
  Swords,
  type LucideIcon,
} from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import { useCategoryFilter } from "@/lib/CategoryFilterProvider";
import { countInCategory } from "@/lib/games";
import { scrollToId } from "@/lib/scroll";
import { categoryOrder } from "@/lib/site";
import type { CategoryId } from "@/i18n/translations";

import styles from "./Categories.module.css";

const ICONS: Record<CategoryId, LucideIcon> = {
  action: Swords,
  adventure: Compass,
  arcade: Joystick,
  puzzle: Puzzle,
  racing: Gauge,
  casual: Dices,
};

/**
 * Section 4 - category grid.
 *
 * Each card is a real button: selecting one records the choice in
 * CategoryFilterProvider and scrolls to the collection, where `GameGrid` reads
 * the filter.
 *
 * The count on each card is taken from the catalogue, so a category only claims
 * titles it actually holds, and a category we have not shipped for yet says so
 * plainly instead of showing a zero.
 */
export function Categories() {
  const { t } = useLanguage();
  const { activeCategory, setActiveCategory } = useCategoryFilter();

  const choose = (id: CategoryId) => {
    setActiveCategory(id);
    scrollToId("games");
  };

  return (
    <section
      id="categories"
      className={styles.section}
      aria-labelledby="categories-title"
    >
      <div className="shell">
        <div className={`${styles.head} reveal`}>
          <div>
            <p className="eyebrow">{t.categories.label}</p>
            <h2 id="categories-title" className={styles.title}>
              {t.categories.heading}
            </h2>
          </div>
          <p className={styles.sub}>{t.categories.sub}</p>
        </div>

        <ul className={styles.grid}>
          {categoryOrder.map((id) => {
            const Icon = ICONS[id];
            const copy = t.categories.items[id];
            const isActive = activeCategory === id;
            const count = countInCategory(id);

            return (
              <li key={id} className="reveal">
                <button
                  type="button"
                  className={`${styles.card} ${isActive ? styles.cardOn : ""}`}
                  onClick={() => choose(id)}
                  aria-pressed={isActive}
                >
                  <span className={styles.top}>
                    <span className={styles.iconBox}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span className={styles.count}>
                      {count > 0 ? t.categories.count(count) : t.categories.soon}
                    </span>
                  </span>

                  <span className={styles.name}>{copy.name}</span>
                  <span className={styles.desc}>{copy.desc}</span>

                  <span className={styles.cta}>
                    {t.categories.cta}
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
