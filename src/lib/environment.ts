"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser capabilities read through `useSyncExternalStore`, the same way
 * `LanguageProvider` reads localStorage.
 *
 * Reading them in an effect and calling setState would work, but it costs an
 * extra render pass on every mount and React now flags it. Going through a
 * store keeps the server render and the hydration render identical - both use
 * the pessimistic default - and React re-reads the real value straight after
 * hydrating.
 */

/* ------------------------------ Coarse pointer --------------------------- */

/** Cached so getSnapshot returns a stable value between renders. */
let coarse: boolean | null = null;

function readCoarse(): boolean {
  if (coarse === null) {
    coarse = window.matchMedia("(pointer: coarse)").matches;
  }
  return coarse;
}

function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia("(pointer: coarse)");
  const handle = () => {
    coarse = query.matches;
    onChange();
  };
  query.addEventListener("change", handle);
  return () => query.removeEventListener("change", handle);
}

/**
 * True on touch input. Used to decide whether to ask for fullscreen and a
 * landscape lock, which only make sense on a phone or tablet.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, readCoarse, () => false);
}

/* --------------------------------- WebGL2 -------------------------------- */

let webgl2: boolean | null = null;

function readWebGL2(): boolean {
  if (webgl2 === null) {
    try {
      webgl2 = !!document.createElement("canvas").getContext("webgl2");
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}

/** Support never appears or disappears mid-session, so there is nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

/**
 * Whether the browser can run a WebGL2 game. Assumed available on the server so
 * the warning is never in the delivered HTML; it appears only once the real
 * check has failed in the browser.
 */
export function useWebGL2(): boolean {
  return useSyncExternalStore(subscribeNever, readWebGL2, () => true);
}
