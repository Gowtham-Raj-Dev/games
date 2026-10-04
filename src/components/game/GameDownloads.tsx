"use client";

import type { ReactNode } from "react";
import { Download, Globe, Monitor, Play, Smartphone } from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import { scrollToId } from "@/lib/scroll";
import type { Game } from "@/lib/games";

import styles from "./GameDownloads.module.css";

interface Platform {
  key: string;
  icon: ReactNode;
  title: string;
  requires: string;
  steps: string[];
  action: ReactNode;
}

/**
 * The three ways to play, side by side: the browser build that needs nothing
 * installed, the desktop installer and the Android APK.
 *
 * Each card states what the platform needs and the exact steps before the
 * button, so nobody downloads 60 MB to find out it will not install.
 */
export function GameDownloads({ game }: { game: Game }) {
  const { t, lang } = useLanguage();
  const { windows, android } = game.downloads ?? {};

  const platforms: Platform[] = [
    {
      key: "browser",
      icon: <Globe size={20} aria-hidden="true" />,
      title: t.game.browser,
      requires: t.game.browserRequires,
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
    windows && {
      key: "windows",
      icon: <Monitor size={20} aria-hidden="true" />,
      title: t.game.desktop,
      requires: windows.requires[lang],
      steps: windows.steps.map((step) => step[lang]),
      action: (
        <a href={windows.href} download className={styles.action}>
          <Download size={15} aria-hidden="true" />
          {t.game.download}
          <span className={styles.actionMeta}>.zip · {windows.size}</span>
        </a>
      ),
    },
    android && {
      key: "android",
      icon: <Smartphone size={20} aria-hidden="true" />,
      title: t.game.android,
      requires: android.requires[lang],
      steps: android.steps.map((step) => step[lang]),
      action: (
        <a href={android.href} download className={styles.action}>
          <Download size={15} aria-hidden="true" />
          {t.game.download}
          <span className={styles.actionMeta}>.apk · {android.size}</span>
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
          <p className={styles.sub}>{t.game.downloadsSub}</p>
        </div>

        <ul className={styles.grid}>
          {platforms.map((platform) => (
            <li key={platform.key} className={styles.card}>
              <span className={styles.iconBox}>{platform.icon}</span>

              <h3 className={styles.name}>{platform.title}</h3>
              <p className={styles.requires}>
                <span className={styles.requiresLabel}>{t.game.requires}</span>
                {platform.requires}
              </p>

              <ol className={styles.steps} aria-label={t.game.installSteps}>
                {platform.steps.map((step, index) => (
                  <li key={step} className={styles.step}>
                    <span className={styles.stepNo}>{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className={styles.foot}>{platform.action}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
