/**
 * The instrument panel: pause, settings, how to play, the stage list, game
 * over, the inter-chapter loader and the portrait gate.
 *
 * They live together because they are all the same kind of thing - a layer that
 * takes over the screen and hands control back - and because the rules about
 * which may be open at once only make sense in one place.
 *
 * WITHROOM note: the studio card, the title screen, the name gate and every
 * cutscene plate moved to ui/cinema.js. The split is by what the surface is FOR
 * rather than by when it appears: these may be interrupted and reopened at any
 * time, and a cutscene plate may not. This file no longer owns a boot screen or
 * a main menu at all.
 */

import { EV, emit, on } from "../core/bus.js";
import { get as getPlatform, TIER, setTier } from "../core/platform.js";
import { t, setLanguage, getLanguage, apply as applyI18n } from "../i18n/strings.js";
import * as save from "../state/save.js";
import * as roomScale from "../world/roomScale.js";
import * as stability from "../world/stability.js";
import {
  STAGES,
  STAGE_COUNT,
  PLAYABLE_COUNT,
  STATUS,
} from "../world/stages.js";

const el = {};

/** Which overlay is open, so Escape knows what it is closing. */
let openOverlay = null;
/** Set once the splash has been dismissed, so it cannot be dismissed twice. */
let splashLeft = false;
let splashReady = false;

/** Callbacks the game installs. */
const hooks = {
  onLoadCheckpoint: () => {},
  onResume: () => {},
  onQuitToMenu: () => {},
  onRetry: () => {},
};

export function setHooks(next) {
  Object.assign(hooks, next);
}

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

export function init() {
  const id = (n) => document.getElementById(n);

  el.pause = id("pause");
  el.pzSize = id("pzSize");
  el.pzStab = id("pzStab");
  el.pzCheck = id("pzCheck");

  el.settings = id("settings");
  el.howto = id("howto");
  el.kgrid = id("kgrid");

  el.gameover = id("gameover");
  el.goBest = id("goBest");
  el.goCheck = id("goCheck");

  el.loading = id("loading");
  el.ldBar = id("ldBar");
  el.ldStep = id("ldStep");
  el.ldName = id("ldName");
  el.ldPlan = id("ldPlan");

  el.rotate = id("rotate");
  el.debug = id("debug");

  wireOverlays();
  buildSettings();
  buildKeyGrid();
  buildStages();
  watchOrientation();

  on(EV.LANGUAGE_CHANGED, () => {
    applyI18n();
    buildSettings();
    buildKeyGrid();
    buildStages();
  });
}

/* -------------------------------------------------------------------------- *
 * Overlays
 * -------------------------------------------------------------------------- */

function wireOverlays() {
  // The language pills appear on the studio card, the title screen and in
  // Settings. One listener per button, wired wherever they are: cinema.js owns
  // the screens they sit on but not the behaviour of the control.
  for (const btn of document.querySelectorAll(".langpill button")) {
    btn.addEventListener("click", () => {
      setLanguage(btn.dataset.lang);
      /*
       * And give the focus back.
       *
       * The studio card is dismissed by "any key", and it ignores keys whose
       * target is inside a language pill - otherwise tabbing to the pill and
       * pressing space would start the game instead of switching language. A
       * clicked button keeps the focus, so after choosing Tamil the card could
       * no longer be dismissed by the keyboard at all: every key went to the
       * pill and was ignored. Blurring costs nothing and fixes it at the source.
       */
      btn.blur();
    });
  }

  // One declarative close convention, matching the sibling game.
  for (const btn of document.querySelectorAll("[data-close]")) {
    btn.addEventListener("click", () => closeOverlay(btn.dataset.close));
  }
  // Clicking the scrim closes, but only the scrim - not a click that started
  // inside the card and drifted out, which is why this tests `target` rather
  // than using a capture listener.
  for (const name of ["settings", "howto", "pause", "stages"]) {
    const node = document.getElementById(name);
    node?.addEventListener("pointerdown", (e) => {
      if (e.target === node) closeOverlay(name);
    });
  }

  document.getElementById("btnResume")?.addEventListener("click", () => {
    closeOverlay("pause");
    hooks.onResume();
  });
  document.getElementById("btnPauseSettings")?.addEventListener("click", () =>
    openOverlayById("settings"),
  );
  document.getElementById("btnMenu")?.addEventListener("click", () => {
    closeOverlay("pause");
    hooks.onQuitToMenu();
  });

  document.getElementById("btnRetry")?.addEventListener("click", () => {
    closeOverlay("gameover");
    hooks.onRetry();
  });
  document.getElementById("btnLoadCheck")?.addEventListener("click", () => {
    closeOverlay("gameover");
    hooks.onLoadCheckpoint();
  });
  document.getElementById("btnGoMenu")?.addEventListener("click", () => {
    closeOverlay("gameover");
    hooks.onQuitToMenu();
  });

  // The stage list is reachable from inside Settings as well as from the title
  // screen, because a player who is stuck opens Settings looking for a hint.
  document.getElementById("btnSettingsStages")?.addEventListener("click", () =>
    openOverlayById("stages"),
  );

  document
    .getElementById("btnSettingsReset")
    ?.addEventListener("click", () => {
      save.resetSettings();
      buildSettings();
    });
}

export function openOverlayById(name) {
  const node = document.getElementById(name);
  if (!node) return;
  node.hidden = false;
  openOverlay = name;
  // Move focus into the card so the keyboard and a screen reader both land
  // somewhere sensible rather than staying on whatever opened it.
  node.querySelector("button, input, [tabindex]")?.focus({ preventScroll: true });
}

export function closeOverlay(name) {
  const node = document.getElementById(name);
  if (!node) return;
  node.hidden = true;
  if (openOverlay === name) openOverlay = null;
}

export const currentOverlay = () => openOverlay;

export function showPause(show) {
  if (show) {
    openOverlayById("pause");
    const s = roomScale.state();
    if (el.pzSize) el.pzSize.textContent = `${s.w.toFixed(2)} × ${s.d.toFixed(2)}`;
    if (el.pzStab) el.pzStab.textContent = `${Math.round(stability.get())}%`;
  } else {
    closeOverlay("pause");
  }
}

export function showGameOver(info = {}) {
  const s = roomScale.state();
  if (el.goBest) {
    el.goBest.textContent = `${s.w} × ${s.d}`;
  }
  if (el.goCheck) el.goCheck.textContent = String(info.checkpoint ?? 1).padStart(2, "0");
  openOverlayById("gameover");
}

/* -------------------------------------------------------------------------- *
 * Settings panel
 *
 * Built declaratively from the settings object, so adding a setting is one
 * row here and one default in config.js. Every control writes through
 * `save.updateSettings`, which persists and emits - nothing applies a setting
 * directly, so there is exactly one path from a control to the game.
 * -------------------------------------------------------------------------- */

/**
 * A segmented control.
 *
 * `aria-pressed` is the only selection state, which makes it structurally
 * impossible to style a selection without also announcing it.
 */
function segment(nodeId, options, key, onChange) {
  const node = document.getElementById(nodeId);
  if (!node) return;
  const current = save.getSettings()[key];
  node.innerHTML = "";

  for (const [value, label] of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(current === value));
    b.addEventListener("click", () => {
      save.updateSettings({ [key]: value });
      segment(nodeId, options, key, onChange);
      onChange?.(value);
    });
    node.appendChild(b);
  }
}

/** A slider with a live numeric readout. */
function range(inputId, outputId, key, { scale = 1, suffix = "", format } = {}) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  if (!input) return;

  const settings = save.getSettings();
  input.value = String(Math.round((settings[key] ?? 0) * scale));

  const paint = () => {
    const raw = Number(input.value);
    if (output) {
      output.textContent = format ? format(raw) : `${raw}${suffix}`;
    }
    // Fill the track to the thumb. A bare range input in a dark UI is almost
    // invisible; this is the cheapest way to make the value readable.
    const pct =
      ((raw - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty("--fill", `${pct}%`);
  };

  paint();
  input.addEventListener("input", () => {
    paint();
    save.updateSettings({ [key]: Number(input.value) / scale });
  });
}

export function buildSettings() {
  const onOff = [
    [true, t("on")],
    [false, t("off")],
  ];

  segment(
    "segQuality",
    [
      ["auto", t("auto")],
      [TIER.LOW, t("low")],
      [TIER.MEDIUM, t("medium")],
      [TIER.HIGH, t("high")],
      [TIER.ULTRA, t("ultra")],
    ],
    "quality",
    (value) => {
      if (value !== "auto") setTier(value);
      emit(EV.SETTINGS_CHANGED, { settings: save.getSettings(), patch: { quality: value } });
    },
  );

  segment("segCrosshair", onOff, "crosshair");
  segment("segSubtitles", onOff, "subtitles");
  segment("segVoices", onOff, "voices");
  segment("segInvert", onOff, "invertY");
  segment(
    "segCrouch",
    [
      [false, t("hold")],
      [true, t("toggle")],
    ],
    "toggleCrouch",
  );
  segment(
    "segLang",
    [
      ["en", "English"],
      ["ta", "தமிழ்"],
    ],
    "language",
    (value) => setLanguage(value),
  );

  range("rngFov", "outFov", "fov", { suffix: "°" });
  range("rngShake", "outShake", "cameraShake", { scale: 100, suffix: "%" });
  range("rngBob", "outBob", "headBob", { scale: 100, suffix: "%" });
  range("rngMaster", "outMaster", "masterVolume", { scale: 100, suffix: "%" });
  range("rngSfx", "outSfx", "sfxVolume", { scale: 100, suffix: "%" });
  range("rngMusic", "outMusic", "musicVolume", { scale: 100, suffix: "%" });
  range("rngVoice", "outVoice", "voiceVolume", { scale: 100, suffix: "%" });
  range("rngSens", "outSens", "sensitivity", { scale: 100, suffix: "%" });

  // Touch-only rows are revealed rather than created, so the markup stays
  // readable and there is one source of truth for what exists.
  const touch = getPlatform().touch;
  for (const node of document.querySelectorAll(".touchonly")) node.hidden = !touch;

  // Keep the language pills in step with the setting, wherever they appear.
  for (const btn of document.querySelectorAll(".langpill button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === getLanguage()));
  }
}

/* -------------------------------------------------------------------------- *
 * The stage list
 *
 * Rendered from `world/stages.js`, which is also what the game itself reads,
 * so the instructions here cannot drift out of step with the puzzles. It
 * states plainly which stages are built: a player hunting for a puzzle that
 * does not exist yet is a far worse experience than one told where the
 * finished work currently ends.
 * -------------------------------------------------------------------------- */

function buildStages() {
  const list = document.getElementById("stageList");
  const lang = getLanguage();

  // Counts appear in three places; set them all from the one source.
  for (const id of ["stageCount", "stageCount2"]) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(STAGE_COUNT);
  }
  const tally = document.getElementById("stagesTally");
  if (tally) tally.textContent = `${PLAYABLE_COUNT} / ${STAGE_COUNT}`;
  const lede = document.getElementById("stagesLede");
  if (lede) lede.textContent = t("stagesLede", PLAYABLE_COUNT, STAGE_COUNT);
  if (!list) return;
  list.innerHTML = "";

  for (const stage of STAGES) {
    const li = document.createElement("li");
    li.className = "stagerow";
    li.dataset.status = stage.status;

    const head = document.createElement("div");
    head.className = "stagehead";

    const no = document.createElement("span");
    no.className = "stageno num";
    no.textContent = String(stage.n).padStart(2, "0");

    const title = document.createElement("div");
    title.className = "stagetitle";
    const name = document.createElement("b");
    name.textContent = stage.name[lang] ?? stage.name.en;
    const size = document.createElement("em");
    size.className = "num";
    size.textContent = `${stage.size} m`;
    title.append(name, size);

    const badge = document.createElement("span");
    badge.className = "stagebadge";
    badge.textContent = t(
      stage.status === STATUS.PLAYABLE ? "statusPlayable" : "statusPlanned",
    );

    head.append(no, title, badge);

    const goal = document.createElement("p");
    goal.className = "stagegoal";
    goal.textContent = stage.goal[lang] ?? stage.goal.en;

    const howLabel = document.createElement("p");
    howLabel.className = "stagelabel";
    howLabel.textContent = t("stageHow");

    const steps = document.createElement("ol");
    steps.className = "stagesteps";
    for (const step of stage.how) {
      const s = document.createElement("li");
      s.textContent = step[lang] ?? step.en;
      steps.appendChild(s);
    }

    const reward = document.createElement("p");
    reward.className = "stagereward";
    reward.textContent = `${t("stageReward")} — ${stage.reward[lang] ?? stage.reward.en}`;

    li.append(head, goal, howLabel, steps, reward);
    list.appendChild(li);
  }
}

/* -------------------------------------------------------------------------- *
 * How to play
 * -------------------------------------------------------------------------- */

function buildKeyGrid() {
  if (!el.kgrid) return;
  const touch = getPlatform().touch;

  const rows = touch
    ? [
        [t("kMoveTouch"), t("kMove")],
        [t("kLookTouch"), t("kLook")],
        [t("kInteractTouch"), t("kInteract")],
        ["⤓", t("kDrop")],
      ]
    : [
        ["W A S D", t("kMove")],
        [t("kLook"), t("kLook")],
        ["E", t("kInteract")],
        ["Q", t("kDrop")],
        ["Shift", t("kSprint")],
        ["C", t("kCrouch")],
        ["Esc", t("kPause")],
      ];

  el.kgrid.innerHTML = "";
  /*
   * Each row is a <span> holding one or more <kbd> and a trailing <em>.
   * That is the structure css/style.css documents and selects on
   * (`.kgrid span`, `.kgrid em`); the first version emitted a div.krow,
   * which matched no rule at all and left the grid as unstyled blocks.
   */
  for (const [keys, action] of rows) {
    const row = document.createElement("span");
    const kbd = document.createElement("kbd");
    kbd.textContent = keys;
    const em = document.createElement("em");
    em.textContent = action;
    row.append(kbd, em);
    el.kgrid.appendChild(row);
  }
  // Mouse look has no key glyph, so the second desktop row is relabelled.
  if (!touch) {
    const second = el.kgrid.children[1]?.querySelector("kbd");
    if (second) second.textContent = "Mouse";
  }
}

/* -------------------------------------------------------------------------- *
 * Loading screen
 * -------------------------------------------------------------------------- */

export function showLoading(show, name = "") {
  if (!el.loading) return;
  el.loading.hidden = !show;
  if (show) {
    if (name && el.ldName) el.ldName.textContent = name;
    // Restart the floor-plan draw by removing and re-adding the class.
    el.ldPlan?.classList.remove("draw");
    void el.ldPlan?.offsetWidth;
    el.ldPlan?.classList.add("draw");
  }
}

export function loadProgress(percent, key) {
  if (el.ldBar) el.ldBar.style.width = `${percent}%`;
  if (el.ldStep) el.ldStep.textContent = t(key);
}

/* -------------------------------------------------------------------------- *
 * Orientation
 * -------------------------------------------------------------------------- */

/**
 * The portrait gate.
 *
 * Only while actually playing. The menu works perfectly well in portrait, and
 * blocking it there would mean a player cannot even read the controls without
 * turning the phone first.
 */
function watchOrientation() {
  const portrait = window.matchMedia("(orientation: portrait)");
  const update = () => {
    const blocked =
      getPlatform().touch &&
      portrait.matches &&
      document.body.classList.contains("playing");
    if (el.rotate) el.rotate.hidden = !blocked;
    if (blocked) emit(EV.GAME_PAUSE, { auto: true, source: "orientation" });
  };
  portrait.addEventListener("change", () => window.setTimeout(update, 120));
  on(EV.GAME_START, update);
  on(EV.GAME_RESUME, update);
}

/** Request landscape fullscreen. Must be called from inside a user gesture. */
export async function goFullscreen() {
  if (!getPlatform().touch) return;
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    }
    // Both of these reject routinely on iOS, which supports neither. The
    // game is perfectly playable without them, so a failure is not an error.
    await screen.orientation?.lock?.("landscape");
  } catch {
    /* Expected on iOS and in some embedded webviews. */
  }
}
