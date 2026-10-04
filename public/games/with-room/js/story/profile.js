/**
 * The player's name, and the one safe way to put it into anything.
 *
 * WITHROOM speaks to the player by name - the ghost says it out loud, the
 * wife says it in the car, and it is written into the subtitles. That makes a
 * free-text field the single most dangerous value in the game: it reaches the
 * DOM, the speech synthesiser and the save file.
 *
 * So it is sanitised ONCE, here, at the point of entry, and nothing
 * downstream is trusted to remember to do it. The rules:
 *
 *   - Control characters, bidi overrides and combining-mark pileups are
 *     stripped. Those are the characters that let a name reorder the sentence
 *     around it or draw outside its own line.
 *   - Length is capped. A 400-character "name" wraps the subtitle over the
 *     whole screen, and the speech engine reads every letter of it.
 *   - What comes out is plain text. Every consumer writes it with
 *     `textContent`, never `innerHTML`, and `spoken()` exists so the voice
 *     engine gets a version with nothing in it that a TTS engine can choke on.
 *
 * `fill()` is the templating function the whole script uses: one placeholder,
 * `{name}`, replaced from here. Dialogue files never interpolate by hand,
 * because a template literal in a script file is a sanitiser somebody
 * forgot.
 */

const MAX = 18;
const FALLBACK = "Stranger";

let name = "";

/**
 * Code-point ranges that are stripped, written as numbers rather than as
 * escape sequences inside a regular expression.
 *
 * Numbers because a character class full of escapes is unreadable, impossible
 * to review, and the one place in a sanitiser where a typo is invisible - an
 * escape that does not mean what the author thought still compiles. A table
 * with a comment per row can be checked line by line.
 */
const STRIP = [
  [0x0000, 0x001f, "C0 control characters"],
  [0x007f, 0x009f, "DEL and the C1 controls"],
  [0x00ad, 0x00ad, "soft hyphen - invisible, and breaks word matching"],
  [0x034f, 0x034f, "combining grapheme joiner"],
  [0x061c, 0x061c, "Arabic letter mark"],
  [0x115f, 0x1160, "Hangul fillers - render as blank width"],
  [0x17b4, 0x17b5, "Khmer inherent vowels - render as nothing"],
  [0x180e, 0x180e, "Mongolian vowel separator"],
  [0x200b, 0x200d, "zero-width space, non-joiner, joiner"],
  [0x200e, 0x200f, "left-to-right and right-to-left marks"],
  [0x2028, 0x2029, "line and paragraph separators"],
  [0x202a, 0x202e, "bidi embedding and override"],
  [0x2060, 0x2064, "word joiner and invisible operators"],
  [0x2066, 0x2069, "bidi isolates"],
  [0x206a, 0x206f, "deprecated formatting characters"],
  [0x3000, 0x3000, "ideographic space - a full-width blank"],
  [0x3164, 0x3164, "Hangul filler"],
  [0xfe00, 0xfe0f, "variation selectors"],
  [0xfeff, 0xfeff, "byte order mark"],
  [0xffa0, 0xffa0, "half-width Hangul filler"],
  [0xfff0, 0xffff, "specials, including the replacement character"],
  [0x1d173, 0x1d17a, "musical bar controls - invisible formatting"],
  [0xe0000, 0xe01ef, "tag characters and the deprecated language tags"],
];

/** Is this code point one we refuse to store? */
function stripped(cp) {
  for (let i = 0; i < STRIP.length; i++) {
    if (cp >= STRIP[i][0] && cp <= STRIP[i][1]) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- *
 * Sanitising
 * -------------------------------------------------------------------------- */

/**
 * Reduce arbitrary input to a short run of plain printable text.
 *
 * Deliberately permissive about SCRIPT - Tamil, Devanagari, accents and
 * emoji-free CJK all survive, because telling a player their own name is
 * invalid is worse than any of the things this is defending against. It is
 * strict only about characters that have no business in a name at all.
 */
export function sanitise(raw) {
  let s = String(raw ?? "");

  // Unicode normalisation first: it collapses the decomposed forms that make
  // a length cap meaningless (an "e" plus an accent counts as two).
  try {
    s = s.normalize("NFC");
  } catch {
    /* Ancient engine with no normalize. The rest still applies. */
  }

  /*
   * Walk code points, not UTF-16 units.
   *
   * `Array.from` iterates by code point, so an emoji or a rare CJK character
   * is one entry rather than two halves of a surrogate pair - which matters
   * because dropping one half of a pair produces a lone surrogate, and a lone
   * surrogate is the one string a browser may refuse to store at all.
   */
  const kept = [];
  for (const ch of Array.from(s)) {
    const cp = ch.codePointAt(0);
    if (stripped(cp)) continue;
    kept.push(ch);
  }

  // Collapse any run of whitespace to one ordinary space. The class covers
  // tabs and the Unicode spaces, so a name padded with ideographic spaces
  // does not arrive looking indented.
  s = kept.join("").replace(/\s+/g, " ").trim();

  /*
   * Cap the number of combining marks that may follow one base character.
   *
   * This is the "Zalgo" defence. Thirty accents stacked on one letter draw
   * far outside their own line box and over whatever is above them, which in
   * a game whose UI is layered over a 3D canvas means a name that can cover
   * the HUD.
   */
  s = s.replace(/(\p{M})\p{M}{2,}/gu, "$1$1");

  // Length is counted in code points, so a surrogate pair is one character
  // rather than two.
  const points = Array.from(s);
  if (points.length > MAX) s = points.slice(0, MAX).join("").trim();

  return s;
}

/* -------------------------------------------------------------------------- *
 * Store
 * -------------------------------------------------------------------------- */

/** Set the name. Returns the sanitised value actually stored. */
export function setName(raw) {
  name = sanitise(raw);
  return name;
}

/** The name, or the fallback if the player skipped the field. */
export const getName = () => name || FALLBACK;

/** Whether a real name was given, for the few lines that only work with one. */
export const hasName = () => name.length > 0;

/**
 * The name as the voice engine should receive it.
 *
 * Punctuation is what makes a TTS engine stumble or spell a name out letter
 * by letter, so the spoken form keeps letters, marks, spaces and hyphens and
 * drops everything else. A name that is nothing but punctuation falls back to
 * the written form rather than to silence.
 */
export function spoken() {
  const n = getName().replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, "").trim();
  return n || FALLBACK;
}

/**
 * Replace `{name}` in a string.
 *
 * The only interpolation the script is allowed to use. Non-strings pass
 * through untouched so a caller can hand this a line that has no text yet
 * without having to check first.
 */
export function fill(text) {
  if (typeof text !== "string") return text;
  if (text.indexOf("{name}") === -1) return text;
  return text.split("{name}").join(getName());
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export const serialise = () => ({ name });

export function deserialise(data) {
  // Re-sanitised on the way back in. A save file is editable by the player,
  // so a stored name is untrusted input exactly like a typed one.
  name = sanitise(data?.name ?? "");
}

export function reset() {
  name = "";
}
