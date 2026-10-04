/**
 * The cinematic layer.
 *
 * Owns every full-screen surface that belongs to the STORY rather than to the
 * game: the studio card, the title screen, the name gate, and the plates a
 * cutscene draws through - letterbox, fade, glitch, smoke, title cards and the
 * spoken line.
 *
 * ui/screens.js keeps the instrument panel: pause, settings, stages, how to
 * play, the inter-chapter loader, the portrait gate. The split is by WHAT THE
 * SURFACE IS FOR, not by when it appears, because the two sets have opposite
 * rules. A screen may be interrupted and reopened; a cutscene plate may not,
 * and anything that can cover the camera mid-shot has to be owned by one module
 * that can be asked "are you clear yet".
 *
 * Two things in here are load-bearing and easy to get wrong:
 *
 *   EVERY TRANSITION RESOLVES. `fade`, `card` and `letterbox` return promises
 *   that a cutscene awaits, and a promise that never settles is a game frozen
 *   on a black screen with no input. They are therefore resolved from a timer
 *   sized to the CSS duration rather than from `transitionend`, which does not
 *   fire if the element is hidden, if the property was already at the target,
 *   or if the tab was backgrounded mid-transition.
 *
 *   THE GLITCH IS FRAME-DRIVEN. It is the one effect here with per-frame state,
 *   because a CSS animation cannot be made to look un-patterned enough, and
 *   because its intensity has to be able to track an event in the world.
 */

import { EV, emit } from "../core/bus.js";
import { clamp01 } from "../core/maths.js";
import { get as getPlatform } from "../core/platform.js";
import { t, getLanguage } from "../i18n/strings.js";
import * as profile from "../story/profile.js";
import * as save from "../state/save.js";

const el = {};

/** Callbacks the game installs. */
const hooks = {
  onBegin: () => {},
  onPlay: () => {},
  onContinue: () => {},
  onSettings: () => {},
  onStages: () => {},
  onHow: () => {},
  onExit: () => {},
};

export function setHooks(next) {
  Object.assign(hooks, next);
}

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

let bootDone = false;
let begun = false;

export function init() {
  const id = (n) => document.getElementById(n);

  el.studio = id("studio");
  el.stBar = id("stBar");
  el.stStep = id("stStep");
  el.stGo = id("stGo");

  el.title = id("title");
  el.tiPlay = id("tiPlay");
  el.tiContinue = id("tiContinue");
  el.tiSave = id("tiSave");
  el.tiProgressFill = id("tiProgressFill");
  el.tiProgressNum = id("tiProgressNum");

  el.namegate = id("namegate");
  el.nameForm = id("nameForm");
  el.nameInput = id("nameInput");
  el.nameGo = id("nameGo");

  el.cinema = id("cinema");
  el.fade = id("cnFade");
  el.glitch = id("cnGlitch");
  el.smoke = id("cnSmoke");
  el.card = id("cnCard");
  el.cardText = id("cnCardText");
  el.cardSub = id("cnCardSub");
  el.line = id("cnLine");
  el.who = id("cnWho");
  el.text = id("cnText");
  el.skip = id("cnSkip");
  el.skipKey = id("cnSkipKey");
  el.skipHold = id("cnSkipHold");

  wireStudio();
  wireTitle();
  wireName();

  // The skip affordance names the actual gesture for the device.
  if (getPlatform().touch) {
    if (el.skipKey) el.skipKey.textContent = t("tapGlyph");
    if (el.skipHold) el.skipHold.textContent = t("holdGlyph");
  }
}

/* -------------------------------------------------------------------------- *
 * Studio card
 * -------------------------------------------------------------------------- */

/**
 * Report boot progress. `key` is an i18n key, not a string.
 *
 * The key is remembered so a language switch mid-boot can re-resolve it -
 * otherwise the one line on the studio card that is written by code rather
 * than by `data-i18n` stays in the language the player just left.
 */
let stepKey = "";
export function bootProgress(percent, key) {
  if (el.stBar) el.stBar.style.width = `${percent}%`;
  if (key) stepKey = key;
  if (el.stStep && stepKey) el.stStep.textContent = t(stepKey);
}

/** Re-render anything on the studio card that was written from a key. */
export function relabel() {
  if (el.stStep && stepKey) el.stStep.textContent = t(stepKey);
  refreshTitle();
}

/**
 * Boot has finished.
 *
 * The gate is NOT removed automatically, and that is deliberate even though
 * the brief says the card transitions into the title screen after a few
 * seconds. The first user gesture is the only moment a browser will let us
 * create an unsuspended AudioContext or speak a word, and a title screen
 * reached without one is a game that is silent until the player happens to
 * click something. So the card waits for a press - and says so.
 */
export function bootReady() {
  bootDone = true;
  if (el.stGo) el.stGo.hidden = false;
  bootProgress(100, "stReady");

  /*
   * Take the keyboard, if anybody will give it to us.
   *
   * The game is normally embedded in a page, and an iframe that has not been
   * clicked does not receive key events - the parent document does. Asking for
   * focus here covers the case where the host page has not thought to hand it
   * over. It is only a request: a browser may refuse, which is why the button
   * below is a real button and the card can also be dismissed by a click.
   */
  try {
    window.focus();
    el.stGo?.focus({ preventScroll: true });
  } catch {
    /* Refused. The pointer path still works. */
  }
}

function wireStudio() {
  const leave = (e) => {
    if (!bootDone || begun) return;
    /*
     * The language pills live on the card and must not count as "any key".
     *
     * Only for the keys that ACTIVATE a button, though: if the pill has the
     * focus, Enter and Space belong to it. Every other key should still start
     * the game, or a player who has just chosen Tamil is stuck on a screen
     * telling them to press any key.
     */
    const onPill = e?.target?.closest?.(".langpill");
    if (onPill && (e.type !== "keydown" || e.key === " " || e.key === "Enter")) return;
    begun = true;

    el.studio.classList.add("out");
    // Hidden only after the fade, so the transition actually runs.
    window.setTimeout(() => {
      if (el.studio) el.studio.hidden = true;
    }, 1200);

    hooks.onBegin();
  };

  window.addEventListener("keydown", (e) => {
    if (begun || !bootDone) return;
    if (e.key === "Tab") return; // let keyboard users reach the pills
    leave(e);
  });
  el.studio?.addEventListener("pointerdown", leave);
}

/* -------------------------------------------------------------------------- *
 * Title screen
 * -------------------------------------------------------------------------- */

function wireTitle() {
  el.tiPlay?.addEventListener("click", () => hooks.onPlay());
  el.tiContinue?.addEventListener("click", () => hooks.onContinue());
  document.getElementById("tiSettings")?.addEventListener("click", () => hooks.onSettings());
  document.getElementById("tiStages")?.addEventListener("click", () => hooks.onStages());
  document.getElementById("tiHow")?.addEventListener("click", () => hooks.onHow());
  document.getElementById("tiExit")?.addEventListener("click", () => hooks.onExit());
}

export function showTitle() {
  if (!el.title) return;
  refreshTitle();
  el.title.hidden = false;
  document.body.classList.add("in-menu");
  // Restart the entrance animations. Removing and re-adding the node's own
  // animation classes is unreliable across browsers; forcing a reflow between
  // hidden and shown is not.
  void el.title.offsetWidth;
}

export function hideTitle() {
  if (!el.title) return;
  el.title.hidden = true;
  document.body.classList.remove("in-menu");
}

/**
 * Offer CONTINUE only when there is something to continue, and show how far
 * the run got.
 *
 * The progress strip reads from the SAVE rather than from the live game,
 * because on the title screen there is no live game - and the number a player
 * wants there is "where was I", not "where am I".
 */
export function refreshTitle() {
  const data = save.loadGame();
  if (el.tiContinue) el.tiContinue.hidden = !data;
  if (el.tiSave) {
    el.tiSave.textContent = data
      ? t("savedBeat", data.story?.beat ? t(`beat_${data.story.beat}`) : "—")
      : "";
  }

  // The room state IS the progress: state 0 is stage one, state 8 is stage
  // nine. See world/stages.js, which is built on the same mapping.
  const reached = Math.max(0, Math.min(9, (data?.room?.highWater ?? -1) + 1));
  if (el.tiProgressNum) el.tiProgressNum.textContent = `${reached} / 9`;
  if (el.tiProgressFill) el.tiProgressFill.style.width = `${(reached / 9) * 100}%`;
}

/* -------------------------------------------------------------------------- *
 * Name gate
 * -------------------------------------------------------------------------- */

let nameResolve = null;

/**
 * Ask the player what to call them. Resolves with the stored name.
 *
 * A NAME IS NOW REQUIRED, and it was not before. The field used to accept an
 * empty submission and hand back "Stranger", on the reasoning that the one
 * screen in the game that is purely a courtesy should not become a wall.
 *
 * That reasoning was wrong, for a reason that only shows up when you watch
 * somebody play: the name is not a courtesy in this game. The ghost says it out
 * loud, repeatedly, and the whole second half of the story is built on it
 * having said it. A player who taps past this screen gets a ghost that calls
 * them "Stranger" for twenty minutes, which reads as a bug - and it reads as a
 * bug whether they skipped the field on purpose or, far more likely, typed into
 * a page that was not listening and never noticed the field was still empty.
 *
 * So: the button stays disabled until there is something to submit, the field
 * is focused hard enough to survive being inside an iframe, and the fallback
 * remains only as a last resort for a save file that somehow has no name in it.
 */
export function askName() {
  return new Promise((resolve) => {
    nameResolve = resolve;
    if (!el.namegate) {
      resolve(profile.getName());
      return;
    }
    el.namegate.hidden = false;
    syncNameButton();

    /*
     * Focus, and then keep trying.
     *
     * The game runs in an iframe on the site. Focusing a field in a frame that
     * does not itself have focus does nothing, silently, and the player types a
     * name that goes to the parent page - which is exactly how somebody ends up
     * at a ghost calling them Stranger. Three attempts across the first few
     * hundred milliseconds covers the frame being focused late, the panel still
     * animating in, and Safari refusing a focus in the same frame the element
     * stopped being hidden.
     */
    const grab = () => {
      try {
        window.focus();
      } catch {
        /* Cross-origin parent. The in-frame focus below still works. */
      }
      el.nameInput?.focus({ preventScroll: true });
    };
    requestAnimationFrame(grab);
    setTimeout(grab, 120);
    setTimeout(grab, 420);
  });
}

/** The button is only live when there is a name to submit. */
function syncNameButton() {
  if (!el.nameGo) return;
  const ok = (el.nameInput?.value ?? "").trim().length > 0;
  el.nameGo.disabled = !ok;
  el.namegate?.classList.toggle("ng-ready", ok);
}

function wireName() {
  el.nameForm?.addEventListener("submit", (e) => {
    // Without this the form navigates and the game reloads, losing everything.
    e.preventDefault();
    submitName();
  });
  el.nameInput?.addEventListener("input", syncNameButton);
  // Clicking anywhere on the panel puts the caret back in the field. On a
  // phone that is the difference between a keyboard appearing and not.
  el.namegate?.addEventListener("pointerdown", (e) => {
    if (e.target !== el.nameInput && e.target !== el.nameGo) {
      el.nameInput?.focus({ preventScroll: true });
    }
  });
}

function submitName() {
  const typed = el.nameInput?.value ?? "";
  const stored = profile.setName(typed);

  // Nothing usable: say so where the player is looking, and stay put.
  if (!stored) {
    el.namegate?.classList.remove("ng-nudge");
    // Reflow, or the class re-added in the same frame never restarts the
    // animation.
    void el.namegate?.offsetWidth;
    el.namegate?.classList.add("ng-nudge");
    el.nameInput?.focus({ preventScroll: true });
    syncNameButton();
    return;
  }

  emit(EV.NAME_SET, { name: profile.getName() });

  if (el.namegate) el.namegate.hidden = true;
  // Reflect the sanitised value back into the field, so a player returning to
  // this screen sees what the game actually kept rather than what they typed.
  if (el.nameInput) el.nameInput.value = stored;

  const done = nameResolve;
  nameResolve = null;
  done?.(profile.getName());
}

/* -------------------------------------------------------------------------- *
 * The spoken line
 * -------------------------------------------------------------------------- */

/** Who the subtitle says is talking. The husband is the player, by name. */
function speakerLabel(who) {
  switch (who) {
    case "him":
      return profile.getName();
    case "her":
      return t("whoHer");
    case "ghost":
      return t("whoGhost");
    default:
      return "";
  }
}

let lineHold = 0;

/**
 * Show one line of dialogue.
 *
 * Shown whenever subtitles are on, and ALSO whenever there is no voice to be
 * heard - a player who has turned subtitles off has not asked to be locked out
 * of the story on a device with no speech engine.
 */
export function say(line, seconds = 3) {
  if (!el.line) return;

  const text = profile.fill((getLanguage() === "ta" ? line.ta : line.en) || "");
  if (!text) {
    // A cue-only line. Clear whatever was there rather than leaving the
    // previous speaker's words under a silent beat.
    clearSay();
    return;
  }

  el.line.dataset.who = line.who ?? "none";
  el.line.dataset.emo = line.emo ?? "calm";
  el.who.textContent = speakerLabel(line.who);
  el.text.textContent = text;
  el.line.hidden = false;
  el.line.classList.remove("out");
  lineHold = Math.max(0.8, seconds);
}

export function clearSay() {
  if (!el.line || el.line.hidden) return;
  el.line.classList.add("out");
  lineHold = 0;
  // Emptied after the fade. `:empty` is what hides the text node, and an
  // element holding stale words is one missed class away from reappearing.
  window.setTimeout(() => {
    if (!el.line || lineHold > 0) return;
    el.line.hidden = true;
    el.text.textContent = "";
    el.who.textContent = "";
  }, 460);
}

/* -------------------------------------------------------------------------- *
 * Letterbox, fade, cards
 * -------------------------------------------------------------------------- */

/** Resolve after `ms`, so a caller can await a CSS transition safely. */
const after = (ms) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Open or close the letterbox.
 *
 * The bars are sized from the viewport so the frame is a real aspect ratio
 * rather than a fixed number of pixels, and the whole thing is scaled by
 * --bars-scale on a short landscape phone, where true 2.39:1 would leave a
 * picture 160 px tall.
 */
export function letterbox(on, seconds = 1.2) {
  if (!el.cinema) return Promise.resolve();
  const scale = Number(
    getComputedStyle(el.cinema).getPropertyValue("--bars-scale") || 1,
  ) || 1;
  // 2.39:1 from a 16:9 frame is 12.5% off the top and bottom.
  const h = on ? Math.round(window.innerHeight * 0.125 * scale) : 0;
  el.cinema.style.setProperty("--bars", `${h}px`);
  el.cinema.style.setProperty("transition-duration", `${seconds}s`);
  return after(seconds * 1000);
}

/** Fade the screen to or from black. `to` is 0..1. */
export function fade(to, seconds = 0.9) {
  if (!el.fade) return Promise.resolve();
  el.fade.style.transitionDuration = `${seconds}s`;
  el.fade.style.opacity = String(clamp01(to));
  return after(seconds * 1000);
}

/** Instant black, with no transition. For a hard cut. */
export function cut(to = 1) {
  if (!el.fade) return;
  el.fade.style.transitionDuration = "0s";
  el.fade.style.opacity = String(clamp01(to));
  // Force the style to be computed before anything restores the duration,
  // otherwise the next fade inherits 0s and snaps.
  void el.fade.offsetWidth;
  el.fade.style.transitionDuration = "";
}

/**
 * A title card: FLASHBACK, TO BE CONTINUED.
 *
 * `text` and `sub` are already-translated strings, not keys, because two of
 * the three callers compose them from the player's name.
 */
export async function card(text, sub = "", { hold = 2.4, out = 1.1 } = {}) {
  if (!el.card) return;
  el.cardText.textContent = text;
  // The misregistered red copy is drawn from a data attribute by CSS, so the
  // word exists exactly once in the DOM and cannot get out of step.
  el.cardText.dataset.echo = text;
  el.cardSub.textContent = sub;
  el.card.classList.remove("out");
  el.card.hidden = false;

  await after(1600 + hold * 1000);

  el.card.classList.add("out");
  await after(out * 1000);
  el.card.hidden = true;
}

export function smoke(on) {
  if (!el.smoke) return;
  el.smoke.hidden = false;
  el.smoke.classList.toggle("on", !!on);
  if (!on) window.setTimeout(() => {
    if (el.smoke && !el.smoke.classList.contains("on")) el.smoke.hidden = true;
  }, 1900);
}

/* -------------------------------------------------------------------------- *
 * Glitch
 *
 * One number, 0..1, that decays. Call `glitch(0.8)` and the screen tears for
 * about a second; call it every frame with a small value and it stays broken.
 * The tear's position is re-rolled on its own slower clock, because moving it
 * every frame is a flicker rather than a tear.
 * -------------------------------------------------------------------------- */

let glitchAmount = 0;
let glitchDecay = 2.2;
let tearTimer = 0;

export function glitch(amount, seconds = 0.5) {
  glitchAmount = Math.max(glitchAmount, clamp01(amount));
  glitchDecay = glitchAmount / Math.max(0.05, seconds);
  if (el.glitch) el.glitch.hidden = false;
}

/** Hold the glitch at a level without decaying. 0 releases it. */
export function glitchHold(amount) {
  glitchAmount = clamp01(amount);
  glitchDecay = 0;
  if (el.glitch) {
    el.glitch.hidden = glitchAmount <= 0.001;
    el.glitch.style.setProperty("--g", String(glitchAmount));
  }
}

/* -------------------------------------------------------------------------- *
 * Skip affordance
 * -------------------------------------------------------------------------- */

export function skipHint(on) {
  if (el.skip) el.skip.hidden = !on;
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  // --- the spoken line's own lifetime ---
  if (lineHold > 0) {
    lineHold -= dt;
    if (lineHold <= 0) clearSay();
  }

  // --- glitch ---
  if (glitchAmount > 0.001) {
    if (glitchDecay > 0) {
      glitchAmount = Math.max(0, glitchAmount - glitchDecay * dt);
    }
    el.glitch?.style.setProperty("--g", String(glitchAmount));

    tearTimer -= dt;
    if (tearTimer <= 0) {
      // 60-140 ms per tear position. Faster than this is noise; slower and the
      // band reads as a solid object sitting on the screen.
      tearTimer = 0.06 + Math.random() * 0.08;
      el.glitch?.style.setProperty("--tear", `${Math.random() * 92}%`);
    }
    if (glitchAmount <= 0.001 && el.glitch) {
      el.glitch.hidden = true;
      el.glitch.style.setProperty("--g", "0");
    }
  }
}

/* -------------------------------------------------------------------------- *
 * Teardown
 * -------------------------------------------------------------------------- */

/**
 * Put every plate back to neutral.
 *
 * Called when a cutscene is abandoned - quitting to the title screen from
 * inside one. Without it the player returns to a title screen behind a black
 * fade plate and a pair of letterbox bars.
 */
export function clearAll() {
  clearSay();
  glitchHold(0);
  smoke(false);
  skipHint(false);
  if (el.card) el.card.hidden = true;
  letterbox(false, 0.3);
  fade(0, 0.3);
}
