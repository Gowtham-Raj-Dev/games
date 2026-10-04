"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Maximize2, Play, RotateCw, Square } from "lucide-react";

import { useLanguage } from "@/i18n/LanguageProvider";
import { useCoarsePointer, useWebGL2 } from "@/lib/environment";
import type { Game } from "@/lib/games";

import styles from "./GamePlayer.module.css";

/**
 * Grace period before a player that has scrolled out of view stops itself.
 * Long enough to scroll past and come straight back without losing the run.
 */
const AUTO_STOP_MS = 4000;

/**
 * The browser player.
 *
 * The iframe is mounted only after the visitor presses play and unmounted again
 * when they press stop. That matters: this is a 3D build that renders
 * continuously, so leaving it running while somebody reads the page below makes
 * the whole tab crawl.
 */
export function GamePlayer({ game }: { game: Game }) {
  const { t, lang } = useLanguage();
  const frame = useRef<HTMLDivElement>(null);
  /** The game itself, so it can be given the keyboard when it loads. */
  const gameFrame = useRef<HTMLIFrameElement>(null);
  const [running, setRunning] = useState(false);
  const [autoStopped, setAutoStopped] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const touch = useCoarsePointer();
  /*
   * The build needs WebGL2. Some browsers ship without it - an embedded preview
   * pane, or a machine with hardware acceleration switched off - and the
   * engine's own failure screen is a dead end, so say what to do instead. This
   * never blocks play; it only adds a line of advice below the toolbar.
   */
  const webGl = useWebGL2();

  /*
   * Stop the game once it has scrolled out of view.
   *
   * This is the single biggest cause of a janky page: the canvas renders
   * continuously, so a game left running while somebody reads the sections
   * below competes with scrolling for the same main thread. Unmounting the
   * iframe hands all of it back. The engine persists the wallet, upgrades,
   * rider and vehicle to the device, so only the shift in progress is lost -
   * which is why it waits a few seconds first.
   */
  useEffect(() => {
    if (!running) return;

    const element = frame.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    let timer: number | undefined;
    const cancel = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          cancel();
          return;
        }
        cancel();
        timer = window.setTimeout(() => {
          setRunning(false);
          setAutoStopped(true);
        }, AUTO_STOP_MS);
      },
      { threshold: 0 },
    );

    observer.observe(element);
    return () => {
      cancel();
      observer.disconnect();
    };
  }, [running]);

  const goFullscreen = async () => {
    try {
      await frame.current?.requestFullscreen();
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (to: string) => Promise<void>;
      };
      await orientation.lock?.("landscape");
    } catch {
      // Fullscreen or the orientation lock is unavailable: play continues
      // in place, which is the point of not awaiting this before starting.
    }
  };

  const start = () => {
    setRunning(true);
    setAutoStopped(false);
    // A phone only makes sense in landscape fullscreen.
    if (touch) setTimeout(goFullscreen, 60);
  };

  return (
    <div>
      <div ref={frame} className={styles.frame}>
        {running ? (
          <>
            <iframe
              key={reloadKey}
              ref={gameFrame}
              src={game.webPath}
              title={game.title[lang]}
              className={styles.iframe}
              allow="autoplay; fullscreen; gamepad; screen-wake-lock"
              allowFullScreen
              /*
               * Hand the keyboard to the game the moment it has loaded.
               *
               * Without this the iframe is mounted but unfocused, so every key
               * the player presses goes to the page behind it. A game whose
               * first screen says "press any key to begin" then appears
               * completely dead until somebody happens to click inside it -
               * which is exactly how it was reported.
               */
              onLoad={() => gameFrame.current?.focus()}
            />

            {/* Portrait phones only: the game itself is landscape-only. */}
            <div className={styles.rotate} aria-hidden="true">
              <RotateCw size={34} className={styles.rotateIcon} />
              <p className={styles.rotateTitle}>{t.game.rotate}</p>
              <p className={styles.rotateBody}>{t.game.rotateHint}</p>
            </div>
          </>
        ) : (
          <button type="button" className={styles.poster} onClick={start}>
            <Image
              src={game.poster}
              alt=""
              width={1600}
              height={900}
              priority
              sizes="(min-width: 1200px) 1100px, 100vw"
              className={styles.posterImg}
            />
            <span className={styles.scrim} />

            <span className={styles.posterBody}>
              <span className={styles.playDisc}>
                <Play size={28} className={styles.playIcon} aria-hidden="true" />
              </span>
              <span className={styles.posterTitle}>{t.game.playHere}</span>
              <span className={styles.posterNote}>
                {autoStopped ? t.game.autoStopped : t.game.firstLoad(game.webSize)}
              </span>
            </span>
          </button>
        )}
      </div>

      {/* -------------------------------- Toolbar ------------------------------- */}
      <div className={styles.bar}>
        {running ? (
          <>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={goFullscreen}
            >
              <Maximize2 size={15} aria-hidden="true" />
              {t.game.fullscreen}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RotateCw size={15} aria-hidden="true" />
              {t.game.restart}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                setRunning(false);
                setAutoStopped(false);
              }}
            >
              <Square size={15} aria-hidden="true" />
              {t.game.stop}
            </button>
            <p className={styles.hint}>{t.game.stopHint}</p>
          </>
        ) : (
          <p className={styles.hint}>{t.game.loadHint}</p>
        )}
      </div>

      {!webGl && (
        <p className={styles.warn}>
          <AlertTriangle size={15} aria-hidden="true" />
          {t.game.noWebgl}
        </p>
      )}
    </div>
  );
}
