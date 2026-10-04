"use client";

import type { ReactNode } from "react";
import { Download, Globe, Monitor, Play, Smartphone } from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import { useCoarsePointer } from "@/lib/environment";
import { scrollToId } from "@/lib/scroll";
import type { Game } from "@/lib/games";

import styles from "./VrDownloads.module.css";

interface Platform {
  key: string;
  icon: ReactNode;
  title: string;
  requires: string;
  size?: string;
  steps: string[];
  action: ReactNode;
  /** Carries the "best on this phone" badge when the visitor is on one. */
  phone?: boolean;
}

/**
 * The three ways to play Velocity Rift.
 *
 * Two things differ from the shared block. The order is browser, Android, then
 * Windows - play-here first, and the phone installer ahead of the desktop one,
 * because this page is read on a phone more often than not. And on a phone the
 * cards are rows rather than a grid: the icon, name and size on the first line,
 * the button on the second, and the install steps under both. A three-column
 * grid squeezed into 360px is what made them unreadable.
 *
 * The Android card is marked as the match for the device when the visitor is on
 * a touch screen. That is decided in the browser through `useCoarsePointer`,
 * which renders the pessimistic value on the server, so the badge appears after
 * hydration rather than being baked into the HTML for everyone.
 */
export function VrDownloads({ game }: { game: Game }) {
  const { t, lang } = useLanguage();
  const touch = useCoarsePointer();
  const { windows, android } = game.downloads ?? {};

  const platforms: Platform[] = [
    {
      key: "browser",
      icon: <Globe size={20} aria-hidden="true" />,
      title: t.game.browser,
      requires: t.game.browserRequires,
      size: game.webSize,
      steps: t.game.browserSteps,
      action: (
        <button
          type="button"
          className={styles.actionDark}
          onClick={() => scrollToId("play")}
        >
          <Play size={15} className={styles.playIcon} aria-hidden="true" />
          {t.game.playInBrowser}
        </button>
      ),
    },
    android && {
      key: "android",
      icon: <Smartphone size={20} aria-hidden="true" />,
      title: t.game.android,
      requires: android.requires[lang],
      size: android.size,
      steps: android.steps.map((step) => step[lang]),
      phone: touch,
      action: (
        <a href={android.href} download className={styles.action}>
          <Download size={15} aria-hidden="true" />
          {t.game.download}
          <span className={styles.actionMeta}>.apk · {android.size}</span>
        </a>
      ),
    },
    windows && {
      key: "windows",
      icon: <Monitor size={20} aria-hidden="true" />,
      title: t.game.desktop,
      requires: windows.requires[lang],
      size: windows.size,
      steps: windows.steps.map((step) => step[lang]),
      action: (
        <a href={windows.href} download className={styles.action}>
          <Download size={15} aria-hidden="true" />
          {t.game.download}
          <span className={styles.actionMeta}>.zip · {windows.size}</span>
        </a>
      ),
    },
    // A title can ship without an installer for a platform; the card for it is
    // simply left out rather than promising a download that does not exist.
  ].filter(Boolean) as Platform[];

  return (
    <section
      id="download"
      className={styles.section}
      aria-labelledby="download-title"
    >
      <div className="shell">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t.game.downloadsLabel}</p>
            <h2 id="download-title" className={styles.title}>
              {t.game.downloadsHeading}
            </h2>
          </div>
          <p className={styles.sub}>{t.game.phoneLead}</p>
        </div>

        <ul className={styles.grid}>
          {platforms.map((platform) => (
            <li
              key={platform.key}
              className={platform.phone ? styles.cardPhone : styles.card}
            >
              <div className={styles.cardHead}>
                <span className={styles.iconBox}>{platform.icon}</span>

                <div className={styles.names}>
                  <h3 className={styles.name}>{platform.title}</h3>
                  <p className={styles.requires}>{platform.requires}</p>
                </div>

                {platform.phone && (
                  <span className={styles.badge}>{t.game.bestOnPhone}</span>
                )}
              </div>

              <div className={styles.foot}>{platform.action}</div>

              <ol className={styles.steps} aria-label={t.game.installSteps}>
                {platform.steps.map((step, index) => (
                  <li key={step} className={styles.step}>
                    <span className={styles.stepNo}>{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
