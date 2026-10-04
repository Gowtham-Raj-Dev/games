"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CategoryId } from "@/i18n/translations";

/**
 * Holds the category the visitor selected in the Categories section.
 *
 * The games collection is intentionally empty for now, so this currently drives
 * only the visible filter chip. When the real games grid is built it can read
 * `activeCategory` from here and filter its own data - no further wiring.
 */
interface CategoryFilterValue {
  activeCategory: CategoryId | null;
  setActiveCategory: (id: CategoryId | null) => void;
  clear: () => void;
}

const CategoryFilterContext = createContext<CategoryFilterValue | null>(null);

export function CategoryFilterProvider({ children }: { children: ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);

  const clear = useCallback(() => setActiveCategory(null), []);

  const value = useMemo<CategoryFilterValue>(
    () => ({ activeCategory, setActiveCategory, clear }),
    [activeCategory, clear],
  );

  return (
    <CategoryFilterContext.Provider value={value}>
      {children}
    </CategoryFilterContext.Provider>
  );
}

export function useCategoryFilter(): CategoryFilterValue {
  const ctx = useContext(CategoryFilterContext);
  if (!ctx) {
    throw new Error(
      "useCategoryFilter must be used inside <CategoryFilterProvider>",
    );
  }
  return ctx;
}
