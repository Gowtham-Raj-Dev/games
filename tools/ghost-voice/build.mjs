/**
 * Build the ghost's placeholder voice set.
 *
 *   node tools/ghost-voice/build.mjs
 *
 * Reads every ghost line out of the game's own script, speaks each one with a
 * single Windows voice, trims and levels the results, and writes them into
 * assets/audio/voice/ghost/en as g01.wav ... g47.wav.
 *
 * WHY THIS EXISTS. The real voice set is generated elsewhere, by whatever tool
 * is producing the performance. This is the stand-in: one voice, one setting,
 * every line present, so the whole game can be played through and heard in a
 * consistent tone - and so a real clip has something to be compared against.
 * It is also the thing to re-run when a ghost line is added, because the ids
 * are positional and a new line in the middle of a sequence shifts every id
 * after it.
 *
 * WHAT IT DOES NOT DO. Nothing to the tone. The darkening, the doubling and
 * the reverb are applied at play time by `audio.voiceClip` in
 * js/audio/manager.js, identically for every clip whatever made it - which is
 * the whole reason a set generated one file at a time sounds like one voice.
 * Baking any of it in here would double it up.
 *
 * Windows only: it drives System.Speech through PowerShell. On any other
 * platform, generate the files by hand from the list in
 * with-room-ghost-lines.md.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(HERE, "../../public/games/with-room");
const DEST = join(GAME, "assets/audio/voice/ghost/en");

/** One voice for the whole set. Any other installed voice works; this one is female, which is how the ghost is cast in story/voice.js. */
const VOICE = "Microsoft Zira Desktop";
/** System.Speech rate, -10..10. Slow, but not so slow the consonants smear. */
const RATE = -2;
/**
 * Pitch, as an SSML prosody percentage.
 *
 * Baked in here rather than left to play time because this is the one pitch
 * change available that does NOT also change the duration - the engine
 * resynthesises at a lower fundamental instead of resampling. Measured on this
 * voice: 176 Hz at 0%, 146 Hz at -35%, 132 Hz at -50%.
 *
 * The chain in audio/manager.js then drops it further by playing slow, but
 * every bit of that costs tempo. Taking most of the drop here keeps the ghost
 * deep without making it sluggish.
 */
const PITCH = "-40%";

/** The order the ids are assigned in. Must match js/story/voiceClips.js. */
const SEQUENCE_ORDER = [
  "GHOST_INTRO", "REVEAL",
  "SOLVED_1", "SOLVED_2", "SOLVED_3", "SOLVED_4", "SOLVED_5", "SOLVED_6",
  "FLASHBACK", "ENDLESS", "WHISPERS",
];

/** The ghost's lines from outside script.js, in the same order voiceClips.js lists them. */
const INLINE = [
  "Three seventeen. That one is mine.",
  "You do not know which one she is behind.",
  "You were holding the answer. You put it on a bed.",
];

/* -------------------------------------------------------------------------- *
 * 1. The lines
 * -------------------------------------------------------------------------- */

/**
 * The player's name cannot be in a recording - it does not exist until they
 * type it - so the placeholder is dropped, and the comma that introduced it
 * goes too. A line that was ONLY the name has nothing left to say and is left
 * to the synthesiser at run time, which is the only thing that knows it.
 */
function speakable(en) {
  const out = (en || "").replace(/[,\s]*\{name\}/g, "").replace(/\s+/g, " ").trim();
  return /[a-z0-9]/i.test(out) ? out : null;
}

const script = await import(pathToFileURL(join(GAME, "js/story/script.js")).href);

const jobs = [];
const skipped = [];
let n = 0;

function consider(en, emo) {
  const id = `g${String(n).padStart(2, "0")}`;
  if (!en) return skipped.push([id, "wordless laugh - built from oscillators at play time"]);
  const text = speakable(en);
  if (!text) return skipped.push([id, `only the player's name: ${JSON.stringify(en)}`]);
  jobs.push({ id, text, emo, reworded: text !== en ? en : null });
}

for (const name of SEQUENCE_ORDER) {
  const lines = script[name];
  if (!Array.isArray(lines)) continue;
  for (const line of lines) {
    if (!line || line.who !== "ghost") continue;
    n++;
    consider(line.en, line.emo);
  }
}
for (const en of INLINE) {
  n++;
  consider(en, "inline");
}

console.log(`${n} ghost ids, ${jobs.length} to speak, ${skipped.length} skipped`);
for (const [id, why] of skipped) console.log(`  skip ${id}: ${why}`);
for (const j of jobs.filter((j) => j.reworded)) {
  console.log(`  ${j.id} name dropped: ${JSON.stringify(j.reworded)} -> ${JSON.stringify(j.text)}`);
}

/* -------------------------------------------------------------------------- *
 * 2. Speak them
 * -------------------------------------------------------------------------- */

const work = mkdtempSync(join(tmpdir(), "ghost-voice-"));
const raw = join(work, "raw");
mkdirSync(raw, { recursive: true });

// Tab-separated rather than passed as arguments: forty lines of dialogue
// through a command line is forty chances for a quote or an apostrophe to be
// eaten by a shell.
//
// Escaped for XML on the way in, because the lines are spoken through SSML.
// None of them currently contains an ampersand or an angle bracket; one
// written later might, and the failure would be a parse error in PowerShell
// rather than anything that points at the line that caused it.
const xml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
writeFileSync(join(work, "lines.tsv"), jobs.map((j) => `${j.id}\t${xml(j.text)}`).join("\n") + "\n", "utf8");

const ps = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice(${JSON.stringify(VOICE)})
$s.Volume = 100
foreach ($line in Get-Content ${JSON.stringify(join(work, "lines.tsv"))} -Encoding UTF8) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $parts = $line -split "\`t", 2
  $s.SetOutputToWaveFile((Join-Path ${JSON.stringify(raw)} ($parts[0] + ".wav")))
  # SSML rather than Speak(), because prosody pitch is only reachable this way.
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><prosody pitch='${PITCH}' rate='${RATE}'>" + $parts[1] + "</prosody></speak>"
  $s.SpeakSsml($ssml)
  $s.SetOutputToNull()
}
$s.Dispose()
`;

console.log(`\nspeaking with ${VOICE}, rate ${RATE}, pitch ${PITCH}...`);
execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "inherit" });

/* -------------------------------------------------------------------------- *
 * 3. Trim, level, write
 *
 * The synthesiser's output is not ready to be a game asset. It has a variable
 * lead-in of silence, close to a second of variable tail, and a peak that
 * drifts between lines. All three read as inconsistency in the one place
 * consistency is the point: the subtitle starts when the clip starts, so a
 * lead-in that differs per line is the ghost being out of time with itself.
 * -------------------------------------------------------------------------- */

/** Roughly -46 dBFS: below this is the engine's noise floor, not a consonant. */
const GATE = 0.005 * 32767;
const LEAD = 0.012; // kept before the first word, so no plosive is clipped
const TAIL = 0.07; // kept after the last, so the game's reverb has a tail to work with
const PEAK = 0.891 * 32767; // -1 dBFS, leaving room for the game's own gain

function readWav(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= bytes.length) {
    const id = bytes.toString("ascii", pos, pos + 4);
    const size = bytes.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = { format: bytes.readUInt16LE(body), rate: bytes.readUInt32LE(body + 4), bits: bytes.readUInt16LE(body + 14) };
    } else if (id === "data") {
      data = bytes.subarray(body, Math.min(body + size, bytes.length));
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("missing fmt or data chunk");
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`unsupported: format ${fmt.format}, ${fmt.bits}-bit`);
  const samples = new Int16Array(data.length >> 1);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2);
  return { ...fmt, samples };
}

function writeWav(rate, samples) {
  const header = Buffer.alloc(44);
  const bytes = samples.length * 2;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(bytes, 40);
  const body = Buffer.alloc(bytes);
  for (let i = 0; i < samples.length; i++) body.writeInt16LE(samples[i], i * 2);
  return Buffer.concat([header, body]);
}

mkdirSync(DEST, { recursive: true });
let written = 0;
let total = 0;

console.log("");
for (const file of readdirSync(raw).filter((f) => f.endsWith(".wav")).sort()) {
  const { samples, rate } = readWav(readFileSync(join(raw, file)));

  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < GATE) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < GATE) last--;
  if (first >= last) {
    console.log(`  ${file.padEnd(9)} silent - skipped`);
    continue;
  }

  const cut = samples.slice(
    Math.max(0, first - Math.round(LEAD * rate)),
    Math.min(samples.length, last + Math.round(TAIL * rate)),
  );

  let peak = 0;
  for (const s of cut) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 0 ? Math.min(4, PEAK / peak) : 1;

  // Short fades, because a buffer that starts at full gain clicks if the
  // generator left a non-zero first sample - and most of them do.
  const fadeIn = Math.round(0.008 * rate);
  const fadeOut = Math.round(0.035 * rate);
  const out = new Int16Array(cut.length);
  for (let i = 0; i < cut.length; i++) {
    let g = scale;
    if (i < fadeIn) g *= i / fadeIn;
    const back = cut.length - 1 - i;
    if (back < fadeOut) g *= back / fadeOut;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(cut[i] * g)));
  }

  const bytes = writeWav(rate, out);
  writeFileSync(join(DEST, file), bytes);
  written++;
  total += bytes.length;
  console.log(
    `  ${file.padEnd(9)} ${(samples.length / rate).toFixed(2)}s -> ${(out.length / rate).toFixed(2)}s, gain x${scale.toFixed(2)}`,
  );
}

rmSync(work, { recursive: true, force: true });

console.log(`\n${written} clips, ${(total / 1048576).toFixed(1)} MB -> ${DEST}`);
console.log("Audition them at /games/with-room/voice-preview.html");
