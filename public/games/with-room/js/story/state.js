/**
 * The story state machine.
 *
 * WITHROOM is a linear story told through a non-linear space, and the single
 * most important rule in the whole build is this one:
 *
 *   A BEAT IS NEVER ENTERED BY A BUTTON. IT IS ENTERED BY AN OUTCOME.
 *
 * Nothing here advances the story on a click. `solved(n)` is called by the
 * puzzle that was actually solved, `cutsceneDone` by the cutscene that
 * actually finished playing. That is why there is no `next()` in the public
 * API: if a beat could be skipped forward from the outside, somebody
 * debugging a cutscene would eventually ship the shortcut.
 *
 * The beats, and what moves between them:
 *
 *   TITLE          the title screen. Idle.
 *   NAME           "what should we call you?"            → name entered
 *   CAR            the drive, the fog, the black smoke   → cutscene ends
 *   WAKE           he comes round on the bed              → cutscene ends
 *   GHOST_INTRO    "four doors, four answers"             → dialogue ends
 *   ACT1_1..ACT1_4 the four rooms                         → puzzle solved
 *   FLASHBACK      what actually happened at the door     → cutscene ends
 *   REVEAL         the ghost uses the player's name       → dialogue ends
 *   ACT2_1..ACT2_5 her things, her voice, the hour, the mirror,
 *                  and her door                            → puzzle solved
 *   FINAL_DOOR     key, lock, the handle turning          → cutscene ends
 *   ENDLESS        the corridor that does not end         → cutscene ends
 *   ENDING         to be continued                        → back to TITLE
 *
 * Act one is four stages because the ghost promises four. Act two is five, and
 * the ghost never says how many - by then the player has been told the promise
 * was a lie, and the point of the second half is that the count is no longer
 * theirs to know.
 *
 * Nine stages, nine room sizes. Finishing stage N is what pushes the room from
 * state N-1 to state N, which is why there is no separate level counter
 * anywhere in this codebase: the size of the room IS the progress bar.
 */

import { EV, emit } from "../core/bus.js";

export const BEAT = {
  TITLE: "TITLE",
  NAME: "NAME",
  CAR: "CAR_SCENE",
  WAKE: "ROOM_WAKEUP",
  GHOST_INTRO: "GHOST_INTRO",
  ACT1_1: "PUZZLE_1",
  ACT1_2: "PUZZLE_2",
  ACT1_3: "PUZZLE_3",
  ACT1_4: "PUZZLE_4",
  FLASHBACK: "FLASHBACK",
  REVEAL: "ROOM_REVEAL",
  ACT2_1: "PUZZLE_5",
  ACT2_2: "PUZZLE_6",
  ACT2_3: "PUZZLE_7",
  ACT2_4: "PUZZLE_8",
  ACT2_5: "PUZZLE_9",
  FINAL_DOOR: "FINAL_DOOR",
  ENDLESS: "ENDLESS_DOORS",
  ENDING: "ENDING",
};

/**
 * Which beat each stage is solved IN, and which beat solving it leads to.
 *
 * One table rather than a chain of ifs, so adding a stage is a row here and a
 * puzzle module, and the two cannot disagree about what comes next.
 *
 *   stage    1-based stage number, matching world/stages.js
 *   state    the room state the stage is played at
 *   beat     the beat the player is in while solving it
 *   then     the beat solving it moves to
 *   expand   false if the room must NOT grow on the solve, because a
 *            cutscene owns that moment and will trigger it afterwards
 */
export const STAGE_BEATS = [
  { stage: 1, state: 0, beat: BEAT.ACT1_1, then: BEAT.ACT1_2, expand: true },
  { stage: 2, state: 1, beat: BEAT.ACT1_2, then: BEAT.ACT1_3, expand: true },
  { stage: 3, state: 2, beat: BEAT.ACT1_3, then: BEAT.ACT1_4, expand: true },
  /*
   * Stage four does not expand the room.
   *
   * The code opens the main door, and the door is what starts the flashback.
   * Growing the room at the same time would put the single biggest
   * presentation event in the game - seven seconds of walls travelling -
   * directly on top of the single biggest story event. The expansion is held
   * and fired when the flashback hands control back, where it reads as the
   * building opening up rather than as noise.
   */
  { stage: 4, state: 3, beat: BEAT.ACT1_4, then: BEAT.FLASHBACK, expand: false },
  { stage: 5, state: 4, beat: BEAT.ACT2_1, then: BEAT.ACT2_2, expand: true },
  { stage: 6, state: 5, beat: BEAT.ACT2_2, then: BEAT.ACT2_3, expand: true },
  { stage: 7, state: 6, beat: BEAT.ACT2_3, then: BEAT.ACT2_4, expand: true },
  { stage: 8, state: 7, beat: BEAT.ACT2_4, then: BEAT.ACT2_5, expand: true },
  /*
   * Stage nine does not expand the room either, for the same reason stage four
   * did not: the door opening is the end of the game, and the walls travelling
   * outward at the same moment would be two endings at once. There is also
   * nowhere left to expand to - state 8 is the largest the room has.
   */
  { stage: 9, state: 8, beat: BEAT.ACT2_5, then: BEAT.FINAL_DOOR, expand: false },
];

/** Beats during which the player has the room and the HUD. */
const PLAYABLE = new Set([
  BEAT.ACT1_1,
  BEAT.ACT1_2,
  BEAT.ACT1_3,
  BEAT.ACT1_4,
  BEAT.ACT2_1,
  BEAT.ACT2_2,
  BEAT.ACT2_3,
  BEAT.ACT2_4,
  BEAT.ACT2_5,
]);

/** Beats that are a cutscene: no HUD, no control, the director drives. */
const CINEMATIC = new Set([
  BEAT.CAR,
  BEAT.WAKE,
  BEAT.FLASHBACK,
  BEAT.FINAL_DOOR,
  BEAT.ENDLESS,
  BEAT.ENDING,
]);

/* -------------------------------------------------------------------------- *
 * State
 * -------------------------------------------------------------------------- */

let beat = BEAT.TITLE;
/** Beats already played, so a reload never replays a cutscene. */
const seen = new Set();

export const current = () => beat;
export const is = (...names) => names.includes(beat);
export const isPlayable = () => PLAYABLE.has(beat);
export const isCinematic = () => CINEMATIC.has(beat);
export const hasSeen = (name) => seen.has(name);

/** 1 before the flashback, 2 after it. Audio and lighting both read this. */
export const act = () => {
  switch (beat) {
    case BEAT.TITLE:
    case BEAT.NAME:
    case BEAT.CAR:
    case BEAT.WAKE:
    case BEAT.GHOST_INTRO:
    case BEAT.ACT1_1:
    case BEAT.ACT1_2:
    case BEAT.ACT1_3:
    case BEAT.ACT1_4:
      return 1;
    default:
      return 2;
  }
};

/** The stage the player is currently expected to solve, or 0 in a cutscene. */
export function stage() {
  const row = STAGE_BEATS.find((r) => r.beat === beat);
  return row ? row.stage : 0;
}

/** The row for a stage number. */
export const rowForStage = (n) => STAGE_BEATS.find((r) => r.stage === n) ?? null;

/**
 * Does solving this stage grow the room, or does a cutscene own that moment?
 *
 * Read by the one place in main.js that turns a solve into an expansion, so
 * the decision lives in the story table rather than inside a puzzle.
 */
export function expandsOnSolve(stageNumber) {
  const row = rowForStage(stageNumber);
  return row ? row.expand !== false : true;
}

/* -------------------------------------------------------------------------- *
 * Moving
 * -------------------------------------------------------------------------- */

/**
 * Enter a beat.
 *
 * Internal in spirit: it is exported because loading a save has to restore a
 * beat without replaying the route to it, and because the debug handle is
 * worth more than the purity. Gameplay goes through `solved` and
 * `cutsceneDone`.
 */
export function enter(next) {
  if (!next || next === beat) return beat;
  const from = beat;
  beat = next;
  seen.add(next);
  emit(EV.STORY_BEAT, { beat, from });
  return beat;
}

/**
 * A stage was solved. Returns the beat this moves the story to, or null if
 * the solve does not belong to the beat the player is actually in.
 *
 * The guard matters: stage two's placement check runs four times a second
 * forever, and without it a late re-trigger could drag the story backwards
 * from the flashback into act one.
 */
export function solved(stageNumber) {
  const row = rowForStage(stageNumber);
  if (!row) return null;
  if (beat !== row.beat) return null;
  enter(row.then);
  return row.then;
}

/**
 * A cutscene or a dialogue finished. Each one knows only its own id, and this
 * decides what that means - so a cutscene module never contains the name of
 * the beat that follows it.
 */
export function cutsceneDone(id) {
  switch (id) {
    case BEAT.NAME:
      return enter(BEAT.CAR);
    case BEAT.CAR:
      return enter(BEAT.WAKE);
    case BEAT.WAKE:
      return enter(BEAT.GHOST_INTRO);
    case BEAT.GHOST_INTRO:
      return enter(BEAT.ACT1_1);
    case BEAT.FLASHBACK:
      return enter(BEAT.REVEAL);
    case BEAT.REVEAL:
      return enter(BEAT.ACT2_1);
    case BEAT.FINAL_DOOR:
      return enter(BEAT.ENDLESS);
    case BEAT.ENDLESS:
      return enter(BEAT.ENDING);
    case BEAT.ENDING:
      return enter(BEAT.TITLE);
    default:
      return beat;
  }
}

/* -------------------------------------------------------------------------- *
 * What the player is trying to do
 *
 * One objective line per beat, as an i18n key. The HUD stores keys rather than
 * text so a language switch re-resolves it, which is why this returns a key and
 * not a sentence.
 *
 * The keys are prefixed `goal`, not `obj`, because `obj*` is the namespace for
 * the NAMES of interactable objects - `objClock` is the words "wall clock" in
 * the interaction prompt. An objective called objClock printed "wall clock"
 * across the top of the screen as the player's goal for the first stage.
 * -------------------------------------------------------------------------- */

export function objectiveKey() {
  switch (beat) {
    case BEAT.ACT1_1:
      return "goalClock";
    case BEAT.ACT1_2:
      return "goalSymbols";
    case BEAT.ACT1_3:
      return "goalMechanism";
    case BEAT.ACT1_4:
      return "goalCode";
    case BEAT.ACT2_1:
      return "goalFindWife";
    case BEAT.ACT2_2:
      return "goalFollowVoice";
    case BEAT.ACT2_3:
      return "goalTheHour";
    case BEAT.ACT2_4:
      return "goalFinalKey";
    case BEAT.ACT2_5:
      return "goalHerDoor";
    default:
      return "";
  }
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export const serialise = () => ({ beat, seen: [...seen] });

export function deserialise(data) {
  if (!data) return;
  const restored = data.beat;
  // Only a beat this build knows about. An unknown one - a save from a
  // different cut of the story - falls back to the start of act one rather
  // than stranding the player in a beat with no exit.
  beat = Object.values(BEAT).includes(restored) ? restored : BEAT.ACT1_1;
  seen.clear();
  for (const s of data.seen ?? []) seen.add(s);
  /*
   * Never resume INTO a cutscene.
   *
   * A save written during the flashback would otherwise reload straight back
   * into it with no world built around the player. Resuming at the beat the
   * cutscene leads to is both safer and what a player expects: they do not
   * want to watch it twice.
   */
  if (CINEMATIC.has(beat)) beat = cutsceneDone(beat);
}

export function reset() {
  beat = BEAT.TITLE;
  seen.clear();
}
