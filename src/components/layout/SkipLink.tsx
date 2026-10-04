"use client";

import { useLanguage } from "@/i18n/LanguageProvider";

/** Keyboard-first escape hatch past the header, in the active language. */
export function SkipLink() {
  const { t } = useLanguage();

  return (
    <a href="#main" className="skipLink">
      {t.nav.skipToContent}
    </a>
  );
}
