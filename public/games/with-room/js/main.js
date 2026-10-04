/**
 * WITHROOM - entry point.
 *
 * Two jobs, and they are deliberately separated in this file:
 *
 *   BOOT, at the top. Probe the device, read the settings, build the renderer,
 *   generate the textures, build the world, compile the shaders - in that order,
 *   yielding to the browser between stages so the studio card's progress bar
 *   actually paints. This part is unchanged from the build before the story
 *   existed, because it was right.
 *
 *   THE STORY, at the bottom. One async function per beat, and a single
 *   `runStory` that walks them. It reads top to bottom like the flow in the
 *   brief: studio card, title, name, the car, waking up, the ghost, the nine
 *   stages, the flashback, the reveal, the final door, the corridor, the end,
 *   back to the title.
 *
 * THE RULE THE WHOLE FILE IS BUILT ON. A beat is entered by an OUTCOME, never by
 * a button. `runStory` does not step through a list; it waits on whatever the
 * current beat is waiting for - a cutscene finishing, a dialogue ending, or a
 * puzzle being solved - and asks story/state.js what that means. There is no
 * code path anywhere that advances the story because a player clicked something,
 * which is why there are no "fake buttons that move the player to the next
 * scene" in it.
 */

import { EV, emit, on } from "./core/bus.js";
import * as platform from "./core/platform.js";
import * as loop from "./core/loop.js";
import { ORDER } from "./core/loop.js";
import { clamp01 } from "./core/maths.js";

import * as renderer from "./engine/renderer.js";
import * as lighting from "./engine/lighting.js";
import * as textures from "./engine/textures.js";

import * as roomScale from "./world/roomScale.js";
import * as roomManager from "./world/roomManager.js";
import * as stability from "./world/stability.js";
import { hintFor } from "./world/stages.js";
import * as content from "./world/roomContent.js";

import * as controller from "./player/controller.js";
import * as cameraRig from "./player/camera.js";
import * as hands from "./player/hands.js";
import * as input from "./player/input/index.js";

import * as interaction from "./interaction/manager.js";
import * as save from "./state/save.js";
import * as playclock from "./state/playclock.js";
import * as hud from "./ui/hud.js";
import * as screens from "./ui/screens.js";
import * as cinema from "./ui/cinema.js";
import * as i18n from "./i18n/strings.js";
import { audio } from "./audio/manager.js";
import * as debug from "./debug/panel.js";

/* --- the story layer ------------------------------------------------------ */
import * as story from "./story/state.js";
import { BEAT } from "./story/state.js";
import * as profile from "./story/profile.js";
import * as voice from "./story/voice.js";
import * as dialogue from "./story/dialogue.js";
import * as director from "./story/director.js";
import * as ghost from "./story/ghost.js";
import * as models from "./characters/models.js";
import * as horror from "./story/horror.js";
import * as script from "./story/script.js";
import * as carScene from "./scenes/car.js";
import * as flashbackScene from "./scenes/building.js";
import * as corridorScene from "./scenes/corridor.js";
import * as lobbyScene from "./scenes/lobby.js";

/** Tells the pre-module guard in index.html that the module graph arrived. */
window.__roomLoaded = true;

const MODE = { BOOT: "boot", TITLE: "title", PLAY: "play", CINEMA: "cinema", OVER: "over" };
let mode = MODE.BOOT;

let camera = null;
/** Set while a story beat is in flight, so nothing starts a second one. */
let storyRunning = false;
/**
 * Expansions earned while the walls were already moving.
 *
 * Spent one at a time as each transition settles - see the ROOM_CHANGED
 * handler - so the room always catches up with the story rather than falling
 * permanently behind it.
 */
let pendingExpansions = 0;
/**
 * Bumped whenever something takes the story away from `runStory` - quitting to
 * the title, or the debug handle jumping to a stage.
 *
 * The beat loop captures this on entry and bails if it changes, which is the
 * only way to interrupt a sequence that is sitting on an `await`: stopping the
 * dialogue resolves the await, and without this check the loop would simply
 * carry on into the NEXT beat and take the screen back off whoever just
 * claimed it.
 */
let storyEpoch = 0;

/* -------------------------------------------------------------------------- *
 * Boot
 * -------------------------------------------------------------------------- */

/**
 * Yield to the browser.
 *
 * Two frames, not one. The first lets the style change from the progress bar
 * be computed; the second lets it be painted. With a single frame the bar
 * updates in one jump at the end, because every write lands in the same
 * paint as the work that followed it.
 */
const yieldFrame = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

async function boot() {
  const p = platform.detect();

  if (!p.webgl2) {
    showFatal(
      "This game needs WebGL2. Try a different browser, or switch on hardware acceleration in your browser's settings.",
    );
    return;
  }

  // --- settings and language ------------------------------------------
  /*
   * Settings are read BEFORE the body is tagged. A stored quality setting
   * overrides the probe, and `applyBodyClasses` stamps the tier onto the
   * document for CSS to read - do it the other way round and the attribute
   * reports the probe's guess rather than the player's choice.
   */
  const settings = save.loadSettings();
  if (settings.quality !== "auto") platform.setTier(settings.quality);

  platform.applyBodyClasses();
  i18n.setLanguage(settings.language || i18n.detectLanguage());

  screens.init();
  cinema.init();
  hud.init();
  i18n.apply();

  voice.setLanguage(i18n.getLanguage());
  voice.setSettings({
    voices: settings.voices,
    voiceVolume: settings.voiceVolume,
    masterVolume: settings.masterVolume,
  });

  cinema.bootProgress(8, "stMeasure");
  await yieldFrame();

  // --- renderer ---------------------------------------------------------
  const canvas = document.getElementById("gl");
  renderer.init(canvas);
  camera = cameraRig.build();
  cameraRig.applySettings(settings);
  director.build();
  director.applySettings(settings);
  input.applySettings(settings);

  // --- surfaces ---------------------------------------------------------
  /*
   * Generate every procedural texture before anything asks for one.
   *
   * This is by far the most expensive part of boot. Left to happen lazily it
   * all lands inside `roomManager.build` as one unbroken block of JavaScript,
   * which on a slow machine is long enough that the browser offers to kill
   * the tab. Doing it here, with a yield between each surface, turns the same
   * work into a progress bar that moves.
   */
  await textures.prewarm((fraction, key) => {
    cinema.bootProgress(18 + Math.round(fraction * 26), key);
  });

  /*
   * Authored character models, if the player has put any on disk.
   *
   * Before the world is built, because `content.build` and every cutscene ask
   * for a character synchronously and must get the real one if it exists. A
   * missing file is the normal case and costs one HEAD request.
   */
  await models.preload((fraction, key) => {
    cinema.bootProgress(44 + Math.round(fraction * 6), key);
  });

  // --- world ------------------------------------------------------------
  // Cheap now: every map it asks for is already in the cache.
  const scene = roomManager.build(renderer.renderer);

  cinema.bootProgress(52, "stLight");
  await yieldFrame();

  renderer.buildComposer(scene, camera);
  renderer.installResizeHandler();

  cinema.bootProgress(66, "stProps");
  await yieldFrame();

  await content.build(scene);

  // The ghost lives in the room's own scene, so it is built with the room
  // rather than with a cutscene - it has to be able to appear in a corner while
  // the player is standing in front of a keypad.
  ghost.init(scene);

  // The viewmodel hand. Built after the scene exists because it parents
  // itself to the camera and adds the camera to the scene, which is what
  // makes a camera child render at all.
  hands.build(camera, scene);

  cinema.bootProgress(88, "stShaders");
  await yieldFrame();

  // --- warm the pipeline -------------------------------------------------
  controller.teleport(0, 0, roomScale.dims.hd - 0.9, 0);
  cameraRig.tick(0.016);
  renderer.precompile(scene, camera);

  await yieldFrame();

  // --- wire -------------------------------------------------------------
  input.init(canvas);
  debug.init({ roomScale, stability, controller, renderer, content });
  installSystems();
  installHooks();
  wireGameEvents();

  loop.installVisibilityHandlers();
  loop.start();

  cinema.bootReady();
}

function showFatal(message) {
  const err = document.getElementById("err");
  const msg = document.getElementById("errMsg");
  if (msg) msg.textContent = message;
  if (err) err.hidden = false;
}

/* -------------------------------------------------------------------------- *
 * Systems
 *
 * Registered in explicit order. Input must be sampled before the player
 * moves, the player must move before the camera follows, and the camera must
 * be final before the interaction raycast fires from it - otherwise
 * everything is one frame stale and the game feels loose without anyone
 * being able to say why.
 * -------------------------------------------------------------------------- */

function installSystems() {
  // --- fixed step: simulation ---
  loop.addFixed(() => input.sample(), ORDER.INPUT);
  loop.addFixed((dt) => {
    if (mode === MODE.PLAY) controller.tick(dt);
  }, ORDER.PLAYER);
  // roomScale stays in the fixed step: collision reads its dims every step,
  // so the dimensions must advance in lockstep with the player.
  loop.addFixed((dt) => roomScale.tick(dt), ORDER.WORLD);

  // --- frame: presentation ---
  loop.addFrame((dt) => {
    if (mode === MODE.PLAY) controller.applyLook();
    stability.tick(dt);
  }, ORDER.PLAYER);

  /*
   * Moving the walls, re-anchoring the furniture and re-fitting the light
   * are PRESENTATION, and they used to run in the fixed step.
   *
   * That was backwards in the worst possible way: the fixed step runs up to
   * five times per rendered frame, and it does so precisely when the frame
   * is already slow. A machine struggling through a room transition was
   * therefore doing the most expensive work in the transition five times per
   * frame instead of once - the exact definition of a death spiral.
   */
  loop.addFrame((dt) => {
    roomManager.tick(dt);
    content.tick(dt);

    // Something that casts a shadow is moving: refresh the map this frame.
    // Walking around does not qualify - the player casts nothing - which is
    // why the map can stay static almost all of the time.
    if (roomScale.isTransitioning() || interaction.isCarrying()) {
      renderer.requestShadowUpdate();
    }
  }, ORDER.WORLD);

  loop.addFrame((dt) => {
    const dread = stability.dread();

    // The room's own shake is handed to the camera rather than applied by
    // the room, so every source of shake goes through one place and the
    // player's "camera shake" setting can scale all of it.
    cameraRig.setExternalShake(roomScale.getShake());
    cameraRig.setBreath(
      Math.max(dread, controller.player.sprinting ? 0.35 : 0),
    );
    cameraRig.tick(dt);

    lighting.tick(dt, {
      stutter: roomScale.getStutter(),
      dread,
      stability: stability.get(),
    });

    // The frame physically closes in as the room shrinks and as stability
    // falls. Small rooms tighten it too, which is most of the claustrophobia.
    const small = clamp01(1 - (roomScale.dims.w * roomScale.dims.d) / 120);
    renderer.setVignette(
      clamp01(small * 0.55 + dread * 0.5),
      clamp01(dread * 0.8),
    );
  }, ORDER.CAMERA);

  /*
   * Interaction runs in the FRAME step, not the fixed step.
   *
   * Two reasons, both found the hard way. The raycast starts from the camera,
   * and the camera is updated in the frame step - running the cast in the
   * fixed step aimed it from where the camera was last frame. Worse, the
   * edge-triggered inputs are cleared once per frame: on a machine slow
   * enough to run several fixed steps per frame, a single tap of E was
   * consumed by every one of them, and one press of the clock advanced it
   * five minutes several times over.
   */
  loop.addFrame((dt) => {
    if (mode === MODE.PLAY) interaction.tick(dt);

    // The hand reads what interaction decided this frame, so it runs
    // immediately after: reaching out one frame late is visible.
    hands.tick(dt, {
      focused: !!interaction.getFocused(),
      carrying: interaction.isCarrying(),
      interacting: input.input.interactPressed,
      speed: controller.player.speed,
      crouching: controller.player.crouching,
      sprinting: controller.player.sprinting,
    });
  }, ORDER.CAMERA + 1);

  /* ---------------------------------------------------------------------- *
   * The story layer
   *
   * One frame hook, after the camera and before the UI. The order inside it
   * matters: the dialogue decides what is being said this frame, the scenes
   * animate the characters that are saying it, and the ghost and the camera
   * follow - so nothing in a cutscene is ever a frame behind the line it is
   * reacting to.
   * ---------------------------------------------------------------------- */
  loop.addFrame((dt) => {
    dialogue.tick(dt);
    carScene.tick(dt);
    flashbackScene.tick(dt);
    corridorScene.tick(dt);
    lobbyScene.tick(dt);
    // The director only drives during a cutscene; the gameplay camera is
    // cameraRig's. Ticking it unconditionally is harmless and means a shot that
    // is still settling when control returns finishes settling.
    director.tick(dt);
    ghost.tick(dt, mode === MODE.CINEMA ? director.camera : camera);
    if (mode === MODE.PLAY) horror.tick(dt);
    cinema.tick(dt);
  }, ORDER.CAMERA + 2);

  loop.addFrame((dt) => {
    /*
     * Spend a queued expansion as soon as the room is free to take one.
     *
     * Driven from the frame loop rather than from the ROOM_CHANGED event,
     * because the event version depended on the order two listeners ran in and
     * quietly lost an expansion when a solve landed inside the settle beat.
     * Polling a counter is unglamorous and it cannot get this wrong: if the
     * room owes the story a state, it grows the moment it can.
     */
    if (pendingExpansions > 0 && roomScale.canExpand() && mode !== MODE.TITLE) {
      pendingExpansions--;
      roomScale.expand();
    }

    // One gentle nudge if the player has been in a stage a while and has
    // not touched anything that counts. Fires once per stage, never again.
    if (mode === MODE.PLAY && !nudged && !roomScale.isTransitioning()) {
      idleInStage += dt;
      if (idleInStage > 75) {
        nudged = true;
        hud.subtitle(i18n.t("hintNudge"), 5);
      }
    }

    playclock.tick(dt);
    audio.tick(dt);
    hud.tick(dt);
    debug.tick(dt);
  }, ORDER.UI);

  loop.addFrame((dt) => {
    renderer.sampleFrame(dt * 1000);
    renderer.render(dt);
    // Last of all: everything above has had its chance to read the frame's
    // input, so the edges can now be cleared.
    input.endFrame();
  }, ORDER.RENDER);

  controller.onFootstep((strength) => {
    audio.footstep(story.act() === 1 ? "concrete" : "wood", strength);
    cameraRig.addTrauma(strength * 0.015);
  });
}

/* -------------------------------------------------------------------------- *
 * Screens
 * -------------------------------------------------------------------------- */

function installHooks() {
  cinema.setHooks({
    onBegin: () => {
      /*
       * The first gesture.
       *
       * It is the only chance to create an AudioContext that is not born
       * suspended AND the only chance to prime the speech synthesiser, so both
       * are spent here. A title screen reached without this is a game that is
       * silent until the player happens to click something.
       */
      audio.init();
      voice.init();
      enterTitle();
    },
    onPlay: () => startGame({ fresh: true }),
    onContinue: () => startGame({ fresh: false }),
    onSettings: () => screens.openOverlayById("settings"),
    onStages: () => screens.openOverlayById("stages"),
    onHow: () => screens.openOverlayById("howto"),
    onExit: () => leave(),
  });

  screens.setHooks({
    onResume: () => resumeGame(),
    onQuitToMenu: () => enterTitle(),
    onRetry: () => startGame({ fresh: false, checkpoint: true }),
    onLoadCheckpoint: () => startGame({ fresh: false, checkpoint: true }),
  });

  // Any pointer down anywhere is also an audio unlock attempt, because the
  // studio card can be dismissed by a key and some browsers want a pointer.
  document.addEventListener(
    "pointerdown",
    () => {
      audio.init();
      voice.init();
    },
    { once: true },
  );
}

/**
 * EXIT.
 *
 * In a browser there is no such thing, so this does the most useful real thing
 * available, in order of preference: go back to the page that embedded the game,
 * go back in history, or close the tab if the window was opened by a script.
 * It never silently does nothing, which is what a disabled-looking EXIT button
 * would be.
 */
function leave() {
  audio.suspend();
  voice.cancel();
  try {
    if (window.parent && window.parent !== window) {
      // Embedded in the site's own player. Tell the page, and let it decide -
      // it is the thing with a stop button.
      window.parent.postMessage({ type: "withroom:exit" }, "*");
      return;
    }
  } catch {
    /* Cross-origin parent. Fall through. */
  }
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  // Only works for a window JavaScript opened, which is why it is last.
  window.close();
  // If it is still here, go to the game's own page on the site.
  window.setTimeout(() => {
    window.location.href = "/withroom";
  }, 150);
}

function wireGameEvents() {
  on(EV.SETTINGS_CHANGED, ({ settings, patch }) => {
    cameraRig.applySettings(settings);
    director.applySettings(settings);
    input.applySettings(settings);
    audio.setVolumes({
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
    });
    voice.setSettings({
      voices: settings.voices,
      voiceVolume: settings.voiceVolume,
      masterVolume: settings.masterVolume,
    });
    document.body.classList.toggle("no-crosshair", !settings.crosshair);

    /*
     * Rebuild the post chain ONLY when the quality setting itself changed.
     *
     * This used to fire on any settings change at all, so dragging the
     * volume slider tore down and rebuilt the entire composer - render
     * targets, bloom mip chain, SMAA - on every single input event. One
     * drag was dozens of full pipeline rebuilds and the game locked solid.
     */
    if (patch && "quality" in patch) {
      if (settings.quality !== "auto") platform.setTier(settings.quality);
      renderer.buildComposer(roomManager.scene, camera);
      renderer.applyShadowSettings();
      lighting.applyQuality();
    }
  });

  on(EV.LANGUAGE_CHANGED, ({ lang }) => {
    save.updateSettings({ language: lang });
    voice.setLanguage(lang);
    hud.relabel();
    cinema.relabel();
  });

  on(EV.GAME_PAUSE, ({ source }) => {
    // The run clock stops for every pause, including the automatic ones: a tab
    // in the background is not time spent in the room.
    playclock.stop();
    if (mode !== MODE.PLAY) return;
    input.releaseAll();
    // A pause from the pointer lock being released is the player pressing
    // Escape, so it opens the menu. An automatic one - tab hidden, phone
    // locked - must not, or they come back to a menu they did not ask for.
    if (source === "pointerlock") screens.showPause(true);
  });

  on(EV.GAME_RESUME, () => {
    if (mode === MODE.PLAY || mode === MODE.CINEMA) playclock.start();
    if (mode === MODE.PLAY) input.requestLook();
  });

  /*
   * The one place a puzzle turns into an expansion.
   *
   * Puzzles never call `roomScale.expand()` themselves. They announce that they
   * were solved and this decides what that is worth, which is what keeps the
   * stability economy in a single readable place instead of spread across nine
   * puzzle files.
   *
   * WITHROOM adds one thing: some stages hold the expansion back, because a
   * cutscene owns the moment instead. story/state.js has that table.
   */
  on(EV.PUZZLE_SOLVED, ({ major, stage }) => {
    if (!major) {
      stability.solvedMinor();
      return;
    }

    stability.solvedMajor();
    hud.banner(i18n.t("solvedMsg"), i18n.t("solvedSub"));

    const expand = stage ? story.expandsOnSolve(stage) : true;
    if (expand) {
      /*
       * QUEUED, not dropped.
       *
       * `canExpand` is false while the walls are already moving, and the
       * obvious `if (canExpand) expand()` silently threw the expansion away -
       * after which the room was one state behind the story for the rest of the
       * run, with the stage counter and the dimensions both reading the wrong
       * thing.
       *
       * It is reachable: the placement puzzles check four times a second and
       * keep checking through a transition, so an object that lands on its mark
       * as the floor slides under it solves the stage mid-move.
       */
      if (roomScale.canExpand()) roomScale.expand();
      else pendingExpansions++;
    }

    // The story moves on the solve, not on the expansion: the walls take seven
    // seconds and the beat has to have changed before the player can touch
    // anything in the new room.
    if (stage) advanceAfterSolve(stage);
  });

  on(EV.PUZZLE_FAILED_MAJOR, () => stability.failedMajor());

  // Any deliberate action means the player is engaged, not stuck.
  on(EV.USED, () => {
    idleInStage = 0;
  });

  // Picking something up or putting it down moves a caster.
  on(EV.PICKED_UP, () => renderer.requestShadowUpdate());
  on(EV.DROPPED, () => renderer.requestShadowUpdate());
  on(EV.USED, () => renderer.requestShadowUpdate());

  on(EV.ROOM_EXPAND_START, () => {
    controller.setLocked(true);
    audio.rumble("expand");
  });
  on(EV.ROOM_SHRINK_START, () => {
    controller.setLocked(true);
    audio.rumble("shrink");
  });

  on(EV.ROOM_CHANGED, ({ state, immediate }) => {
    controller.setLocked(mode !== MODE.PLAY);
    renderer.requestShadowUpdate();
    resetHints();
    horror.roomChanged();

    audio.ambience(state.id, roomScale.dims);
    hud.setObjective(story.objectiveKey());
    if (!immediate) {
      save.flush();
      emit(EV.CHECKPOINT, { state });
    }
    // Reaching the smallest state with no stability left is the end.
    if (roomScale.atMinimum() && stability.isDead()) gameOver();
  });

  on(EV.STABILITY_CHANGED, ({ value, reason }) => {
    if (value <= 0 && mode === MODE.PLAY) {
      // Zero stability does not kill instantly: it collapses the room one
      // state at a time, and the player watches it happen.
      if (roomScale.canShrink()) roomScale.shrink();
      else gameOver();
    } else if (reason === "failedMajor" || reason === "failedCritical") {
      if (roomScale.canShrink()) roomScale.shrink();
      else gameOver();
    }
  });

  /*
   * The main door being opened is the one world event the story listens for.
   *
   * It is a cue rather than a direct call because the door must not know what
   * happens next: in act one opening it starts the flashback, and after that it
   * is simply a door.
   */
  on(EV.STORY_CUE, ({ cue }) => {
    if (cue !== "mainDoorOpened") return;
    content.openMainDoor();
    if (story.is(BEAT.FLASHBACK) && !storyRunning) runStory();
  });

  // The objective line follows the beat, so it is correct the instant the story
  // moves rather than on the next room change.
  on(EV.STORY_BEAT, () => {
    hud.setObjective(story.objectiveKey());
    content.onBeat(story.current());
  });
}

/* -------------------------------------------------------------------------- *
 * Hints
 *
 * The player must be able to finish a stage from inside the game, without
 * opening the Settings guide. H escalates: the goal first, then the first
 * step they have not done, then the one after that.
 * -------------------------------------------------------------------------- */

/** How many times help has been asked for in the current stage. */
let hintsAsked = 0;
/** Seconds in this stage with no flag set. */
let idleInStage = 0;
let nudged = false;

function resetHints() {
  hintsAsked = 0;
  idleInStage = 0;
  nudged = false;
}

function askHint() {
  if (mode !== MODE.PLAY) return;
  hintsAsked++;
  idleInStage = 0;
  nudged = true;

  const lang = i18n.getLanguage();
  const h = hintFor(roomScale.stateId(), hintsAsked, (flag) =>
    flag ? content.getFlag(flag) : false,
  );

  if (h.kind === "unbuilt") {
    hud.showHint(i18n.t("hintLabel"), i18n.t("hintUnbuilt"));
    return;
  }

  const label =
    h.kind === "goal"
      ? i18n.t("hintGoal")
      : h.last
        ? i18n.t("hintLast")
        : i18n.t("hintStep", h.tier - 1);

  hud.showHint(label, h.step[lang] ?? h.step.en);
  audio.ui("click");
}

/* -------------------------------------------------------------------------- *
 * Modes
 * -------------------------------------------------------------------------- */

/** The title screen, over a live slowly-drifting view of the room. */
function enterTitle() {
  mode = MODE.TITLE;
  storyEpoch++;
  storyRunning = false;

  dialogue.stop();
  director.stop();
  horror.stop();
  playclock.stop();
  ghost.hide();
  cinema.clearAll();
  audio.bedsOff(0.6);

  loop.resume();
  input.releaseLook();
  input.releaseAll();
  hud.show(false);
  hands.setVisible(false);
  screens.closeOverlay("pause");
  screens.closeOverlay("gameover");

  story.enter(BEAT.TITLE);
  cinema.showTitle();

  /*
   * The lobby, not the room.
   *
   * The title screen used to be the menu over a drifting view of the empty
   * cell, which told a new player nothing at all. It is now its own scene with
   * the three of them standing in it - see scenes/lobby.js - so the first thing
   * anybody sees is the cast and a lantern.
   */
  lobbyScene.show();

  // The player is frozen behind it either way.
  controller.setLocked(true);
  audio.ambience(0, { w: 24, d: 24, h: 8 });
}

/**
 * Start or continue a game.
 *
 * `fresh` wipes everything and runs the story from the name gate. Without it the
 * save is loaded and the story resumes at the beat it was in - which, because
 * `story.deserialise` refuses to restore a cutscene, is always a playable one.
 */
function startGame({ fresh, checkpoint = false }) {
  cinema.hideTitle();
  screens.closeOverlay("gameover");

  if (fresh) {
    save.clearSave();
    stability.reset();
    roomScale.reset();
    content.reset();
    profile.reset();
    story.reset();
    playclock.reset();
    pendingExpansions = 0;
  } else {
    const data = save.loadGame();
    if (data) {
      roomScale.deserialise(data.room);
      stability.deserialise(data.stability);
      content.deserialise(data.content);
      profile.deserialise(data.profile);
      story.deserialise(data.story);
      playclock.deserialise(data.playclock);
      if (!checkpoint) controller.deserialise(data.player);
    }
  }

  if (fresh || checkpoint) spawnInRoom();

  resetHints();
  // The run clock starts here and runs through every cutscene: the drive and
  // the flashback are part of how long the player was in there.
  playclock.start();
  save.startAutosave(collectSave);
  emit(EV.GAME_START, {});

  // Fullscreen and the orientation lock must be requested from inside the
  // click that started the game, which is why this is here and not in a
  // listener somewhere downstream.
  screens.goFullscreen();
  loop.resume();

  runStory();
}

/** Put the player on their feet in the middle of the room, facing the door. */
function spawnInRoom() {
  controller.teleport(0, 0, roomScale.dims.hd - 1.1, 0);
}

/** Hand the room, the HUD and the controls back to the player. */
function enterPlay() {
  mode = MODE.PLAY;
  lobbyScene.hide();
  renderer.setView(roomManager.scene, camera);
  controller.setLocked(false);
  hud.show(true);
  hud.setHintAffordance(true);
  hud.setObjective(story.objectiveKey());
  hands.setVisible(true);
  cinema.skipHint(false);
  // Anything a cutscene left mid-line goes now. Without this a stage entered
  // while the previous scene's dialogue was still running keeps that line on
  // screen - and the one it keeps is always the last thing said before a cut.
  cinema.clearSay();
  dialogue.stop();
  cinema.letterbox(false, 0.9);
  horror.start();
  audio.init();
  audio.ambience(roomScale.stateId(), roomScale.dims);
  input.requestLook();
}

/** Take the room away and give the screen to the director. */
function enterCinema() {
  mode = MODE.CINEMA;
  lobbyScene.hide();
  input.releaseLook();
  input.releaseAll();
  controller.setLocked(true);
  horror.stop();
  hud.show(false);
  hands.setVisible(false);
  interaction.drop(false);
}

function resumeGame() {
  if (mode !== MODE.PLAY) return;
  loop.resume();
  input.requestLook();
}

function gameOver() {
  if (mode === MODE.OVER) return;
  mode = MODE.OVER;

  controller.setLocked(true);
  input.releaseLook();
  input.releaseAll();
  dialogue.stop();
  horror.stop();
  playclock.stop();
  audio.stinger("gameover");
  save.stopAutosave();

  // Let the collapse play out before the card appears. The sequence is the
  // point; cutting straight to a menu throws away the only moment the game
  // has been building toward.
  window.setTimeout(() => {
    hud.show(false);
    screens.showGameOver({ checkpoint: 1 });
  }, 2600);
}

function collectSave() {
  return {
    room: roomScale.serialise(),
    stability: stability.serialise(),
    player: controller.serialise(),
    content: content.serialise(),
    profile: profile.serialise(),
    story: story.serialise(),
    playclock: playclock.serialise(),
  };
}

/* ========================================================================== *
 * THE STORY
 *
 * Each beat is one async function. `runStory` walks whatever beat the story is
 * in until it reaches one that waits for the player, and then stops - the next
 * call comes from the thing the player did.
 * ========================================================================== */

async function runStory() {
  if (storyRunning) return;
  storyRunning = true;
  const epoch = storyEpoch;

  try {
    // A loop, not a chain: a beat that resolves into another non-playable beat
    // - the flashback into the reveal, the ending into the title - plays
    // straight through without anything having to know the sequence.
    for (let guard = 0; guard < 24; guard++) {
      // Somebody else has taken the story. Leave quietly.
      if (epoch !== storyEpoch) return;

      const beat = story.current();

      if (story.isPlayable()) {
        enterPlay();
        break;
      }

      /*
       * Play the beat, THEN announce that it finished - and only if this loop
       * is still the one in charge.
       *
       * The beats used to call `story.cutsceneDone` themselves, from their own
       * last line. That is one line too late to be interruptible: stopping a
       * cutscene resolves the promise it is sitting on, its remaining lines run
       * as a microtask, and the story moved on a beat AFTER the player had quit
       * to the title or jumped elsewhere. Doing it here, behind the epoch
       * check, means an interrupted cutscene finishes quietly and changes
       * nothing.
       */
      const done = (id) => {
        if (epoch === storyEpoch) story.cutsceneDone(id);
      };

      switch (beat) {
        case BEAT.TITLE:
          // A fresh game starts here and the name gate is the first thing.
          story.enter(BEAT.NAME);
          continue;

        case BEAT.NAME:
          await beatName();
          done(BEAT.NAME);
          continue;

        case BEAT.CAR:
          await beatCar();
          done(BEAT.CAR);
          continue;

        case BEAT.WAKE:
          await beatWake();
          done(BEAT.WAKE);
          continue;

        case BEAT.GHOST_INTRO:
          await beatGhostIntro();
          done(BEAT.GHOST_INTRO);
          continue;

        case BEAT.FLASHBACK:
          await beatFlashback();
          done(BEAT.FLASHBACK);
          continue;

        case BEAT.REVEAL:
          await beatReveal();
          done(BEAT.REVEAL);
          continue;

        case BEAT.FINAL_DOOR:
          await beatFinalDoor();
          done(BEAT.FINAL_DOOR);
          continue;

        case BEAT.ENDLESS:
          await beatEndless();
          done(BEAT.ENDLESS);
          continue;

        case BEAT.ENDING:
          await beatEnding();
          if (epoch !== storyEpoch) return;
          done(BEAT.ENDING);
          // The ending returns to the title screen, which is not a beat that
          // plays - it waits. Stop here rather than looping into NAME.
          enterTitle();
          return;

        default:
          // Unknown beat: put the player in the room rather than leaving them
          // staring at a black screen.
          enterPlay();
          return;
      }
    }
  } catch (err) {
    if (epoch !== storyEpoch) return;
    /*
     * A cutscene that throws must not strand the player.
     *
     * Everything in a beat is awaited, so one bad promise would otherwise leave
     * the game in MODE.CINEMA with no control and a black fade over it. The
     * recovery is deliberately crude and always works: clear the plates, give
     * the room back, and let them carry on from whatever beat the story reached.
     */
    console.error("[story] beat failed", err);
    cinema.clearAll();
    if (!story.isPlayable()) story.enter(BEAT.ACT1_1);
    enterPlay();
  } finally {
    if (epoch === storyEpoch) storyRunning = false;
  }
}

/** Solving a stage may lead to a cutscene. This is where that is noticed. */
function advanceAfterSolve(stage) {
  const next = story.solved(stage);
  if (!next) return;

  // A reveal line or two from the ghost, over the expansion, for the stages
  // that have one. It plays during the walls moving, which is exactly where a
  // few seconds of commentary belongs.
  const lines = script.solvedSequence(stage);
  if (lines) {
    window.setTimeout(() => {
      if (mode === MODE.PLAY || mode === MODE.CINEMA) {
        dialogue.play(lines, { id: `solved${stage}` });
      }
    }, 2200);
  }

  // Stage four leads to the flashback, but NOT yet: the player has to open the
  // door. Stage nine leads to the final door sequence, and that starts itself.
  if (next === BEAT.FINAL_DOOR && !storyRunning) {
    window.setTimeout(() => runStory(), 2600);
  }
}

/* -------------------------------------------------------------------------- *
 * Beat: the name
 * -------------------------------------------------------------------------- */

async function beatName() {
  enterCinema();
  cinema.cut(1);
  const name = await cinema.askName();
  emit(EV.NAME_SET, { name });
}

/* -------------------------------------------------------------------------- *
 * Beat: the car
 * -------------------------------------------------------------------------- */

async function beatCar() {
  enterCinema();
  cinema.cut(1);
  await carScene.play();
  carScene.dispose();
}

/* -------------------------------------------------------------------------- *
 * Beat: waking up
 *
 * Played in the ROOM's own scene rather than in a cutscene scene of its own,
 * which is the whole reason it works: the ceiling he wakes up under is the
 * actual ceiling of the actual room, the bed is the bed, and when control is
 * handed over there is no cut at all - the camera simply becomes his eyes.
 * -------------------------------------------------------------------------- */

async function beatWake() {
  enterCinema();

  // Put the player ON the bed, so when control is handed back they stand up
  // from where they were lying.
  const bed = content.bedPosition();
  controller.teleport(bed.x, 0, bed.z + 0.3, 0);

  director.takeOver(roomManager.scene);
  renderer.requestShadowUpdate();

  // Lying down: the camera is at mattress height, looking at the ceiling.
  director.set([bed.x, 0.62, bed.z], [bed.x, roomScale.dims.h, bed.z + 0.4], { fov: 62 });
  cinema.letterbox(true, 1.2);
  cinema.cut(1);

  audio.breathing(0.8);
  audio.heartbeat(0.5);
  audio.ambience(roomScale.stateId(), roomScale.dims);

  /*
   * Eyelids.
   *
   * Three partial fades rather than one: the screen opens to a third, closes,
   * opens to two thirds, closes, then opens. It is the oldest trick there is for
   * waking up and it still works better than anything a shader can do, because
   * what it imitates is not blur - it is the EFFORT of opening an eye.
   */
  await cinema.fade(0.7, 1.4);
  await cinema.fade(0.95, 0.5);
  await cinema.fade(0.35, 1.2);
  await cinema.fade(0.8, 0.6);
  await cinema.fade(0, 2.2);

  // Sitting up. One slow move from lying to sitting, with the head turning to
  // take in the room - and the dialogue runs across it.
  const shots = [
    {
      pos: [bed.x, 0.62, bed.z], to: [bed.x, 1.05, bed.z + 0.35],
      look: [bed.x, roomScale.dims.h, bed.z + 0.6], lookTo: [bed.x + 0.6, 1.2, bed.z + 2.4],
      fov: 62, fovTo: 70, dur: 7, hold: 0.6, ease: "sineInOut", handheld: 1.6,
    },
    {
      pos: [bed.x, 1.05, bed.z + 0.35], to: [bed.x + 0.1, 1.15, bed.z + 0.5],
      look: [bed.x + 0.6, 1.2, bed.z + 2.4], lookTo: [-roomScale.dims.hw, 1.4, bed.z + 1],
      fov: 70, dur: 6, hold: 0.4, ease: "sineInOut", handheld: 1.8,
    },
    {
      pos: [bed.x + 0.1, 1.15, bed.z + 0.5], to: [bed.x + 0.1, 1.3, bed.z + 0.8],
      look: [-roomScale.dims.hw, 1.4, bed.z + 1], lookTo: [0, 1.1, roomScale.dims.hd],
      fov: 70, fovTo: 66, dur: 7, hold: 1, ease: "sineInOut", handheld: 1.4,
    },
  ];

  await Promise.all([
    director.play(shots),
    dialogue.play(script.WAKE, {
      id: "WAKE",
      onCue: (cue) => {
        if (cue === "sitUp") {
          audio.play("woodTap", { gain: 0.5 });
          director.addTrauma(0.2);
        }
        if (cue === "callOut") audio.breathing(1);
        if (cue === "lookAround") audio.play("dustFall", { gain: 0.6 });
      },
    }),
  ]);

  audio.breathing(0.25);
  audio.heartbeat(0);
}

/* -------------------------------------------------------------------------- *
 * Beat: the ghost's introduction
 *
 * In the room, in the dark, with the player in first person and unable to move.
 * Not a cutscene camera: the point of the scene is that it is happening TO them,
 * in the place they are standing, and a crane shot would make it a film.
 * -------------------------------------------------------------------------- */

async function beatGhostIntro() {
  enterCinema();
  renderer.setView(roomManager.scene, camera);
  // Standing, in the middle of the room, facing the door - which is where the
  // wake-up left them.
  controller.setLocked(true);
  cameraRig.tick(0.016);
  cinema.letterbox(true, 1);
  await cinema.fade(0, 0.8);

  await dialogue.play(script.GHOST_INTRO, {
    id: "GHOST_INTRO",
    onCue: (cue) => {
      switch (cue) {
        case "lightsOut":
          audio.play("switchOff", { gain: 1.2 });
          lighting.setBlackout(1);
          audio.ambience(roomScale.stateId(), roomScale.dims);
          break;
        case "ghostNear":
          ghost.behind({ level: 0.75, seconds: 3.5 });
          cinema.glitch(0.3, 1.2);
          break;
        case "countOne":
        case "countTwo":
        case "countThree":
          // One knock on the door per count. The room is counting them out.
          audio.play("doorKnock", { gain: 0.7 });
          cameraRig.addTrauma(0.12);
          break;
        case "laugh":
          cinema.glitch(0.5, 2);
          cameraRig.addTrauma(0.25);
          break;
        case "lightsBack":
          lighting.setBlackout(0);
          audio.play("switchOn", { gain: 1.1 });
          ghost.hide();
          break;
        default:
          break;
      }
    },
  });

  lighting.setBlackout(0);
}

/* -------------------------------------------------------------------------- *
 * Beat: the flashback
 * -------------------------------------------------------------------------- */

async function beatFlashback() {
  enterCinema();
  await flashbackScene.play();
  flashbackScene.dispose();

  /*
   * The expansion that stage four held back.
   *
   * It fires here, as the player comes out of the flashback, so the walls
   * travelling reads as the building opening up in front of them rather than as
   * noise on top of the biggest story beat in act one.
   */
  renderer.setView(roomManager.scene, camera);
  // Queued like any other, so it cannot be lost if the room happens to be
  // moving when the flashback ends.
  pendingExpansions++;
}

/* -------------------------------------------------------------------------- *
 * Beat: the ghost uses his name
 * -------------------------------------------------------------------------- */

async function beatReveal() {
  enterCinema();
  renderer.setView(roomManager.scene, camera);
  spawnInRoom();
  cameraRig.tick(0.016);

  cinema.letterbox(true, 1.2);
  await cinema.fade(0, 2.4);
  audio.breathing(0.7);

  await dialogue.play(script.REVEAL, {
    id: "REVEAL",
    onCue: (cue) => {
      switch (cue) {
        case "silence":
          // Everything stops. The ambience is ducked to nothing and the room
          // tone comes back under the first line.
          audio.ambience(roomScale.stateId(), roomScale.dims);
          break;
        case "behind":
          ghost.behind({ level: 0.8, seconds: 4 });
          cinema.glitch(0.25, 1.4);
          break;
        case "closer":
          cameraRig.addTrauma(0.18);
          break;
        case "herVoice":
          audio.play("distantScream", { gain: 0.45 });
          break;
        case "doors":
          audio.play("doorKnock", { gain: 0.6 });
          break;
        case "laugh":
          cinema.glitch(0.4, 1.8);
          break;
        case "stand":
          ghost.hide();
          break;
        default:
          break;
      }
    },
  });

  audio.breathing(0.3);
}

/* -------------------------------------------------------------------------- *
 * Beat: the final door
 *
 * Her door, in the room, in first person - the key going in and the handle
 * turning. Then the corridor takes over.
 * -------------------------------------------------------------------------- */

async function beatFinalDoor() {
  enterCinema();
  renderer.setView(roomManager.scene, camera);

  cinema.letterbox(true, 1.2);
  cinema.skipHint(true);

  await dialogue.play(script.FINAL_DOOR, {
    id: "FINAL_DOOR",
    onCue: (cue) => {
      switch (cue) {
        case "approach":
          audio.breathing(0.9);
          break;
        case "insert":
          audio.play("keyInsert");
          break;
        case "turn":
          audio.play("lockTurn");
          cameraRig.addTrauma(0.2);
          break;
        case "open":
          audio.play("doorOpen");
          break;
        case "step":
          audio.footstep("concrete", 0.6);
          break;
        default:
          break;
      }
    },
  });

  await cinema.fade(1, 1.6);
  audio.breathing(0.2);
}

/* -------------------------------------------------------------------------- *
 * Beat: the corridor, and the end
 * -------------------------------------------------------------------------- */

async function beatEndless() {
  enterCinema();
  await corridorScene.play();
}

async function beatEnding() {
  // The corridor scene has already shown TO BE CONTINUED and faded out; this
  // beat is the beat of black afterwards, and then the save is finished with.
  playclock.stop();
  corridorScene.dispose();
  save.stopAutosave();
  save.clearSave();
  await new Promise((r) => window.setTimeout(r, 1200));
}

/* -------------------------------------------------------------------------- *
 * Global input that is not gameplay
 * -------------------------------------------------------------------------- */

/** The pending "held Escape" skip during a cutscene. 0 when not held. */
let skipTimer = 0;

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyH" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    askHint();
    return;
  }

  /* --- skipping a cutscene ------------------------------------------------ *
   * Space advances one line, which is reading behaviour and must not cost the
   * scene. Escape HELD abandons it, which is a different intention and is
   * deliberately harder to do by accident.
   */
  if (mode === MODE.CINEMA) {
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      dialogue.skipLine();
      return;
    }
    if (e.code === "Escape" && !e.repeat) {
      skipTimer = window.setTimeout(() => {
        dialogue.skipAll();
        director.stop();
      }, 700);
      return;
    }
    return;
  }

  if (e.code !== "Escape") return;
  if (mode !== MODE.PLAY) return;
  const open = screens.currentOverlay();
  if (open) {
    screens.closeOverlay(open);
    if (open !== "pause") screens.showPause(true);
  } else {
    loop.pause(false);
    screens.showPause(true);
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Escape" && skipTimer) {
    window.clearTimeout(skipTimer);
    skipTimer = 0;
  }
});

/** On touch, a tap anywhere during a cutscene advances the line. */
window.addEventListener("pointerdown", (e) => {
  if (mode !== MODE.CINEMA) return;
  // Not a tap on the name field or its button.
  if (e.target?.closest?.("#namegate")) return;
  dialogue.skipLine();
});

// The pause button on the touch HUD.
document.getElementById("btnPause")?.addEventListener("click", () => {
  if (mode !== MODE.PLAY) return;
  loop.pause(false);
  screens.showPause(true);
});

window.addEventListener("resize", () => {
  cameraRig.resize();
  director.resize();
});

/* -------------------------------------------------------------------------- *
 * Go
 * -------------------------------------------------------------------------- */

boot().catch((err) => {
  console.error(err);
  showFatal(err?.message ?? String(err));
});

/**
 * Debug handle.
 *
 * Deliberately shipped rather than stripped: it costs nothing, and being able
 * to ask a player to type `__room.setState(4)` in the console is worth more
 * than the few bytes it saves to remove it.
 */
window.__room = {
  loop,
  hud,
  roomManager,
  roomScale,
  stability,
  controller,
  renderer,
  content,
  story,
  profile,
  voice,
  models,
  ghost,
  horror,
  director,
  interaction,
  /** The scene currently being rendered - the room, or whichever cutscene. */
  /** Whatever the renderer is actually drawing - room, lobby or cutscene. */
  scene: () => renderer.currentView().scene,
  expand: () => roomScale.expand(),
  shrink: () => roomScale.shrink(),
  setState: (i) => roomScale.setStateImmediate(i),
  setStability: (v) => stability.set(v),
  info: () => renderer.info(),
  mode: () => mode,
  beat: () => story.current(),
  /** Expansions the room still owes the story. */
  pending: () => pendingExpansions,
  hint: askHint,
  /**
   * Jump to a stage: sets the room state and the story beat together.
   *
   * Stops whatever the story is awaiting first. Without that, jumping out of a
   * cutscene leaves `runStory` holding its lock on a promise that will never
   * settle, and every later beat is silently ignored - which looked exactly
   * like the ending being broken when it was the debug jump that broke it.
   */
  stage: (n) => {
    const row = story.rowForStage(n);
    if (!row) return;
    storyEpoch++;
    storyRunning = false;
    dialogue.stop();
    director.stop();
    roomScale.setStateImmediate(row.state);
    story.enter(row.beat);
    content.onBeat(row.beat);
    enterPlay();
  },
  /** Play a cutscene on demand, for checking one without playing to it. */
  cutscene: (name) => {
    storyEpoch++;
    storyRunning = false;
    dialogue.stop();
    director.stop();
    story.enter(BEAT[name] ?? name);
    runStory();
  },
  voices: () => voice.castList(),
};
