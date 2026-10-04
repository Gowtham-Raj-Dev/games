/**
 * WITHROOM - central configuration.
 *
 * Every tunable number in the game lives here. Nothing else in the codebase
 * should contain a magic number a designer might want to change: if you find
 * yourself typing a literal into a system, it belongs in this file.
 *
 * The rule exists because the room is the health bar. Stability costs, room
 * dimensions and transition timings have to be balanced against each other,
 * and that is only possible when they can be read side by side.
 */

/* ========================================================================== *
 * ROOM STATES
 *
 * The room never scales freely - it steps between authored states. Each one is
 * a hand-set size rather than a multiple of the last, so widening state 4 does
 * not drag every later state along with it.
 *
 * w = width (x), d = depth (z), h = ceiling height (y), all in metres.
 * tile    floor tile size for that state. The first room is floorboards, the
 *         city is pavement slabs; a 4 m room tiled at 4 m reads as a flat
 *         plane rather than a floor.
 * fogFar  visibility in metres. Hand-set per state so the far wall stays
 *         legible at 4 m and mysterious at 250 m.
 * ========================================================================== */

export const ROOM_STATES = [
  // 0 - THE CELL. Arm's reach in every direction. Deliberately oppressive.
  { id: 0, name: "cell",     w: 4,   d: 4,   h: 2.5, tile: 0.5, fogFar: 14,  chapter: 1 },
  // 1 - First expansion. Four paces instead of two.
  { id: 1, name: "chamber",  w: 6,   d: 6,   h: 2.8, tile: 0.6, fogFar: 20,  chapter: 1 },
  // 2 - Stops being square. The first hint of a real building.
  { id: 2, name: "room",     w: 10,  d: 8,   h: 3.1, tile: 0.8, fogFar: 30,  chapter: 1 },
  // 3 - Chapter 2 opens. Furniture stops touching the walls.
  { id: 3, name: "hall",     w: 15,  d: 12,  h: 3.6, tile: 1.0, fogFar: 44,  chapter: 2 },
  // 4 - House scale. Footsteps gain a tail.
  { id: 4, name: "house",    w: 25,  d: 18,  h: 4.4, tile: 1.2, fogFar: 70,  chapter: 2 },
  // 5 - The ceiling is past any ladder in the room.
  { id: 5, name: "floor",    w: 40,  d: 30,  h: 5.5, tile: 1.5, fogFar: 110, chapter: 3 },
  // 6 - Building scale. Fog starts doing real work here.
  { id: 6, name: "building", w: 70,  d: 50,  h: 7.5, tile: 2.0, fogFar: 180, chapter: 3 },
  // 7 - The far wall is no longer legible as a wall.
  { id: 7, name: "district", w: 120, d: 80,  h: 11,  tile: 3.0, fogFar: 300, chapter: 4 },
  // 8 - City. The original 4x4 room is a speck somewhere inside it.
  { id: 8, name: "city",     w: 250, d: 150, h: 20,  tile: 4.0, fogFar: 520, chapter: 4 },
];

export const MIN_STATE = 0;
export const MAX_STATE = ROOM_STATES.length - 1;

/* ========================================================================== *
 * STABILITY
 *
 * Stability replaces a health bar. Walking around never spends it - only major
 * puzzle outcomes move it, which is what keeps the number meaningful.
 * ========================================================================== */

export const STABILITY = {
  start: 100,
  max: 100,
  min: 0,

  /** A major puzzle solved cleanly. */
  gainMajor: 10,
  /** A minor puzzle still nudges it up, so exploring is never wasted. */
  gainMinor: 3,
  /** A recovery puzzle after a shrink. Larger, because it has to feel like relief. */
  gainRecovery: 15,

  /** Major failure. The room shrinks with it. */
  lossMajor: 15,
  /** A critical mechanism: the timer running out, the wrong lever thrown. */
  lossCritical: 20,
  /**
   * Minor failure costs nothing. Pressing the wrong button has to stay free or
   * players stop experimenting, and a puzzle game nobody experiments in is a
   * puzzle game nobody finishes.
   */
  lossMinor: 0,

  /**
   * Named bands, ordered high to low. The HUD, the light rig and the audio mix
   * all read from this one list, so "critical" looks, sounds and reads as the
   * same moment everywhere in the game.
   */
  bands: [
    { at: 80, key: "stable",    tint: 0x8fb4a6 },
    { at: 60, key: "steady",    tint: 0x9fae7e },
    { at: 40, key: "warning",   tint: 0xc9a227 },
    { at: 20, key: "unstable",  tint: 0xd07a28 },
    { at: 10, key: "critical",  tint: 0xc4452d },
    { at: 0,  key: "emergency", tint: 0x8e1f16 },
  ],
};

/** The band object for a given stability value. Never returns undefined. */
export function stabilityBand(value) {
  const bands = STABILITY.bands;
  for (let i = 0; i < bands.length; i++) {
    if (value >= bands[i].at) return bands[i];
  }
  return bands[bands.length - 1];
}

/* ========================================================================== *
 * TRANSITIONS
 *
 * Expansion is a reward and shrinking is a punishment, so they are not one
 * animation played in both directions. Expansion is slower, smoother, and ends
 * in silence. Shrinking is faster, lurches once, and ends with arrival.
 * ========================================================================== */

export const EXPANSION = {
  /** Seconds of wall travel, before the beats below are layered over it. */
  duration: 7.0,
  /** Tremor before anything moves, so the player gets to brace. */
  anticipation: 1.6,
  /** Stillness after the walls stop, before control comes back. */
  settle: 1.4,
  /** Peak camera shake in metres. Expansion is awe, not panic. */
  shake: 0.045,
  /** Dust motes released during travel. Scaled down on the low tier. */
  dust: 420,
  /** Slow start, long glide, soft landing. */
  ease: "expoInOut",
};

export const SHRINK = {
  duration: 4.2,
  anticipation: 0.9,
  settle: 1.0,
  /** Markedly more violent than expansion. */
  shake: 0.11,
  dust: 260,
  /** The walls lunge, then crowd in slowly. The lunge is the scare. */
  ease: "backIn",
};

/* ========================================================================== *
 * PLAYER
 * ========================================================================== */

export const PLAYER = {
  eyeHeight: 1.68,
  crouchEyeHeight: 0.95,
  /** Collision capsule radius. Also the closest the player can get to a wall. */
  radius: 0.3,

  walkSpeed: 2.6,
  sprintSpeed: 4.6,
  crouchSpeed: 1.25,

  /** How fast full speed is reached. Low values feel like ice. */
  accel: 34,
  /** Deceleration once input stops. */
  damping: 18,
  /** Air control is deliberately poor. This is not a platformer. */
  airControl: 0.18,

  gravity: -19.6,
  /** Phase 1 has no jump: the room is the obstacle, not the terrain. */
  jumpSpeed: 0,
  stepHeight: 0.32,
  /** Crouch/stand blend, in seconds. */
  crouchTime: 0.18,

  /** Head bob. Subtle enough to read as breathing, not as a camera bug. */
  bobSpeed: 9.2,
  bobAmount: 0.028,
  bobSprintScale: 1.5,

  /** Radians per pixel of mouse movement, before the player's sensitivity. */
  lookSpeed: 0.0022,
  /** Degrees per second at full stick deflection on touch. */
  touchLookSpeed: 150,
  pitchLimit: Math.PI / 2 - 0.02,

  fov: 72,
  /** Degrees the view widens at a sprint. */
  sprintFov: 6,
  fovLerp: 5.5,
};

/* ========================================================================== *
 * INTERACTION
 * ========================================================================== */

export const INTERACT = {
  /** Reach, in metres. Short, so the player has to walk to things. */
  range: 2.4,
  /** Touch gets a little more: aiming with a thumb is harder. */
  touchRange: 3.0,
  /** Radius of the focus sphere cast, so small props are not fiddly to hit. */
  aimAssist: 0.07,

  /** Where a carried object floats, relative to the camera. */
  carryDistance: 0.85,
  carryHeight: -0.12,
  /** Spring that holds a carried object. Stiff enough to feel gripped. */
  carryStiffness: 160,
  carryDamping: 18,
  /** Dropped if something shoves it this far from the hold point. */
  carryBreak: 1.6,
  /** Inspect rotation, radians per pixel. */
  rotateSpeed: 0.009,
  /** Speed a carried object leaves at when thrown. */
  throwSpeed: 4.5,
};

/* ========================================================================== *
 * SIMULATION AND RENDERING
 * ========================================================================== */

export const WORLD = {
  /** Fixed physics step. The renderer runs free; the simulation does not. */
  fixedStep: 1 / 60,
  /**
   * Never simulate more than this in one frame. Without the clamp a tab left
   * in the background returns with a two-minute delta and fires the player
   * through a wall.
   */
  maxStep: 0.1,
  maxSubSteps: 5,

  fogNear: 1.2,
  fogColor: 0x0a0b0d,

  /** A tight near plane matters when the walls are 2 m away. */
  near: 0.05,
  far: 800,
};

/* ========================================================================== *
 * SAVE
 * ========================================================================== */

export const SAVE = {
  /**
   * Bump when the saved shape changes; older saves are migrated, not dropped.
   *
   * Version 2 is WITHROOM: it adds the story beat, the player's name and the
   * nine puzzles' own state. A version 1 save - from the build before the story
   * existed - has no beat and no name, and there is nowhere sensible to put a
   * player who is halfway through a stage that has been redesigned. `migrate`
   * therefore refuses it, which the game treats as "no save" rather than as an
   * error. The key is new as well, so an abandoned v1 save is not left shadowing
   * a v2 one under the same name.
   */
  version: 2,
  key: "withroom.save.v2",
  settingsKey: "withroom.settings.v1",
  /** Seconds between autosaves. Also saved at checkpoints and on tab hide. */
  autosaveInterval: 30,
};

/* ========================================================================== *
 * DEFAULT SETTINGS
 *
 * What a new player gets. The settings menu overwrites and persists these.
 * `quality: "auto"` resolves to a tier at boot from the device probe.
 * ========================================================================== */

export const DEFAULT_SETTINGS = {
  masterVolume: 0.9,
  musicVolume: 0.5,
  sfxVolume: 1.0,
  /**
   * Spoken dialogue, through the browser's speech synthesiser.
   *
   * On by default, because the game is built around a ghost that says the
   * player's name out loud and the whole first act lands differently without it.
   * Its own fader because speech output is not in the Web Audio graph and the
   * master slider has to be applied to it by hand - see story/voice.js.
   */
  voices: true,
  /*
   * Voices sit ABOVE the rest of the mix by default.
   *
   * Speech synthesis output is outside the Web Audio graph, so it cannot be
   * compressed or ducked with everything else - the only lever is this one
   * number, and the dialogue has to win over room tone, rain and a sub-bass
   * bed that are all mixed to sit under it.
   */
  voiceVolume: 1.0,
  sensitivity: 1.0,
  invertY: false,
  quality: "auto",
  fov: PLAYER.fov,
  cameraShake: 1.0,
  headBob: 1.0,
  subtitles: true,
  language: "en",
  crosshair: true,
  /** Hold versus toggle, for players who cannot hold a key comfortably. */
  toggleCrouch: false,
  toggleSprint: false,
};
