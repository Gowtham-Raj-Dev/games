"use client";

import {
  ChevronsLeftRight,
  CircleGauge,
  Move,
  Pause,
  Play,
  Smartphone,
  SlidersHorizontal,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { Game, TouchIcon } from "@/lib/games";

import styles from "./VrTouchControls.module.css";

const CONTROL_ICONS: Record<TouchIcon, LucideIcon> = {
  steer: ChevronsLeftRight,
  gas: Play,
  brake: CircleGauge,
  drift: Waves,
  nitro: Zap,
  pause: Pause,
};

/** One icon per steering mode, in the order the game lists them. */
const MODE_ICONS: LucideIcon[] = [
  ChevronsLeftRight,
  SlidersHorizontal,
  Smartphone,
];

/**
 * What playing with a thumb actually looks like.
 *
 * The shared `GameInfo` prints a keyboard table and one line saying touch
 * controls exist. For a racing game opened on a phone that is the wrong way
 * round: the visitor has no keyboard, and the thing they want to know before
 * they spend data on a download is whether it can be steered at all.
 *
 * So this section names each control on the rig, then the three ways of
 * steering the game offers, then says the whole arrangement can be moved. It is
 * rendered from `game.touch`, so a title without a touch scheme simply has no
 * section rather than an empty one.
 */
export function VrTouchControls({ game }: { game: Game }) {
  const { t, lang } = useLanguage();
  const touch = game.touch;
  if (!touch) return null;

  return (
    <section className={styles.section} aria-labelledby="touch-title">
      <div className="shell">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t.game.touchLabel}</p>
            <h2 id="touch-title" className={styles.title}>
              {t.game.touchHeading}
            </h2>
          </div>
          <p className={styles.sub}>{touch.intro[lang]}</p>
        </div>

        <ul className={styles.pads}>
          {touch.controls.map((control) => {
            const Icon = CONTROL_ICONS[control.icon];
            return (
              <li key={control.icon} className={styles.pad}>
                <span className={styles.padIcon}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h3 className={styles.padName}>{control.label[lang]}</h3>
                <p className={styles.padNote}>{control.note[lang]}</p>
              </li>
            );
          })}
        </ul>

        <h3 className={styles.subTitle}>{t.game.touchSteerHeading}</h3>
        <ul className={styles.modes}>
          {touch.modes.map((mode, index) => {
            const Icon = MODE_ICONS[index] ?? ChevronsLeftRight;
            return (
              <li key={mode.name.en} className={styles.mode}>
                <span className={styles.modeIcon}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div>
                  <h4 className={styles.modeName}>{mode.name[lang]}</h4>
                  <p className={styles.modeNote}>{mode.note[lang]}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <p className={styles.layout}>
          <Move size={16} aria-hidden="true" />
          <span>
            <strong className={styles.layoutLabel}>
              {t.game.touchLayoutLabel}
            </strong>
            {touch.layout[lang]}
          </span>
        </p>
      </div>
    </section>
  );
}
