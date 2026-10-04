/**
 * Voices.
 *
 * Three characters have to sound like three different people, and the ghost
 * has to be able to pronounce a name the player typed thirty seconds ago -
 * which rules out recorded dialogue entirely. There is no voice-over in this
 * build and there cannot be one: the name is not knowable until runtime.
 *
 * So the words come from the browser's own speech synthesiser and everything
 * that makes a voice a PERFORMANCE is added here:
 *
 *   CASTING     `getVoices()` is scored for language and apparent gender and
 *               the best match is pinned per character for the whole session.
 *               Pinning matters more than picking well: a wife who changes
 *               voice between the car and the flashback is worse than a wife
 *               with a mediocre voice.
 *   EMOTION     rate, pitch and volume per character per emotion. The script
 *               says a line is afraid; this file decides what afraid sounds
 *               like, so the two can be tuned independently.
 *   THE GHOST   a synthesiser is incapable of sounding supernatural on its
 *               own, so the ghost is a LAYERED effect: the slowest, lowest
 *               utterance the engine will produce, under a procedural bed of
 *               breath, sub-bass and whisper grains built in the audio mixer,
 *               with the room ambience ducked out from under it. The words are
 *               intelligible; the thing saying them is not a person.
 *
 * Why not route the utterance through the Web Audio graph and filter it?
 * Because `speechSynthesis` output is not reachable from an AudioContext in
 * any shipping browser. That is the constraint that shapes this entire file:
 * everything the ghost needs that cannot be done TO the voice is done AROUND
 * it instead.
 *
 * Nothing here is allowed to be load-bearing. Speech is absent on a surprising
 * number of real devices, permanently muted on others, and the whole subsystem
 * can be switched off in Settings. Every call therefore returns a duration and
 * the dialogue sequencer paces itself from that - so with no voices at all the
 * game plays identically with subtitles, at the same speed.
 */

import { audio } from "../audio/manager.js";
import { clamp } from "../core/maths.js";
import * as clips from "./voiceClips.js";
import * as profile from "./profile.js";

/* -------------------------------------------------------------------------- *
 * Casting
 * -------------------------------------------------------------------------- */

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

/** Name fragments that reliably indicate a voice's apparent gender. */
const FEMALE = [
  "female", "woman",
  "zira", "hazel", "susan", "linda", "heera", "samantha", "victoria",
  "karen", "moira", "tessa", "fiona", "serena", "allison", "ava", "nora",
  "google uk english female", "google us english", "catherine", "amelie",
  "kalpana", "sapna", "pallavi", "valluvar female",
];

const MALE = [
  "male", "man",
  "david", "mark", "george", "james", "ravi", "daniel", "alex", "fred",
  "rishi", "oliver", "aaron", "arthur", "gordon", "lee", "tom", "eddy",
  "google uk english male", "prabhakar", "hemant", "madhur",
];

/** The three cast members. `voice` is filled by `cast()`. */
const CAST = {
  him: { voice: null, want: "male", baseRate: 1.0, basePitch: 0.82 },
  her: { voice: null, want: "female", baseRate: 1.02, basePitch: 1.12 },
  /*
   * The ghost.
   *
   * RETUNED FOR INTELLIGIBILITY. The first version ran at 0.56 speed and pitch
   * 0.06 - the floor of what the API allows - on the theory that lower and
   * slower is more frightening. It is not: at pitch 0 a synthesiser stops
   * producing formants and starts producing a growl, every consonant is lost,
   * and the words go with them. A ghost nobody can understand is not
   * frightening, it is a sound effect, and the one thing this voice absolutely
   * has to do is say the player's name clearly enough to be recognised.
   *
   * 0.78 speed and 0.3 pitch keeps the words and still sounds nothing like a
   * person. The rest of the menace is added around the voice rather than
   * inside it - see `ghostBed` below - which is where it belongs, because that
   * part is ours to control and the synthesiser is not.
   */
  ghost: { voice: null, want: "female", baseRate: 0.78, basePitch: 0.3 },
};

let voicesReady = false;
let primed = false;
let enabled = true;
let volume = 1;
let lang = "en";
/**
 * Whether a genuinely Tamil voice was found on this device.
 *
 * Almost never true on a desktop: Windows ships Tamil text-to-speech only if
 * the language pack is installed, macOS has no Tamil voice at all, and Android
 * has one only with Google TTS and the Tamil data downloaded. It is usually
 * true on a Tamil-configured phone, which is the case that matters most here.
 */
let tamilVoice = false;

/**
 * Score one voice for a character.
 *
 * Language first, because a Tamil line read by an English voice is unlistenable
 * while an English line read by an Indian-English voice is merely accented.
 * Gender second. Locality third: a local voice has no network latency, and a
 * cloud voice that arrives 400 ms late has already missed its subtitle.
 */
function score(voice, want, wantLang) {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  const vl = (voice.lang || "").toLowerCase();
  let s = 0;

  if (wantLang === "ta") {
    if (vl.startsWith("ta")) s += 1000;
    // Indian English is the best available stand-in for a Tamil line: the
    // vowels survive, which a US voice cannot manage at all.
    else if (vl.startsWith("en-in")) s += 300;
    else if (vl.startsWith("en")) s += 60;
  } else {
    if (vl.startsWith("en")) s += 1000;
    if (vl.startsWith("en-gb")) s += 40;
    if (vl.startsWith("en-in")) s += 20;
    else if (!vl.startsWith("en")) s -= 400;
  }

  const female = FEMALE.some((k) => name.includes(k));
  const male = MALE.some((k) => name.includes(k));
  if (want === "female") s += female ? 220 : male ? -220 : 0;
  else s += male ? 220 : female ? -220 : 0;

  if (voice.localService) s += 90;
  // "Natural", "Neural" and "Enhanced" are the vendors' own labels for their
  // better engines, and they are worth reaching for by name.
  if (/natural|neural|enhanced|premium/.test(name)) s += 160;
  // Novelty voices exist on older macOS installs and are unusable for drama.
  if (/albert|bad news|bells|bubbles|cellos|jester|organ|trinoids|whisper|zarvox|wobble/.test(name)) {
    s -= 900;
  }
  if (voice.default) s += 15;

  return s;
}

/** Pick the best voice for each character, and remember it for the session. */
function cast() {
  if (!synth) return;
  const list = synth.getVoices();
  if (!list || list.length === 0) return;

  voicesReady = true;
  tamilVoice = list.some((v) => (v.lang || "").toLowerCase().startsWith("ta"));

  for (const key of Object.keys(CAST)) {
    const slot = CAST[key];
    let best = null;
    let bestScore = -Infinity;
    for (const voice of list) {
      const s = score(voice, slot.want, lang);
      if (s > bestScore) {
        bestScore = s;
        best = voice;
      }
    }
    slot.voice = best;
  }

  /*
   * Make sure the husband and the ghost are not the same voice.
   *
   * On a bare Linux or a locked-down Windows install there is sometimes
   * exactly one voice, and three characters sharing it turns every
   * conversation into a monologue. When that happens the ghost keeps the
   * voice (it is the one that matters most) and the husband is pushed to the
   * best remaining alternative - and if there is no alternative at all, the
   * pitch and rate separation below still tells them apart.
   */
  if (list.length > 1 && CAST.him.voice === CAST.ghost.voice) {
    let alt = null;
    let altScore = -Infinity;
    for (const voice of list) {
      if (voice === CAST.ghost.voice) continue;
      const s = score(voice, "male", lang);
      if (s > altScore) {
        altScore = s;
        alt = voice;
      }
    }
    if (alt) CAST.him.voice = alt;
  }
}

/* -------------------------------------------------------------------------- *
 * Recordings
 *
 * The ghost is the one character whose lines can be pre-rendered, because the
 * ghost is the one character the player is supposed to hear identically on
 * every device. Where a clip exists it wins over the synthesiser - see the
 * clip branch in `speak` - and the browser voice stays as the fallback for
 * lines that have no file yet and for the two human characters, who are
 * allowed to sound like whatever the device has.
 * -------------------------------------------------------------------------- */

let clipsWarmed = false;

/**
 * Pull the ghost's clips into memory.
 *
 * Attempted at init and again when the ghost first speaks. The audio context
 * does not exist until a user gesture, and init() runs on several gestures
 * that may all predate it, so a single attempt is not enough - but the second
 * caller is a line the ghost is about to say, by which point the context is
 * certainly running.
 */
function warmClips() {
  if (clipsWarmed) return;
  clipsWarmed = audio.preloadClips(clips.pathsFor(lang)) === true;
}

/* -------------------------------------------------------------------------- *
 * Emotion
 *
 * Multipliers on the character's base, not absolute values, so re-casting a
 * character changes every one of their emotions coherently.
 * -------------------------------------------------------------------------- */

const EMOTION = {
  /* --- the husband --- */
  calm: { rate: 1.0, pitch: 1.0, gain: 1.0 },
  confused: { rate: 0.9, pitch: 0.97, gain: 0.92 },
  afraid: { rate: 1.05, pitch: 1.09, gain: 1.0 },
  shock: { rate: 1.2, pitch: 1.16, gain: 1.0 },
  anger: { rate: 1.12, pitch: 0.9, gain: 1.0 },
  desperate: { rate: 1.26, pitch: 1.2, gain: 1.0 },

  /* --- the wife --- */
  worried: { rate: 0.95, pitch: 0.98, gain: 0.95 },
  panic: { rate: 1.32, pitch: 1.22, gain: 1.0 },
  scream: { rate: 1.4, pitch: 1.3, gain: 1.0 },
  /** Heard through a wall, from somewhere below. Quiet and slow. */
  far: { rate: 0.86, pitch: 1.04, gain: 0.5 },

  /* --- the ghost ---
   * Both of these are near 1: the character's own base is already slow and low,
   * and stacking another multiplier on top is what made the first version
   * unintelligible. The difference between a whisper and a cold statement is
   * carried by GAIN and by the bed underneath, not by mangling the rate. */
  whisper: { rate: 0.98, pitch: 1.0, gain: 0.92 },
  cold: { rate: 0.92, pitch: 0.96, gain: 1.0 },

  /* Laughs carry no words: they are procedural, and the voice engine only
   * reports how long to hold the moment. */
  laugh: { rate: 1, pitch: 1, gain: 1, wordless: 1.9 },
  laughSoft: { rate: 1, pitch: 1, gain: 1, wordless: 1.5 },
  laughLong: { rate: 1, pitch: 1, gain: 1, wordless: 3.4 },
};

const emotion = (key) => EMOTION[key] ?? EMOTION.calm;

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

/**
 * Prepare speech. Safe to call repeatedly, and it must be: the first call
 * from inside a real user gesture is the one that works, and which gesture
 * that is varies by platform.
 */
export function init() {
  if (!synth) return;

  warmClips();

  if (!voicesReady) {
    cast();
    // Chrome populates the list asynchronously and fires this once, usually
    // within a few hundred milliseconds of the first getVoices() call.
    synth.addEventListener?.("voiceschanged", cast);
  }

  /*
   * Prime the engine with one silent utterance.
   *
   * Safari refuses to speak at all unless `speak()` has been called once
   * inside a user gesture, and the failure is silent - no error, no event,
   * just a game where nobody ever says anything. A zero-volume space costs
   * nothing and converts that into a working engine.
   */
  if (!primed) {
    primed = true;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      u.rate = 2;
      synth.speak(u);
    } catch {
      /* Engine exists but refuses. Subtitles carry the game. */
    }
  }
}

export function setLanguage(next) {
  if (next === lang) return;
  lang = next === "ta" ? "ta" : "en";
  // Re-cast: the best voice for Tamil is almost never the best for English.
  voicesReady = false;
  cast();
  // And fetch the other language's recordings. Only the current language is
  // ever warmed, so a player who never touches the setting never pays for the
  // half of the audio they will not hear.
  clipsWarmed = false;
  warmClips();
}

/** Settings hook: whether to speak at all, and how loudly. */
export function setSettings({ voices, voiceVolume, masterVolume } = {}) {
  if (voices !== undefined) {
    enabled = !!voices;
    if (!enabled) cancel();
  }
  if (voiceVolume !== undefined || masterVolume !== undefined) {
    const v = voiceVolume === undefined ? volume : voiceVolume;
    const m = masterVolume === undefined ? 1 : masterVolume;
    // Speech volume is outside the Web Audio graph, so the master fader has
    // to be applied by hand or the voices stay loud when everything else is
    // turned down.
    volume = clamp(v * clamp(m, 0, 1), 0, 1);
  }
}

/** Is a real voice going to come out if we ask? */
export const available = () => !!synth && enabled && voicesReady;

/** Does this device have a Tamil voice, as opposed to a fallback? */
export const hasTamilVoice = () => tamilVoice;

/** For the debug panel: who got cast as whom, and in what language. */
export const castList = () => ({
  language: lang,
  tamilVoice,
  ...Object.fromEntries(
    Object.entries(CAST).map(([k, v]) => [k, v.voice?.name ?? "(none)"]),
  ),
});

/* -------------------------------------------------------------------------- *
 * Speaking
 * -------------------------------------------------------------------------- */

let active = null;

/**
 * How long a line should be held on screen, in seconds.
 *
 * Used as the fallback when there is no speech, and as the safety timeout
 * when there is: `onend` is unreliable on every engine in a way that is not
 * worth enumerating, and a dialogue sequence that waits forever for an event
 * that will not arrive is a game that has hung on a cutscene.
 *
 * The constants are read-aloud speed, not reading speed: roughly 14 characters
 * per second at normal rate, with a floor that keeps very short lines ("Meera?")
 * on screen long enough to register.
 */
export function estimate(text, rate = 1) {
  const chars = (text || "").length;
  if (chars === 0) return 0.9;
  const seconds = 0.55 + chars / (13.5 * Math.max(0.4, rate));
  return clamp(seconds, 1.1, 12);
}

/**
 * Speak one scripted line.
 *
 * Returns `{ seconds, cancel }`. `seconds` is how long the caller should hold
 * the subtitle; it is the engine's real duration when one is reported and the
 * estimate otherwise. The caller never has to know which.
 *
 * `onEnd` fires when the line finishes for any reason - finished, cancelled,
 * failed, or never started. Exactly once.
 */
export function speak(line, { onEnd } = {}) {
  const who = line?.who ?? "none";
  const emo = emotion(line?.emo);

  /*
   * WHICH LANGUAGE IS SPOKEN, which is not always the one on screen.
   *
   * Tamil subtitles with a Tamil voice is the intended experience and is what
   * a Tamil-configured phone gives. On a device with no Tamil voice, handing
   * Tamil text to an English engine produces either silence or a string of
   * mispronounced letters - so the line is SPOKEN in English while the
   * subtitle stays Tamil.
   *
   * That split is deliberate. A player reading Tamil still gets a performance,
   * the ghost still says their name out loud, and nobody is left with a horror
   * game that has gone quiet because of a missing language pack. The subtitle
   * is the authority on the words either way.
   */
  const spokenLang = lang === "ta" && !tamilVoice ? "en" : lang;
  const raw = (spokenLang === "ta" ? line?.ta : line?.en) || "";
  const text = profile.fill(raw).trim();

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd?.();
  };

  /* --- wordless beats: a laugh, or a silent cue line ------------------- */
  if (emo.wordless || !text) {
    const seconds = emo.wordless ?? 0.1;
    if (emo.wordless && who === "ghost") ghostLaugh(emo.wordless);
    const timer = window.setTimeout(finish, seconds * 1000);
    active = { timer, cancel: () => window.clearTimeout(timer) };
    return { seconds, cancel: () => { window.clearTimeout(timer); finish(); } };
  }

  const slot = CAST[who] ?? CAST.him;
  const rate = clamp(slot.baseRate * emo.rate, 0.1, 2);
  const pitch = clamp(slot.basePitch * emo.pitch, 0, 2);
  let seconds = estimate(text, rate);

  /* --- a recording, if this line has one -------------------------------- */
  /*
   * Why a clip wins.
   *
   * Not because it is better acted, though it is: because it is an AudioBuffer.
   * The whole of the file header's lament - that the synthesiser's output
   * cannot be reached from the audio graph and so everything frightening has
   * to be built AROUND the voice rather than applied TO it - stops being true
   * the moment the words arrive as samples. A clip is filtered, doubled,
   * reverberated into the big room and ducked against the ambience by
   * `audio.voiceClip`, which means forty files generated one at a time come
   * out of the game sounding like one voice in one room.
   *
   * The clip is looked up in the SUBTITLE's language rather than the spoken
   * one. `spokenLang` exists because a device with no Tamil voice cannot read
   * a Tamil line aloud; a recording has no such problem, so a Tamil player
   * with a Tamil clip hears Tamil whatever voices the device has, and only
   * falls back to the English recording when the Tamil one is missing.
   */
  if (who === "ghost" && enabled && volume > 0.001) {
    warmClips();
    let buffer = null;
    for (const l of lang === spokenLang ? [lang] : [lang, spokenLang]) {
      const path = clips.pathFor(line, l);
      buffer = path ? audio.clip(path) : null;
      if (buffer) break;
    }
    if (buffer) {
      const played = audio.voiceClip(buffer, {
        gain: clamp(volume * emo.gain, 0, 1),
      });
      if (played.seconds > 0) {
        // The buffer's real length, not an estimate of one. This is the only
        // path in the file where the subtitle and the words are guaranteed to
        // end together.
        seconds = played.seconds;
        ghostBed(seconds, emo);
        const timer = window.setTimeout(finish, seconds * 1000);
        const cancelClip = () => {
          window.clearTimeout(timer);
          played.stop();
          finish();
        };
        active = { timer, cancel: cancelClip };
        return { seconds, cancel: cancelClip };
      }
    }
  }

  // The ghost's bed starts with the line and is sized to it, so the breath
  // and the sub-bass end when the sentence does rather than trailing over the
  // silence the script authored after it.
  if (who === "ghost") ghostBed(seconds, emo);
  if (who === "her" && (line.emo === "scream" || line.emo === "panic")) {
    audio.play("distantScream", { gain: line.emo === "scream" ? 1 : 0.6 });
  }

  if (!synth || !enabled || !voicesReady || volume <= 0.001) {
    // No engine, or voices off: hold the subtitle for the estimated time so
    // the pacing of the scene is identical either way.
    const timer = window.setTimeout(finish, seconds * 1000);
    active = { timer, cancel: () => window.clearTimeout(timer) };
    return { seconds, cancel: () => { window.clearTimeout(timer); finish(); } };
  }

  let utter = null;
  let guard = 0;

  try {
    utter = new SpeechSynthesisUtterance(text);
    if (slot.voice) {
      utter.voice = slot.voice;
      utter.lang = slot.voice.lang;
    } else {
      utter.lang = spokenLang === "ta" ? "ta-IN" : "en-US";
    }
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = clamp(volume * emo.gain, 0, 1);

    utter.onend = finish;
    utter.onerror = finish;

    /*
     * Cancel anything still speaking first.
     *
     * Utterances QUEUE rather than mix, so without this a line interrupted by
     * a skip would still be read out underneath the next one - and by the end
     * of a cutscene the engine would be several lines behind the subtitles.
     */
    synth.cancel();
    synth.speak(utter);

    // Safety net. Generous, because a slow cloud voice legitimately takes
    // longer than the estimate; it exists to break a hang, not to cut lines off.
    guard = window.setTimeout(finish, (seconds + 4.5) * 1000);
  } catch {
    finish();
  }

  const cancel = () => {
    window.clearTimeout(guard);
    try {
      synth.cancel();
    } catch {
      /* Nothing to stop. */
    }
    finish();
  };

  active = { utter, cancel };
  return { seconds, cancel };
}

/** Stop whatever is speaking right now. */
export function cancel() {
  active?.cancel?.();
  active = null;
  try {
    synth?.cancel();
  } catch {
    /* Already quiet. */
  }
}

/* -------------------------------------------------------------------------- *
 * The ghost's layers
 *
 * This is the half of the ghost's voice that does not come from the speech
 * engine. All of it is synthesised by the audio mixer, so it is correctly
 * reverberated for the room the player is standing in and ducks the ambience
 * the same way every other event in the game does.
 * -------------------------------------------------------------------------- */

function ghostBed(seconds, emo) {
  /*
   * The breath comes BEFORE the words, not under them.
   *
   * It is played at the start of the line and is over in half a second, which
   * leaves the sentence itself in the clear. The first version overlapped the
   * two and the inhale masked the first syllable of every line - which is the
   * syllable the player needs most, because it is usually their name.
   */
  audio.play("ghostBreath", { gain: emo === EMOTION.cold ? 0.7 : 0.85 });

  /*
   * And the bed is quieter than it was.
   *
   * Sub-bass under a voice is free - it occupies a band speech does not use.
   * The whisper GRAINS are not free: they sit at 900-2600 Hz, which is exactly
   * where consonants live, so every grain is competing with the words it is
   * supposed to be haunting. They are still there, at about half strength.
   */
  audio.ghostVoiceBed(seconds, { grains: true, grainLevel: 0.5 });
}

function ghostLaugh(seconds) {
  audio.ghostLaugh(seconds);
}
