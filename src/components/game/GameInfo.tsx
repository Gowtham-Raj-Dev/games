"use client";

import Image from "next/image";
import {
  Bike,
  Box,
  Car,
  CloudRain,
  Eye,
  Flag,
  Gamepad2,
  Lock,
  Map,
  Mic,
  Moon,
  MonitorSmartphone,
  Navigation,
  Puzzle,
  Scaling,
  User,
  Users,
  WifiOff,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { FeatureIcon, Game } from "@/lib/games";

import styles from "./GameInfo.module.css";

const FEATURE_ICONS: Record<FeatureIcon, LucideIcon> = {
  mic: Mic,
  map: Map,
  navigation: Navigation,
  bike: Bike,
  user: User,
  rain: CloudRain,
  wrench: Wrench,
  devices: MonitorSmartphone,
  flag: Flag,
  car: Car,
  online: Users,
  offline: WifiOff,
  gravity: Moon,
  nitro: Zap,
  gamepad: Gamepad2,
  puzzle: Puzzle,
  scaling: Scaling,
  box: Box,
  lock: Lock,
  eye: Eye,
};

/**
 * Everything below the player and the download cards.
 *
 * Every block except the description is optional, because titles differ: a
 * racing game has circuits and cars, a delivery game has vehicles and voiced
 * doorstep dialogue. A section with no data in `src/lib/games.ts` is simply
 * not rendered.
 */
export function GameInfo({ game }: { game: Game }) {
  /*
   * Sections alternate white and grey. Which ones exist varies per title, so
   * the tone is decided here by position rather than hard-coded per section -
   * otherwise a game without circuits would show two white bands in a row.
   */
  const blocks = [
    (alt: boolean) => <About key="about" game={game} alt={alt} />,
    game.stages && ((alt: boolean) => <Stages key="stages" game={game} alt={alt} />),
    game.vehicles &&
      ((alt: boolean) => <Vehicles key="vehicles" game={game} alt={alt} />),
    game.gallery && ((alt: boolean) => <Gallery key="gallery" game={game} alt={alt} />),
    (game.controls || game.dialogue) &&
      ((alt: boolean) => <Controls key="controls" game={game} alt={alt} />),
    game.faq && ((alt: boolean) => <Faqs key="faq" game={game} alt={alt} />),
  ].filter(Boolean) as ((alt: boolean) => React.ReactElement)[];

  return <>{blocks.map((block, index) => block(index % 2 === 1))}</>;
}

/** Shared props: `alt` picks the grey band. */
interface SectionProps {
  game: Game;
  alt: boolean;
}

const tone = (alt: boolean) => (alt ? styles.sectionAlt : styles.section);

/* ------------------------------ About + features ------------------------- */

function About({ game, alt }: SectionProps) {
  const { t, lang } = useLanguage();

  return (
    <section className={tone(alt)} aria-labelledby="about-title">
      <div className="shell">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t.game.aboutLabel}</p>
            <h2 id="about-title" className={styles.title}>
              {t.game.aboutHeading}
            </h2>
          </div>
          <p className={styles.lead}>{game.about[lang]}</p>
        </div>

        <h3 className={styles.subTitle}>{t.game.featuresHeading}</h3>
        <ul className={styles.features}>
          {game.features.map((feature) => {
            const Icon = FEATURE_ICONS[feature.icon];
            return (
              <li key={feature.icon} className={styles.feature}>
                <span className={styles.featureIcon}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h4 className={styles.featureTitle}>{feature.title[lang]}</h4>
                <p className={styles.featureText}>{feature.text[lang]}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------- Stages -------------------------------- */

function Stages({ game, alt }: SectionProps) {
  const { t, lang } = useLanguage();
  if (!game.stages) return null;

  return (
    <section className={tone(alt)} aria-labelledby="stages-title">
      <div className="shell">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t.game.stagesLabel}</p>
            <h2 id="stages-title" className={styles.title}>
              {t.game.stagesHeading}
            </h2>
          </div>
          <p className={styles.lead}>{t.game.stagesSub}</p>
        </div>

        <ol className={styles.stages}>
          {game.stages.map((stage, index) => (
            <li key={stage.name.en} className={styles.stage}>
              <span className={styles.stageNo}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className={styles.stageName}>{stage.name[lang]}</span>
                <span className={styles.stageNote}>{stage.note[lang]}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------- Vehicles ------------------------------- */

function Vehicles({ game, alt }: SectionProps) {
  const { t, lang } = useLanguage();
  if (!game.vehicles) return null;

  return (
    <section className={tone(alt)} aria-labelledby="vehicles-title">
      <div className="shell">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t.game.vehiclesLabel}</p>
            <h2 id="vehicles-title" className={styles.title}>
              {t.game.vehiclesHeading}
            </h2>
          </div>
          <p className={styles.lead}>{t.game.vehiclesSub}</p>
        </div>

        <ul className={styles.vehicles}>
          {game.vehicles.map((vehicle) => (
            <li key={vehicle.id} className={styles.vehicle}>
              <h3 className={styles.vehicleName}>{vehicle.name[lang]}</h3>
              <p className={styles.vehicleNote}>{vehicle.note[lang]}</p>

              <dl className={styles.stats}>
                {vehicle.stats.map((stat) => (
                  <div key={stat.label.en} className={styles.stat}>
                    <dt className={styles.statLabel}>{stat.label[lang]}</dt>
                    <dd className={styles.statValue}>
                      {/* The number is the accessible value; the bar is
                          decoration drawn from the same figure. */}
                      <span className={styles.statNumber}>{stat.value}</span>
                      <span className={styles.track} aria-hidden="true">
                        <span
                          className={styles.fill}
                          style={{ width: `${stat.value}%` }}
                        />
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------- Gallery ------------------------------- */

function Gallery({ game, alt }: SectionProps) {
  const { t, lang } = useLanguage();
  if (!game.gallery) return null;

  return (
    <section className={tone(alt)} aria-labelledby="gallery-title">
      <div className="shell">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t.game.galleryLabel}</p>
            <h2 id="gallery-title" className={styles.title}>
              {t.game.galleryHeading}
            </h2>
          </div>
        </div>

        <ul className={styles.shots}>
          {game.gallery.map((shot) => (
            <li key={shot.src}>
              <figure className={styles.shot}>
                <Image
                  src={shot.src}
                  alt={shot.caption[lang]}
                  width={1600}
                  height={900}
                  sizes="(min-width: 980px) 25vw, (min-width: 620px) 50vw, 100vw"
                  className={styles.shotImg}
                />
                <figcaption className={styles.shotCap}>
                  {shot.caption[lang]}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------- Controls + dialogue ------------------------ */

function Controls({ game, alt }: SectionProps) {
  const { t, lang } = useLanguage();
  const { controls, dialogue } = game;

  return (
    <section className={tone(alt)} aria-labelledby="controls-title">
      <div className="shell">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t.game.controlsLabel}</p>
            <h2 id="controls-title" className={styles.title}>
              {t.game.controlsHeading}
            </h2>
          </div>
          <p className={styles.lead}>{t.game.controlsSub}</p>
        </div>

        {/* Without dialogue to sit beside it, the key list takes the full
            width in two columns rather than leaving half the row empty. */}
        <div className={dialogue ? styles.split : undefined}>
          {controls && (
            <dl className={dialogue ? styles.keys : styles.keysWide}>
              {controls.map((control) => (
                <div key={control.keys} className={styles.keyRow}>
                  <dt>
                    <kbd className={styles.kbd}>{control.keys}</kbd>
                  </dt>
                  <dd className={styles.keyAction}>{control.action[lang]}</dd>
                </div>
              ))}
            </dl>
          )}

          {dialogue && (
            <div className={styles.chat}>
              <h3 className={styles.subTitle}>{t.game.dialogueHeading}</h3>
              <p className={styles.chatSub}>{t.game.dialogueSub}</p>

              <ul className={styles.lines}>
                {dialogue.map((line, index) => (
                  <li
                    key={index}
                    className={
                      line.side === "you" ? styles.lineYou : styles.lineThem
                    }
                  >
                    <p className={styles.who}>{line.who[lang]}</p>
                    <p className={styles.bubble}>{line.text[lang]}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- FAQ --------------------------------- */

function Faqs({ game, alt }: SectionProps) {
  const { t, lang } = useLanguage();
  if (!game.faq) return null;

  return (
    <section className={tone(alt)} aria-labelledby="faq-title">
      <div className="shell">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t.game.faqLabel}</p>
            <h2 id="faq-title" className={styles.title}>
              {t.game.faqHeading}
            </h2>
          </div>
        </div>

        {/* Native disclosure: it opens with no JavaScript, and the answer is in
            the document for search engines either way. */}
        <ul className={styles.faq}>
          {game.faq.map((item) => (
            <li key={item.q.en}>
              <details className={styles.item}>
                <summary className={styles.question}>{item.q[lang]}</summary>
                <p className={styles.answer}>{item.a[lang]}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
