/**
 * A very small synchronous event bus.
 *
 * Systems in this game have to react to each other without knowing about each
 * other: the audio mixer ducks when the room expands, the HUD flashes when
 * stability drops, the save system writes on a checkpoint. Wiring those
 * directly would make RoomScaleManager import the mixer, the HUD and the save
 * file, and the dependency graph would be a knot within a week.
 *
 * Instead every system publishes facts and subscribes to the ones it cares
 * about. The bus is deliberately tiny - no wildcards, no priorities, no async.
 * If an event needs ordering guarantees it is the wrong tool and the systems
 * should talk directly.
 */

/** Canonical event names. Typos in a string literal are silent; typos here are not. */
export const EV = {
  // --- lifecycle
  BOOT_PROGRESS: "boot:progress",
  GAME_START: "game:start",
  GAME_PAUSE: "game:pause",
  GAME_RESUME: "game:resume",
  GAME_OVER: "game:over",

  // --- room
  ROOM_WILL_CHANGE: "room:willChange",
  ROOM_CHANGING: "room:changing",
  ROOM_CHANGED: "room:changed",
  ROOM_EXPAND_START: "room:expandStart",
  ROOM_SHRINK_START: "room:shrinkStart",

  // --- stability
  STABILITY_CHANGED: "stability:changed",
  STABILITY_BAND: "stability:band",

  // --- puzzles
  PUZZLE_ARMED: "puzzle:armed",
  PUZZLE_SOLVED: "puzzle:solved",
  PUZZLE_FAILED_MINOR: "puzzle:failedMinor",
  PUZZLE_FAILED_MAJOR: "puzzle:failedMajor",

  // --- interaction
  FOCUS_CHANGED: "interact:focus",
  PICKED_UP: "interact:pickup",
  DROPPED: "interact:drop",
  USED: "interact:use",

  // --- story
  /** The story moved to a new beat. Payload: { beat, from }. */
  STORY_BEAT: "story:beat",
  /** A scripted line asked the scene for something. Payload: { cue, line }. */
  STORY_CUE: "story:cue",
  /** A cutscene took and released the screen. Payload: { id }. */
  CUTSCENE_START: "story:cutsceneStart",
  CUTSCENE_END: "story:cutsceneEnd",
  /** A dialogue sequence began or finished. Payload: { id, lines }. */
  DIALOGUE_START: "story:dialogueStart",
  DIALOGUE_END: "story:dialogueEnd",
  /** One line is now being spoken. Payload: { line, who, text }. */
  DIALOGUE_LINE: "story:dialogueLine",
  /** The player named themselves. Payload: { name }. */
  NAME_SET: "story:name",
  /** An ambient horror beat fired. Payload: { kind }. */
  HORROR: "story:horror",

  // --- presentation
  SUBTITLE: "ui:subtitle",
  TOAST: "ui:toast",
  SHAKE: "fx:shake",

  // --- persistence
  CHECKPOINT: "save:checkpoint",
  SAVED: "save:written",

  // --- settings
  SETTINGS_CHANGED: "settings:changed",
  LANGUAGE_CHANGED: "settings:language",
};

const handlers = new Map();

/**
 * Subscribe. Returns an unsubscribe function, which is what callers should
 * keep: it is far harder to leak than remembering the exact handler reference.
 */
export function on(event, fn) {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(fn);
  return () => set.delete(fn);
}

/** Subscribe for exactly one delivery. */
export function once(event, fn) {
  const off = on(event, (payload) => {
    off();
    fn(payload);
  });
  return off;
}

export function off(event, fn) {
  handlers.get(event)?.delete(fn);
}

/**
 * Publish. Handlers run synchronously, in subscription order.
 *
 * A throwing handler is logged and skipped rather than allowed to take the
 * frame down with it: one broken HUD widget must not stop the room expanding
 * half way and strand the player inside a wall.
 */
export function emit(event, payload) {
  const set = handlers.get(event);
  if (!set || set.size === 0) return;
  // Copy first: a handler is allowed to unsubscribe itself or others.
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[bus] handler for "${event}" threw`, err);
    }
  }
}

/** Drop every subscription. Used when returning to the main menu. */
export function clear() {
  handlers.clear();
}
