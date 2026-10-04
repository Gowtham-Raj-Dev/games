"use client";

import Image from "next/image";
import { ArrowRight, Languages } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { deliveryHero, velocityRift } from "@/lib/games";

import styles from "./Hero.module.css";

/**
 * Real captures from our own two titles - no stock photography anywhere on the
 * page. The attribution line under the collage names the games they come from,
 * so a visitor is never left guessing what they are looking at.
 */
const COLLAGE = {
  main: { src: "/images/delivery-hero/cine_aerial.webp", game: deliveryHero },
  left: { src: "/images/velocity-rift/metro.jpg", game: velocityRift },
  right: { src: "/images/delivery-hero/night.webp", game: deliveryHero },
};

/**
 * Section 1 - the opening. Type on the left, a collage of real in-game stills
 * on the right.
 *
 * The large still carries `priority` because it is the page's largest
 * contentful paint; the two thumbs load normally.
 */
export function Hero() {
  const { t, lang } = useLanguage();

  const credit = [COLLAGE.main.game, COLLAGE.left.game]
    .map((game) => game.title[lang])
    .join("  ·  ");

  return (
    <section id="top" className={styles.hero} aria-labelledby="hero-title">
      <div className={`shell ${styles.inner}`}>
        <div className={styles.copy}>
          <p className="eyebrow">{t.hero.label}</p>

          <h1 id="hero-title" className={styles.title}>
            {t.hero.headline.map((line, index) => (
              <span key={index} className={styles.titleLine}>
                {line}
              </span>
            ))}
          </h1>

          <p className={styles.sub}>{t.hero.sub}</p>

          <div className={styles.actions}>
            <Button href="#games" size="lg" icon={<ArrowRight size={17} />}>
              {t.hero.primary}
            </Button>
            <Button href="#about" size="lg" variant="secondary">
              {t.hero.secondary}
            </Button>
          </div>

          {/* The site itself is English; the games carry both languages. */}
          <p className={styles.bilingual}>
            <Languages size={16} aria-hidden="true" />
            {t.hero.bilingual}
          </p>
        </div>

        <div className={styles.visual}>
          <div className={styles.mainShot}>
            <Image
              src={COLLAGE.main.src}
              alt={`${COLLAGE.main.game.title[lang]} - in-game view`}
              width={1600}
              height={900}
              priority
              sizes="(min-width: 960px) 52vw, 92vw"
              className={styles.shotImg}
            />
          </div>

          <div className={styles.thumbs}>
            <div className={`${styles.thumb} ${styles.thumbA}`}>
              <Image
                src={COLLAGE.left.src}
                alt={`${COLLAGE.left.game.title[lang]} - in-game view`}
                width={960}
                height={540}
                sizes="(min-width: 960px) 26vw, 46vw"
                className={styles.shotImg}
              />
            </div>
            <div className={`${styles.thumb} ${styles.thumbB}`}>
              <Image
                src={COLLAGE.right.src}
                alt={`${COLLAGE.right.game.title[lang]} - in-game view`}
                width={1600}
                height={900}
                sizes="(min-width: 960px) 26vw, 46vw"
                className={styles.shotImg}
              />
            </div>
          </div>

          <p className={styles.credit}>
            <span className={styles.creditDot} aria-hidden="true" />
            {t.hero.playableNow}
            <span className={styles.creditNames}>{credit}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
