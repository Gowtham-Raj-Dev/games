/**
 * The in-game HUD.
 *
 * Two readouts and nothing else: how stable the room is, and how big it is.
 * The brief asks for a minimal cinematic interface, and these are the only
 * two numbers the player cannot work out by looking.
 *
 * The rule this file follows throughout is DO NOT TOUCH THE DOM UNLESS THE
 * VALUE CHANGED. Writing `textContent` every frame on half a dozen nodes
 * forces style recalculation 60 times a second for nothing, and it is the
 * main reason HUDs built this way make a 3D page feel heavy. Every setter
 * below caches its last value first.
 */

import { EV, on } from "../core/bus.js";
import { get as getPlatform } from "../core/platform.js";
import { t } from "../i18n/strings.js";
import * as stability from "../world/stability.js";
import * as playclock from "../state/playclock.js";
import * as roomScale from "../world/roomScale.js";
import { STAGE_COUNT, stageNumber } from "../world/stages.js";
import * as interaction from "../interaction/manager.js";

const el = {};
const cache = {};

/** Body classes the stylesheet keys the stability ramp off. */
const BAND_CLASS = {
  stable: "room-steady",
  steady: "room-steady",
  warning: "room-shifting",
  unstable: "room-shifting",
  critical: "room-critical",
  emergency: "room-critical",
};

/*
 * Transient-line lifecycle.
 *
 * The stylesheet hides #msg, #sub, #subtitle and #objective with `:empty` or
 * an `.out` class - deliberately, so a line the engine forgets to clear can
 * never be left stranded invisible. The first version of this file toggled an
 * `.on` class instead, which the stylesheet does not define at all: the text
 * was written once and never cleared, so THE ROOM EXPANDS and the Checkpoint
 * toast stayed on screen for the rest of the session.
 *
 * Each line now has a hold, then a fade, then the text is actually emptied.
 * Driven from tick() rather than setTimeout so it respects pause and cannot
 * fire into a torn-down HUD.
 */
const FADE = 0.44; // must be >= the --t-3 transition in style.css (420ms)

const lines = {
  msg: { hold: 0, fade: 0, nodes: ["msg", "sub"] },
  subtitle: { hold: 0, fade: 0, nodes: ["subtitle"] },
  // A hint stays up far longer than flavour text: the player asked for it
  // and may well be reading it while walking across the room.
  hint: { hold: 0, fade: 0, nodes: ["hintTier", "hintText"] },
};

/** Show a transient line for `seconds`, then fade it out and clear it. */
function hold(key, seconds) {
  const line = lines[key];
  line.hold = seconds;
  line.fade = 0;
  for (const id of line.nodes) el[id]?.classList.remove("out");
}

function tickLines(dt) {
  for (const key in lines) {
    const line = lines[key];

    if (line.hold > 0) {
      line.hold -= dt;
      if (line.hold <= 0) {
        line.hold = 0;
        line.fade = FADE;
        for (const id of line.nodes) el[id]?.classList.add("out");
      }
      continue;
    }

    if (line.fade > 0) {
      line.fade -= dt;
      if (line.fade <= 0) {
        line.fade = 0;
        // Emptied, not just faded: `:empty` is what the stylesheet keys on,
        // and an element holding stale text is one missed class away from
        // reappearing.
        for (const id of line.nodes) {
          const node = el[id];
          if (!node) continue;
          node.textContent = "";
          node.classList.remove("out", "warn", "crit");
        }
      }
    }
  }
}

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

export function init() {
  const id = (name) => document.getElementById(name);

  el.hud = id("hud");
  el.stabFill = id("stabFill");
  el.stabPct = id("stabPct");
  el.dims = id("dims");
  el.stageNow = id("stageNow");
  el.playTime = id("playTime");
  el.dimW = id("dimW");
  el.dimD = id("dimD");
  el.dimH = id("dimH");
  el.objective = id("objective");
  el.crosshair = id("crosshair");
  el.prompt = id("prompt");
  el.promptKey = id("promptKey");
  el.promptVerb = id("promptVerb");
  el.promptName = id("promptName");
  el.msg = id("msg");
  el.sub = id("sub");
  el.subtitle = id("subtitle");
  el.hint = id("hint");
  el.hintTier = id("hintTier");
  el.hintText = id("hintText");
  el.hintHint = id("hintHint");
  el.touch = id("touch");

  // The key glyph is the one piece of the prompt that is about the device
  // rather than the game, so it is set once here rather than per-frame.
  el.promptKey.textContent = getPlatform().touch ? "TAP" : "E";
  if (getPlatform().touch) el.promptKey.classList.add("tap");

  wire();
}

function wire() {
  on(EV.FOCUS_CHANGED, ({ item, verb, name }) => {
    if (!item) {
      hidePrompt();
      return;
    }
    showPrompt(verb, name);
  });

  on(EV.PICKED_UP, () => hidePrompt());

  on(EV.STABILITY_CHANGED, ({ delta, reason }) => {
    if (reason === "set" || delta === 0) return;
    // Flash the meter, and say what moved it. A number that changes silently
    // reads as a bug; a number that explains itself reads as a consequence.
    el.stabFill?.parentElement?.classList.add("hit");
    window.setTimeout(
      () => el.stabFill?.parentElement?.classList.remove("hit"),
      520,
    );
    toast(delta > 0 ? t("stabilityUp", delta) : t("stabilityDown", -delta));
  });

  on(EV.STABILITY_BAND, ({ band }) => {
    const next = BAND_CLASS[band.key] ?? "room-steady";
    document.body.classList.remove("room-steady", "room-shifting", "room-critical");
    document.body.classList.add(next);
  });

  on(EV.ROOM_EXPAND_START, ({ to }) => {
    banner(t("expandMsg"), t("expandSub", to.w, to.d));
    markAxes("grew");
  });

  on(EV.ROOM_SHRINK_START, ({ to }) => {
    banner(t("shrinkMsg"), t("shrinkSub", to.w, to.d), true);
    markAxes("shrank");
  });

  on(EV.ROOM_CHANGED, () => {
    window.setTimeout(() => markAxes(null), 1800);
  });

  on(EV.CHECKPOINT, () => toast(t("checkpointReached")));
  on(EV.SUBTITLE, ({ text, seconds }) => subtitle(text, seconds));
  on(EV.TOAST, ({ text }) => toast(text));
}

/**
 * Wash the three dimension cells when the room changes.
 *
 * The class goes on each `.d` cell, not on the `#dims` container: the
 * stylesheet selector is `.dims .d.grew`, so putting it on the container
 * matched nothing and the axes never lit up.
 */
function markAxes(kind) {
  if (!el.dims) return;
  for (const cell of el.dims.children) {
    cell.classList.remove("grew", "shrank");
    if (kind) cell.classList.add(kind);
  }
}

export function show(visible) {
  if (!el.hud) return;
  // Leaving a banner mid-flight and then hiding the HUD meant it was still
  // there, frozen, when the player came back from the menu.
  if (!visible) clearLines();
  el.hud.hidden = !visible;
  if (el.touch) el.touch.hidden = !visible || !getPlatform().touch;
  document.body.classList.toggle("playing", visible);
}

/** Empty every transient line immediately, with no fade. */
export function clearLines() {
  for (const key in lines) {
    lines[key].hold = 0;
    lines[key].fade = 0;
    for (const id of lines[key].nodes) {
      const node = el[id];
      if (!node) continue;
      node.textContent = "";
      node.classList.remove("out", "warn", "crit");
    }
  }
  hidePrompt();
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!el.hud || el.hud.hidden) return;

  // --- stability ---
  const display = stability.getDisplay();
  const pct = Math.round(display);
  if (cache.pct !== pct) {
    cache.pct = pct;
    el.stabPct.textContent = pct;
  }
  // Width is written as a percentage string; comparing the rounded number
  // first means at most one style write per whole percent.
  if (cache.fill !== pct) {
    cache.fill = pct;
    el.stabFill.style.width = `${pct}%`;
  }

  // --- stage ---
  const stage = stageNumber(roomScale.stateId());
  if (cache.stage !== stage) {
    cache.stage = stage;
    el.stageNow.textContent = `${stage} / ${STAGE_COUNT}`;
  }

  // --- run timer ---
  // Compared as a STRING before writing, like every other readout here: the
  // underlying number changes every frame and the text changes once a second.
  const clock = playclock.format();
  if (cache.clock !== clock) {
    cache.clock = clock;
    if (el.playTime) el.playTime.textContent = clock;
  }

  // --- dimensions ---
  const d = roomScale.dims;
  setDim("dimW", "w", d.w);
  setDim("dimD", "d", d.d);
  setDim("dimH", "h", d.h);

  // --- crosshair ---
  // Dilates when something is in reach. The only feedback the crosshair gives,
  // and enough: the prompt below it carries the words.
  const focused = interaction.getFocused();
  const aimed = !!focused || interaction.isCarrying();
  if (cache.aimed !== aimed) {
    cache.aimed = aimed;
    // `.hot`, not `.on` - that is the class the stylesheet actually defines.
    el.crosshair.classList.toggle("hot", aimed);
  }

  tickLines(dt);
}

/**
 * Write one dimension cell.
 *
 * Rounded to two decimals, and compared as a STRING before writing. During a
 * transition the underlying float changes every frame but the displayed text
 * only changes a few times a second, and this is what keeps a continuously
 * animating readout from costing continuous layout.
 */
function setDim(key, cacheKey, value) {
  const text = value.toFixed(2);
  if (cache[cacheKey] === text) return;
  cache[cacheKey] = text;
  el[key].textContent = text;
}

/* -------------------------------------------------------------------------- *
 * Prompt
 * -------------------------------------------------------------------------- */

function showPrompt(verb, name) {
  const verbText = t(verb);
  const nameText = name ? t(name) : "";
  if (cache.verb === verbText && cache.name === nameText && !el.prompt.hidden) {
    return;
  }
  cache.verb = verbText;
  cache.name = nameText;
  el.promptVerb.textContent = verbText;
  el.promptName.textContent = nameText;
  // The prompt is gated by the `hidden` attribute, not by a class - the
  // stylesheet gives it a fade-in animation and `[hidden]` does the rest.
  el.prompt.hidden = false;
}

function hidePrompt() {
  if (el.prompt.hidden) return;
  cache.verb = cache.name = null;
  el.prompt.hidden = true;
}

/* -------------------------------------------------------------------------- *
 * Messages
 * -------------------------------------------------------------------------- */

/** The big centre callout, for room events. */
export function banner(text, sub = "", warn = false) {
  if (!el.msg) return;
  el.msg.textContent = text;
  el.msg.classList.toggle("warn", warn);
  el.sub.textContent = sub;
  hold("msg", 3.4);
}

/** A small line, for stability changes and checkpoints. */
export function toast(text) {
  if (!el.subtitle) return;
  subtitle(text, 2.2, "toast");
}

/** Spoken or environmental text, bottom centre. */
export function subtitle(text, seconds = 3.5, kind = "line") {
  if (!el.subtitle) return;
  el.subtitle.textContent = text;
  el.subtitle.dataset.kind = kind;
  hold("subtitle", seconds);
}

/**
 * The persistent objective line. Not transient - it stays until replaced.
 * Passing an empty string clears it, which is what `:empty` hides on.
 */
/**
 * Show a hint.
 *
 * `tier` is a short label - the goal, which step this is, or that it is the
 * last one - so the player can tell how much help is left before they ask
 * for more.
 */
export function showHint(tier, text, seconds = 11) {
  if (!el.hintText) return;
  el.hintTier.textContent = tier;
  el.hintText.textContent = text;
  hold("hint", seconds);
}

/** Show or hide the "press H" affordance. */
export function setHintAffordance(visible) {
  if (!el.hintHint) return;
  el.hintHint.classList.toggle("on", !!visible);
}

/**
 * The persistent objective line. Not transient - it stays until replaced.
 *
 * Takes an i18n KEY, not a finished string. It used to take the translated
 * text, which made the objective the one line on screen that stayed in the
 * old language after a switch to Tamil: everything around it changed and it
 * did not. Storing the key lets `relabel()` re-resolve it.
 */
export function setObjective(key) {
  if (!el.objective) return;
  cache.objectiveKey = key || null;
  const next = key ? t(key) : "";
  if (cache.objective === next) return;
  cache.objective = next;
  el.objective.textContent = next;
}

/** Re-render anything holding a translated string. Called on a language switch. */
export function relabel() {
  cache.verb = cache.name = null;

  // Re-resolve the objective from its key, in the new language.
  const key = cache.objectiveKey;
  cache.objective = null;
  setObjective(key);

  const focused = interaction.getFocused();
  if (focused) showPrompt(focused.verb, focused.name);
}
