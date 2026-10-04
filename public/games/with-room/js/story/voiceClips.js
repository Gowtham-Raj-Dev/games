/**
 * Which recorded clip belongs to which line.
 *
 * The ghost's forty-odd lines are generated outside the game, one file per
 * line per language, and this module is the only thing that knows the mapping.
 * Nothing else has to: story/voice.js asks "is there a clip for this line" and
 * gets a path or nothing back.
 *
 * WHY IDS AND NOT FILENAMES IN THE SCRIPT. Putting a filename on every line in
 * script.js would mean the script - the one file in the codebase that reads as
 * a story - turns into an asset manifest. So the ids are derived here instead,
 * by walking the script in a fixed order and numbering the ghost's lines
 * g01, g02, g03... in the order the player hears them.
 *
 * That makes SEQUENCE_ORDER load-bearing. Inserting a ghost line in the middle
 * of a sequence renumbers every line after it, which would silently point a
 * dozen lines at the wrong audio. Append at the end of a sequence where you
 * can; where you cannot, rebuild the set - `node tools/ghost-voice/build.mjs`
 * walks this same order and writes the files to match it.
 *
 * Lines that live outside script.js - the ghost's two taunts in herdoor.js and
 * one in clocks.js - are matched on their English text instead, which is
 * unique for all three and does not move when a sequence changes.
 *
 * Clips are entirely optional. With no files on disk this module hands back
 * nothing at all and every line is spoken by the synthesiser, exactly as it
 * was before clips existed.
 */

import * as script from "./script.js";

/** Where the files live, relative to the game root. */
const DIR = "assets/audio/voice/ghost";

/**
 * The order the ghost's lines are numbered in.
 *
 * Story order, not file order - it is the order a player meets them, which is
 * the order someone generating forty audio files will work through them in.
 */
const SEQUENCE_ORDER = [
  "GHOST_INTRO",
  "REVEAL",
  "SOLVED_1",
  "SOLVED_2",
  "SOLVED_3",
  "SOLVED_4",
  "SOLVED_5",
  "SOLVED_6",
  "FLASHBACK",
  "ENDLESS",
  "WHISPERS",
];

/**
 * Lines spoken by the ghost from somewhere other than script.js.
 *
 * Keyed by normalised English text. The numbers continue on from wherever the
 * script leaves off, so the whole set is one contiguous run of ids.
 */
const INLINE = [
  "Three seventeen. That one is mine.",
  "You do not know which one she is behind.",
  "You were holding the answer. You put it on a bed.",
];

/* -------------------------------------------------------------------------- *
 * The index
 * -------------------------------------------------------------------------- */

/**
 * Identity first, text second.
 *
 * A line object straight out of script.js is matched by reference, which is
 * exact and survives two lines having identical text - "{name}..." is spoken
 * twice in the game, once in REVEAL and once as a random whisper, and they are
 * different recordings. Only lines declared elsewhere fall through to the text
 * map, where their text is known to be unique.
 */
const byLine = new WeakMap();
const byText = new Map();

/** Punctuation and spacing vary between a script and a filename. Ids must not. */
const key = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9{}]+/g, " ")
    .trim();

const idFromNumber = (n) => `g${String(n).padStart(2, "0")}`;

/** Every clip path, in id order. Built once, used for preloading. */
const ids = [];

(function buildIndex() {
  let n = 0;

  for (const name of SEQUENCE_ORDER) {
    const lines = script[name];
    if (!Array.isArray(lines)) continue;
    for (const line of lines) {
      if (!line || line.who !== "ghost") continue;
      n++;
      /*
       * Wordless beats are skipped but still consume a number.
       *
       * The laughs are procedural - audio/manager.js builds them from gated
       * formants - and there is no file for them. They keep their place in the
       * numbering anyway so that the ids here match the numbered line list the
       * audio was generated from; a gap in the files is far less confusing
       * than an off-by-one in the ids.
       */
      const id = idFromNumber(n);
      ids.push(id);
      if (!line.en && !line.ta) continue;
      byLine.set(line, id);
      if (line.en) byText.set(key(line.en), id);
    }
  }

  for (const text of INLINE) {
    n++;
    const id = idFromNumber(n);
    ids.push(id);
    byText.set(key(text), id);
  }
})();

/* -------------------------------------------------------------------------- *
 * Lookup
 * -------------------------------------------------------------------------- */

/** The clip id for a line, or null if it is not one of the ghost's. */
export function idFor(line) {
  if (!line || line.who !== "ghost") return null;
  return byLine.get(line) ?? byText.get(key(line.en)) ?? null;
}

/**
 * The path to a line's clip, without an extension.
 *
 * The extension is the audio manager's business: it tries mp3, ogg and wav in
 * turn, so the same path works whether the files have been compressed yet.
 */
export function pathFor(line, lang = "en") {
  const id = idFor(line);
  if (!id) return null;
  return `${DIR}/${lang === "ta" ? "ta" : "en"}/${id}`;
}

/** Every clip path for one language, for preloading. */
export const pathsFor = (lang = "en") =>
  ids.map((id) => `${DIR}/${lang === "ta" ? "ta" : "en"}/${id}`);

/** For the debug panel and for the generator note: how many ids exist. */
export const count = () => ids.length;
