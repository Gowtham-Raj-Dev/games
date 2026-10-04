/**
 * Persistence: settings, the save game, and checkpoints.
 *
 * Two things here that the sibling game in this repo does not do, and should:
 *
 *   1. A SCHEMA VERSION from day one, with a migration hook. That game's only
 *      tool for a breaking change is renaming the key, which works but
 *      strands orphans in localStorage forever and cannot carry progress
 *      across. A version field costs nothing now and is impossible to retrofit
 *      once players have saves.
 *   2. Every read supplies a default and every access is wrapped. Safari in
 *      private mode throws on `localStorage.setItem`, and an unguarded write
 *      takes down whatever called it - which, for an autosave, is the game
 *      loop.
 */

import { SAVE, DEFAULT_SETTINGS } from "../core/config.js";
import { EV, emit } from "../core/bus.js";

/* -------------------------------------------------------------------------- *
 * Storage primitive
 * -------------------------------------------------------------------------- */

/** Set once we know whether storage works, so we only find out the hard way once. */
let storageOk = null;

function probe() {
  if (storageOk !== null) return storageOk;
  try {
    const k = "__withroom_probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    storageOk = true;
  } catch {
    // Private mode, a disabled-storage policy, or a full quota. The game runs
    // perfectly well without saving; it just must not pretend it saved.
    storageOk = false;
  }
  return storageOk;
}

function read(key, fallback) {
  if (!probe()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  if (!probe()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const canSave = () => probe();

/* -------------------------------------------------------------------------- *
 * Settings
 * -------------------------------------------------------------------------- */

let settings = { ...DEFAULT_SETTINGS };

export function loadSettings() {
  const stored = read(SAVE.settingsKey, null);
  // Merge rather than replace, so a setting added in a later build gets its
  // default instead of being undefined for everyone who played the old one.
  settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  return settings;
}

export const getSettings = () => settings;

/** Change one or more settings, persist, and tell the game. */
export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  write(SAVE.settingsKey, settings);
  emit(EV.SETTINGS_CHANGED, { settings, patch });
  return settings;
}

export function resetSettings() {
  settings = { ...DEFAULT_SETTINGS };
  write(SAVE.settingsKey, settings);
  emit(EV.SETTINGS_CHANGED, { settings, patch: settings });
  return settings;
}

/* -------------------------------------------------------------------------- *
 * Save game
 *
 * The save is assembled by the caller from each system's `serialise()`, so
 * this module never has to know what a puzzle or a room state looks like.
 * -------------------------------------------------------------------------- */

/**
 * Migrate a save written by an older build.
 *
 * Returns null if the save cannot be carried forward, which the caller treats
 * as "no save" rather than as an error - losing a save is bad, but loading a
 * malformed one and crashing on chapter three is worse.
 */
function migrate(data) {
  if (!data || typeof data !== "object") return null;
  let save = data;

  /*
   * Version 2 is WITHROOM. Version 1 predates the story entirely - no beat, no
   * name, and stages that have since been redesigned - so it is refused rather
   * than carried forward: dropping a save is bad, and loading one that strands
   * the player in a stage that no longer exists is worse.
   *
   * The switch stays even with one live case, so the NEXT breaking change is a
   * three-line diff rather than a decision about everyone's progress.
   */
  switch (save.version) {
    case SAVE.version:
      break;
    default:
      return null;
  }
  return save;
}

export function hasSave() {
  return migrate(read(SAVE.key, null)) !== null;
}

export function loadGame() {
  return migrate(read(SAVE.key, null));
}

export function saveGame(payload) {
  const data = {
    version: SAVE.version,
    savedAt: Date.now(),
    ...payload,
  };
  const ok = write(SAVE.key, data);
  if (ok) emit(EV.SAVED, { data });
  return ok;
}

export function clearSave() {
  if (!probe()) return;
  try {
    localStorage.removeItem(SAVE.key);
  } catch {
    /* Nothing useful to do; the save simply stays. */
  }
}

/* -------------------------------------------------------------------------- *
 * Autosave
 * -------------------------------------------------------------------------- */

let autosaveTimer = 0;
let collect = null;

/**
 * Start autosaving.
 *
 * `collector` returns the payload to save. Saving is also forced when the tab
 * is hidden, which is the single most important moment to catch: on a phone,
 * "hidden" is usually the last event the page ever receives, because the OS
 * is free to discard the tab afterwards without another callback.
 */
export function startAutosave(collector) {
  collect = collector;
  stopAutosave();
  autosaveTimer = window.setInterval(() => {
    if (collect) saveGame(collect());
  }, SAVE.autosaveInterval * 1000);

  document.addEventListener("visibilitychange", onVisibility);
  // `pagehide` saves unconditionally. It can fire while the document still
  // reports itself visible - a back/forward-cache eviction, for instance -
  // and it is the last callback a discarded tab ever gets.
  window.addEventListener("pagehide", onHide);
}

function onVisibility() {
  if (document.visibilityState === "hidden") onHide();
}

function onHide() {
  if (collect) saveGame(collect());
}

export function stopAutosave() {
  if (autosaveTimer) window.clearInterval(autosaveTimer);
  autosaveTimer = 0;
}

/** Force a save now. Used at checkpoints. */
export function flush() {
  if (collect) return saveGame(collect());
  return false;
}
