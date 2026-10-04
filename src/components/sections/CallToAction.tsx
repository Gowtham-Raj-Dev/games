"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/i18n/LanguageProvider";

import styles from "./CallToAction.module.css";

/**
 * Section 7 - closing call to action.
 *
 * The one dark panel in the design, which gives the page a clear ending without
 * reaching for colour or effects. Copy stays aspirational without inventing a
 * community: no member counts, no "join X players".
 */
export function CallToAction() {
  const { t } = useLanguage();

  return (
    <section id="start" className={styles.section} aria-labelledby="cta-title">
      <div className="shell">
        <div className={`${styles.panel} reveal`}>
          <h2 id="cta-title" className={styles.title}>
            {t.cta.heading}
          </h2>
          <p className={styles.sub}>{t.cta.sub}</p>

          <div className={styles.actions}>
            <Button
              href="#games"
              size="lg"
              variant="onDark"
              icon={<ArrowRight size={17} />}
            >
              {t.cta.button}
            </Button>
          </div>

          <p className={styles.note}>{t.cta.note}</p>
        </div>
      </div>
    </section>
  );
}
