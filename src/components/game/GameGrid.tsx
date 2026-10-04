"use client";

import { X } from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import { useCategoryFilter } from "@/lib/CategoryFilterProvider";
import { games } from "@/lib/games";

import { GameCard } from "./GameCard";
import styles from "./GameGrid.module.css";

/**
 * The collection grid, with its category filter chip and empty state.
 *
 * Shared by the home page section and the /games page so the two can never
 * drift: both read `games` from `src/lib/games.ts` and the same filter from
 * CategoryFilterProvider, which lives in the root layout and therefore keeps
 * the visitor's choice across the move between them.
 */
export function GameGrid() {
  const { t } = useLanguage();
  const { activeCategory, clear } = useCategoryFilter();

  const shown = activeCategory
    ? games.filter((game) => game.categories.includes(activeCategory))
    : games;

  return (
    <>
      {activeCategory && (
        <p className={styles.filter}>
          <span className={styles.filterLabel}>{t.games.filteredBy}</span>
          <span className={styles.filterName}>
            {t.categories.items[activeCategory].name}
          </span>
          <button
            type="button"
            className={styles.filterClear}
            onClick={clear}
            aria-label={t.games.clearFilter}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </p>
      )}

      {shown.length > 0 ? (
        <ul className={styles.grid}>
          {shown.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </ul>
      ) : (
        <div className={styles.notice}>
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t.games.noMatchTitle}</p>
            <p className={styles.emptyBody}>{t.games.noMatchBody}</p>
            <div className={styles.emptyAction}>
              <button type="button" className={styles.noticeBtn} onClick={clear}>
                {t.games.clearFilter}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
