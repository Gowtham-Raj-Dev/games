/**
 * THE ROOM THAT GETS BIGGER - audio.
 *
 * Every sound in this game is synthesised at runtime. There is not a single
 * audio file in the project and there never will be one: the room changes size
 * nine times, and a sample library that covered "this impact, in this room, at
 * this size" would be larger than the rest of the game put together and still
 * wrong at the sizes in between. Oscillators, noise and filters interpolate for
 * free.
 *
 * The graph is built once and then only ever has its AudioParams moved. Nothing
 * continuous is ever rebuilt - a new BufferSource for a sound that is already
 * playing is the classic way to turn a quiet hum into a chorus of hums, and the
 * sibling game in this repo (velocity-rift) learned that the expensive way. The
 * one-shots are the exception: they are short-lived by definition, so they
 * create three or four nodes, stop() themselves and let the GC have them.
 *
 * ROUTING
 *
 *   destination
 *   └── master ................ the one fader that is allowed to reach 0
 *       ├── sfx
 *       │   ├── comp .......... one-shots, footsteps, stingers (stacks up)
 *       │   ├── rumComp ....... the transition rumble, on its own slow comp
 *       │   ├── bodyBus ....... breath + heartbeat, uncompressed, no reverb
 *       │   ├── uiBus ......... menu sounds, uncompressed, no reverb
 *       │   └── verbWet ....... the room tail
 *       └── music
 *           └── ambDuck ....... the room tone, and the thing that goes silent
 *
 * Breath and heartbeat bypass the compressor and the reverb on purpose. They
 * are inside the player's skull, not in the room; putting them in the reverb
 * makes the player sound like somebody standing behind them, which was briefly
 * terrifying for the wrong reason, and putting them through the compressor made
 * them pump every time the walls moved.
 *
 * Nothing here may throw. A device with no Web Audio, a context blocked until a
 * gesture arrives, a context closed by the OS - all of them have to degrade to
 * a silent game, never a broken one, so every entry point checks the context
 * first and returns.
 */

import {
  DEFAULT_SETTINGS,
  ROOM_STATES,
  EXPANSION,
  SHRINK,
} from "../core/config.js";
import { EV, on } from "../core/bus.js";
import { clamp, clamp01, lerp } from "../core/maths.js";

/* ========================================================================== *
 * CONSTANTS
 * ========================================================================== */

/**
 * The floor used everywhere a value has to stay positive.
 *
 * `exponentialRampToValueAtTime` throws on a target of zero and does nothing
 * useful from a current value of zero, so every envelope in this file lives
 * between EPS and its peak rather than between 0 and its peak.
 */
const EPS = 0.0001;

/** Left on the master so a stinger landing on top of a rumble cannot clip. */
const HEADROOM = 0.88;

/** Lookahead scheduling, exactly as velocity-rift does it. */
const SCHED_MS = 25;
const SCHED_AHEAD = 0.12;

/** Room-tone crossfade. Two seconds reads as the room settling, not as a cut. */
const XFADE = 2.0;
/** setTargetAtTime time-constant that lands ~97% of the way in XFADE. */
const XFADE_TC = XFADE / 3.4;

/** Speed of sound, for deriving room modes and echo times from the metres. */
const C_AIR = 343;

/* ========================================================================== *
 * STATE
 *
 * Module scope rather than fields on the exported object, so that every public
 * method can be passed around unbound - `addFrame(audio.tick, ORDER.AUDIO)`
 * has to work, and it will not if `tick` needs a `this`.
 * ========================================================================== */

/** @type {AudioContext|null} */
let ctx = null;

/** The node graph. Populated once by `build()`, never replaced. */
const G = {
  running: [], // every always-on source, so dispose() can stop them
  fdnDelay: [],
  fdnFb: [],
  fdnLp: [],
};

/** Scalars. Deliberately a single flat object so `tick` never allocates. */
const S = {
  built: false,
  bound: false,
  /** Suspended by us, as opposed to by the browser. Drives auto-resume. */
  selfSuspended: false,
  /** The pause menu is open: ducked, but still audible so menu clicks work. */
  menuPaused: false,

  roomId: -1,
  /** 0..1 perceptual room size, shared by reverb sends and footstep tails. */
  size: 0,

  /** A room requested before the context existed, replayed by init(). */
  wantRoom: -1,
  wantW: 4,
  wantD: 4,
  wantH: 2.5,

  breathTarget: 0,
  breathLevel: 0,
  heartTarget: 0,
  heartLevel: 0,
  nextBreath: 0,
  nextBeat: 0,

  /** Context time the current rumble finishes. 0 when nothing is moving. */
  rumbleUntil: 0,

  tickAcc: 0,
};

/** Current fader positions, 0..1. Updated by settings as well as by callers. */
const vol = {
  master: DEFAULT_SETTINGS.masterVolume,
  music: DEFAULT_SETTINGS.musicVolume,
  sfx: DEFAULT_SETTINGS.sfxVolume,
};

/** Ambience voices, swapped on every room change. */
let ambA = null;
let ambB = null;
/** The voice currently audible. The other one is the one being retuned. */
let ambFront = null;

/**
 * Reused room-tone profile.
 *
 * One object, overwritten in place. Not because a room change is hot - it
 * happens nine times a game - but because a second allocation site is a second
 * thing to notice in a heap profile, and this file is meant to have none.
 */
const prof = {
  hum: 68,
  humLevel: 0.1,
  subLevel: 0.05,
  droneCut: 420,
  droneQ: 0.9,
  noiseF: 900,
  noiseQ: 2,
  noiseLevel: 0.05,
  lfoRate: 0.2,
  lfoDepth: 80,
  tremDepth: 0.1,
  fdnTime: 0.024,
  fdnFb: 0.35,
  fdnWet: 0.06,
  verbWet: 0.05,
};

/**
 * Sources belonging to a running rumble, so stopRumble() can kill them dead.
 *
 * `track` is on only while a rumble is being scheduled. A rumble lays its
 * creaks and its final impact down seconds of context time in advance, and a
 * bus fade does not unschedule anything - without this list, cancelling a
 * transition half way through still produced the sound of the walls arriving.
 */
const pending = [];
let track = false;

/** Bus unsubscribe functions. */
const unbind = [];

/** Scratch dimensions, so replaying a deferred room change allocates nothing. */
const tmpDims = { w: 4, d: 4, h: 2.5 };

let schedTimer = 0;

/* ========================================================================== *
 * NODE HELPERS
 *
 * Terse on purpose. The interesting part of this file is the sound design, and
 * four lines of createGain/value/connect per voice buries it.
 * ========================================================================== */

const gn = (v) => {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
};

const bq = (type, f, q) => {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  if (q !== undefined) b.Q.value = q;
  return b;
};

const osc = (type, f) => {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  return o;
};

const src = (buf, loop) => {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = !!loop;
  return s;
};

/** Start an always-on source and remember it for dispose(). */
function hold(node) {
  try {
    node.start();
  } catch {
    /* Already started. Harmless, and not worth a branch at every call site. */
  }
  G.running.push(node);
  return node;
}

/**
 * Attack/decay envelope on a gain param.
 *
 * Linear up, exponential down. Exponential attacks on a percussive sound read
 * as a fade-in no matter how short they are; exponential decays are the only
 * ones that sound like something stopping.
 */
function env(param, t, peak, attack, decay) {
  const p = peak > EPS * 2 ? peak : EPS * 2;
  param.cancelScheduledValues(t);
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(p, t + attack);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay);
}

/**
 * A struck partial: one oscillator with a percussive envelope.
 *
 * Returns the oscillator so the caller can bend it, which is the difference
 * between a drip and a beep.
 */
function partial(t, f, peak, decay, type, dest, send) {
  const o = osc(type || "sine", f);
  const g = gn(EPS);
  env(g.gain, t, peak, 0.004, decay);
  o.connect(g);
  g.connect(dest || G.comp);
  if (send) g.connect(send);
  o.start(t);
  o.stop(t + decay + 0.06);
  if (track) pending.push(o);
  return o;
}

/** A pitched thump: sine with a falling pitch. Every impact in the game has one. */
function thump(t, f0, f1, peak, decay, dest, send) {
  const o = partial(t, f0, peak, decay, "sine", dest, send);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 8), t + decay * 0.85);
  return o;
}

/**
 * A filtered noise burst. The backbone of every non-tonal sound here.
 *
 * Returns the filter, because what makes one burst a footstep and another a
 * door slam is almost entirely what happens to the cutoff afterwards.
 */
function burst(t, peak, attack, decay, ftype, f, q, dest, send, buf) {
  const b0 = buf || G.noise;
  const s = src(b0, false);
  const b = bq(ftype, f, q);
  const g = gn(EPS);
  const dur = attack + decay + 0.06;
  env(g.gain, t, peak, attack, decay);
  s.connect(b);
  b.connect(g);
  g.connect(dest || G.comp);
  if (send) g.connect(send);
  // Random read offset: starting every burst at sample zero of the same buffer
  // gives identical noise every time, and the ear picks that out astonishingly
  // fast - it stops sounding like noise and starts sounding like a sample.
  //
  // The offset is bounded by what is left in the buffer, because a BufferSource
  // that runs off the end just stops - which turned the four-second game-over
  // swell into a two-second one, intermittently, depending on the random value.
  s.start(t, Math.random() * Math.max(0, (b0.duration - dur) * 0.92));
  s.stop(t + dur);
  if (track) pending.push(s);
  return b;
}

/** Perceptual fader curve. A linear gain slider feels dead over its top half. */
const curve = (v) => {
  const x = clamp01(v);
  return x * x;
};

const live = () => !!ctx && ctx.state !== "closed";
const ready = () => !!ctx && ctx.state === "running";
const rnd = (a, b) => a + Math.random() * (b - a);

/* ========================================================================== *
 * BUFFERS
 * ========================================================================== */

/** Flat white noise. Filters turn it into everything else. */
function whiteBuffer(seconds) {
  // Five seconds, not one. The longest single burst in the game is the
  // game-over swell at about 3.5 s, and a buffer shorter than the longest
  // burst cuts it off silently.
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Brown noise, for the rumble bed.
 *
 * White noise lowpassed hard still sounds like hiss with the top taken off.
 * Integrated noise has real low-frequency wander in it, which is what makes a
 * rumble read as mass moving rather than as a filter sweep.
 */
function brownBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

/**
 * A generated impulse response.
 *
 * Built once, at init, and never rebuilt - the room changes size nine times and
 * regenerating a 2.4 s stereo IR on a phone each time would be a visible hitch
 * at exactly the moment the player is meant to be looking around. Room size is
 * expressed by the wet level and by the feedback-delay network instead, which
 * are both free to move.
 *
 * The one-pole lowpass inside the loop is what separates "a room" from "a fizzy
 * noise burst": real tails lose their top end as they decay.
 */
function buildIR(seconds, decayPow) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let z = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Coefficient falls with time, so the tail darkens as it dies.
      const a = 0.5 - 0.42 * t;
      z += a * (Math.random() * 2 - 1 - z);
      d[i] = z * Math.pow(1 - t, decayPow);
    }
    // A handful of discrete early reflections, at different offsets per
    // channel. Without them the convolver sounds like a plate; with them it
    // sounds like surfaces at distances.
    const taps = c === 0 ? 7 : 11;
    for (let k = 1; k <= 5; k++) {
      const at = Math.floor(rate * 0.004 * k * taps * 0.21);
      if (at < len) d[at] += (Math.random() * 2 - 1) * (0.6 / k);
    }
  }
  return buf;
}

/* ========================================================================== *
 * GRAPH
 * ========================================================================== */

/** Irrational-ish ratios, so the four delay lines never line up into a pitch. */
const FDN_TAPS = [1, 1.47, 1.93, 2.61];

function build() {
  G.noise = whiteBuffer(5);
  G.brown = brownBuffer(5);

  G.master = gn(curve(vol.master) * HEADROOM);
  G.master.connect(ctx.destination);

  G.sfx = gn(curve(vol.sfx));
  G.sfx.connect(G.master);
  G.music = gn(curve(vol.music) * 0.9);
  G.music.connect(G.master);

  // Fast comp for the one-shot pile-up: a dropped object landing during a
  // stinger during a footstep is three transients inside 40 ms.
  G.comp = ctx.createDynamicsCompressor();
  G.comp.threshold.value = -16;
  G.comp.knee.value = 20;
  G.comp.ratio.value = 5;
  G.comp.attack.value = 0.005;
  G.comp.release.value = 0.25;
  G.comp.connect(G.sfx);

  // The rumble gets its own, far slower. A 5 ms attack on a 30 Hz sine chews
  // the waveform into distortion; the compressor ends up modulating at the
  // frequency it is meant to be controlling.
  G.rumComp = ctx.createDynamicsCompressor();
  G.rumComp.threshold.value = -10;
  G.rumComp.knee.value = 14;
  G.rumComp.ratio.value = 4;
  G.rumComp.attack.value = 0.02;
  G.rumComp.release.value = 0.35;
  G.rumComp.connect(G.sfx);

  G.bodyBus = gn(1); // breath + heart: no comp, no reverb
  G.bodyBus.connect(G.sfx);
  G.uiBus = gn(0.9); // menu: non-diegetic, so it is not in the room either
  G.uiBus.connect(G.sfx);

  /* --- reverb ----------------------------------------------------------- */

  G.verbIn = gn(1);
  G.verbSize = gn(0.05); // room size
  G.verbWet = gn(1); // duck, used by the post-rumble silence
  try {
    G.conv = ctx.createConvolver();
    G.conv.normalize = true;
    G.conv.buffer = buildIR(2.4, 2.6);
    G.verbIn.connect(G.conv);
    G.conv.connect(G.verbSize);
  } catch {
    // No ConvolverNode, or an IR the browser refused. The game is still fully
    // playable dry, so fall through to a direct connection at a low level
    // rather than leaving a dangling send.
    G.verbIn.connect(G.verbSize);
  }
  G.verbSize.connect(G.verbWet);
  // The tail rides the sfx fader rather than the master. Mostly it is impacts
  // and footsteps, and a tail that outlives its own bus fade sounds broken.
  G.verbWet.connect(G.sfx);

  // Three fixed send levels instead of a gain node per one-shot. Saves an
  // allocation on every footstep and makes the mix decisions explicit.
  G.sendSoft = gn(0.12);
  G.sendMid = gn(0.34);
  G.sendBig = gn(0.75);
  G.sendSoft.connect(G.verbIn);
  G.sendMid.connect(G.verbIn);
  G.sendBig.connect(G.verbIn);

  /* --- ambience --------------------------------------------------------- */

  G.ambBus = gn(1);
  G.ambDuck = gn(1);
  G.ambBus.connect(G.ambDuck);
  G.ambDuck.connect(G.music);
  G.ambSend = gn(0.25);
  G.ambDuck.connect(G.ambSend);
  G.ambSend.connect(G.verbIn);

  // Feedback-delay network. This is the "size" impression: four short delays
  // whose times are literally how long sound takes to cross the room, fed back
  // through a lowpass. It costs four delay lines instead of a second convolver,
  // and unlike a convolver its delay times can be swept while the walls move -
  // the pitch smear that causes is not an artefact, it is the sound of the room
  // changing shape, and it is the single cheapest trick in this file.
  G.fdnIn = gn(1);
  G.fdnOut = gn(0.06);
  G.ambBus.connect(G.fdnIn);
  for (let i = 0; i < 4; i++) {
    const d = ctx.createDelay(0.5);
    d.delayTime.value = 0.024 * FDN_TAPS[i];
    const lp = bq("lowpass", 2600, 0.7);
    const fb = gn(0.35);
    G.fdnIn.connect(d);
    d.connect(lp);
    lp.connect(G.fdnOut);
    lp.connect(fb);
    G.fdnDelay.push(d);
    G.fdnLp.push(lp);
    G.fdnFb.push(fb);
  }
  // Ring topology: a signal has to cross all four lines to come back, so the
  // loop gain is fb^4 and 0.86 is still comfortably stable.
  for (let i = 0; i < 4; i++) G.fdnFb[i].connect(G.fdnDelay[(i + 1) % 4]);
  G.fdnOut.connect(G.ambDuck);

  ambA = makeAmbienceVoice();
  ambB = makeAmbienceVoice();
  ambFront = ambA;

  /* --- rumble ----------------------------------------------------------- */

  G.rumBus = gn(1);
  G.rumBus.connect(G.rumComp);

  G.rumSubG = gn(EPS);
  G.rumSubG.connect(G.rumBus);
  G.rumSubA = hold(osc("sine", 30));
  G.rumSubB = hold(osc("sine", 45));
  G.rumSubA.connect(G.rumSubG);
  G.rumSubBG = gn(0);
  G.rumSubB.connect(G.rumSubBG);
  G.rumSubBG.connect(G.rumBus);

  // Concrete on concrete. Brown noise through a bandpass that sweeps and
  // tightens: the rising Q is the grind "focusing", which is what sells stone
  // being dragged rather than wind.
  G.grindSrc = hold(src(G.brown, true));
  G.grindBp = bq("bandpass", 120, 0.8);
  G.grindHp = bq("highpass", 38, 0.7);
  G.grindTrem = gn(1);
  G.grindG = gn(EPS);
  G.grindSrc.connect(G.grindHp);
  G.grindHp.connect(G.grindBp);
  G.grindBp.connect(G.grindTrem);
  G.grindTrem.connect(G.grindG);
  G.grindG.connect(G.rumBus);
  G.grindG.connect(G.sendMid);

  // Irregular amplitude on the grind, from a slow LFO at a frequency that has
  // no relationship to anything else. Steady noise reads as a loop in about
  // two seconds.
  //
  // It modulates a tremolo node sitting BEFORE the envelope gain, not the
  // envelope gain itself. A connected signal is summed with the param's
  // automation value, so an LFO on a gain resting at zero does not fade out
  // with it - it swings either side of zero and leaks the grind bed into every
  // quiet moment in the game.
  G.grindLfo = hold(osc("sine", 0.37));
  G.grindLfoG = gn(0.22);
  G.grindLfo.connect(G.grindLfoG);
  G.grindLfoG.connect(G.grindTrem.gain);

  /* --- body: breath and heartbeat --------------------------------------- */

  G.brSrc = hold(src(G.noise, true));
  G.brBand = bq("bandpass", 500, 1.1);
  G.brG = gn(EPS);
  G.brSrc.connect(G.brBand);
  G.brBand.connect(G.brG);
  G.brG.connect(G.bodyBus);

  G.heartLp = bq("lowpass", 190, 0.9);
  G.heartG = gn(1);
  G.heartLp.connect(G.heartG);
  G.heartG.connect(G.bodyBus);

  buildGhost();
  buildBeds();

  S.built = true;
}

/* -------------------------------------------------------------------------- *
 * The ghost bus
 *
 * Everything the ghost is, apart from the words themselves. The words come
 * from the browser's speech synthesiser, which cannot be routed into an
 * AudioContext in any shipping browser - so the ghost's voice is really two
 * sounds arriving together, and this is the half we own.
 *
 * It is built once and left resident at silence because it has to be able to
 * start inside the same frame as an utterance. Allocating three filters and a
 * convolver send at the moment the ghost speaks put a reliable 10-20 ms hitch
 * exactly where the sound had to be tight.
 * -------------------------------------------------------------------------- */

function buildGhost() {
  G.ghostBus = gn(1);
  // Its own bus, pre-compressor: the sub content is deliberately loud and
  // feeding it through the one-shot compressor pumped every other sound in
  // the room in time with the ghost's sentences.
  G.ghostBus.connect(G.sfx);
  // A long send, always. Nothing the ghost does is ever dry - it is the only
  // thing in the game that sounds like it is in a bigger room than the player.
  G.ghostBus.connect(G.sendBig);

  /* --- sub-bass under the voice ----------------------------------------- */
  // 41 Hz and a fifth below the lowest note most speakers can reproduce as a
  // pitch; on a phone it is felt as pressure rather than heard, which is the
  // intent. The two detuned oscillators beat slowly against each other so it
  // never sits still.
  G.gSubG = gn(EPS);
  G.gSubG.connect(G.ghostBus);
  G.gSubA = hold(osc("sine", 41));
  G.gSubB = hold(osc("sine", 41.7));
  G.gSubA.connect(G.gSubG);
  G.gSubB.connect(G.gSubG);

  /* --- breath / whisper bed -------------------------------------------- */
  // White noise through a narrow bandpass sweeping around the formant region
  // of a human whisper. A whisper IS noise shaped by a mouth, so shaping noise
  // is not an approximation of one - it is the same mechanism.
  G.gAirSrc = hold(src(G.noise, true));
  G.gAirBp = bq("bandpass", 1150, 1.6);
  G.gAirHp = bq("highpass", 320, 0.7);
  G.gAirG = gn(EPS);
  G.gAirSrc.connect(G.gAirHp);
  G.gAirHp.connect(G.gAirBp);
  G.gAirBp.connect(G.gAirG);
  G.gAirG.connect(G.ghostBus);

  // A slow sweep on the formant, so the whisper bed reads as a mouth moving
  // rather than as a hiss. Rate is prime-ish against everything else in the
  // mix for the same reason the grind LFO is.
  G.gAirLfo = hold(osc("sine", 0.23));
  G.gAirLfoG = gn(260);
  G.gAirLfo.connect(G.gAirLfoG);
  G.gAirLfoG.connect(G.gAirBp.frequency);

  /* --- ring modulator -------------------------------------------------- */
  // The classic "possessed" artefact: amplitude modulation at a frequency low
  // enough to be heard as roughness rather than as a second pitch. It is
  // applied to the whisper bed only. Ring-modulating the sub turns it to mud.
  G.gRingG = gn(0);
  G.gRing = hold(osc("sine", 27));
  G.gRing.connect(G.gRingG);
  G.gRingG.connect(G.gAirG.gain);
}

/* -------------------------------------------------------------------------- *
 * Cutscene beds
 *
 * The car scene needs rain, an engine and tyre noise; the flashback needs
 * wind across a field. They are LOOPS in the sense that they never stop, but
 * nothing about them repeats: each is noise through a filter being modulated,
 * so there is no loop point for the ear to find. A two-minute drive on a
 * five-second sample would announce itself in the first fifteen seconds.
 * -------------------------------------------------------------------------- */

function buildBeds() {
  G.bedBus = gn(1);
  // Ambience fader, not effects: this is weather and machinery, which is the
  // same category as room tone for a player deciding what to turn down.
  G.bedBus.connect(G.ambDuck);

  /* --- rain ------------------------------------------------------------- */
  // Two layers. Wide-band hiss for the air, and a resonant band for the
  // drumming on the roof directly above the listener's head.
  G.rainSrc = hold(src(G.noise, true));
  G.rainHp = bq("highpass", 700, 0.6);
  G.rainShelf = bq("highshelf", 4200, 0.7);
  G.rainShelf.gain.value = -6;
  G.rainG = gn(EPS);
  G.rainSrc.connect(G.rainHp);
  G.rainHp.connect(G.rainShelf);
  G.rainShelf.connect(G.rainG);
  G.rainG.connect(G.bedBus);

  G.roofSrc = hold(src(G.noise, true));
  G.roofBp = bq("bandpass", 2400, 1.1);
  G.roofG = gn(EPS);
  G.roofSrc.connect(G.roofBp);
  G.roofBp.connect(G.roofG);
  G.roofG.connect(G.bedBus);

  /* --- engine ----------------------------------------------------------- */
  // A diesel four at idle: a sawtooth at the firing frequency, a second at
  // twice it, and brown noise for the induction. All three move together with
  // `engineRpm`, which is what makes a lift of the throttle audible.
  G.engA = hold(osc("sawtooth", 46));
  G.engB = hold(osc("sawtooth", 92));
  G.engLp = bq("lowpass", 340, 1.4);
  G.engG = gn(EPS);
  G.engBG = gn(0.45);
  G.engA.connect(G.engLp);
  G.engB.connect(G.engBG);
  G.engBG.connect(G.engLp);
  G.engLp.connect(G.engG);
  G.engG.connect(G.bedBus);

  G.indSrc = hold(src(G.brown, true));
  G.indBp = bq("bandpass", 180, 0.8);
  G.indG = gn(EPS);
  G.indSrc.connect(G.indBp);
  G.indBp.connect(G.indG);
  G.indG.connect(G.bedBus);

  /* --- tyres on wet tarmac --------------------------------------------- */
  G.tyreSrc = hold(src(G.noise, true));
  G.tyreBp = bq("bandpass", 900, 0.55);
  G.tyreG = gn(EPS);
  G.tyreSrc.connect(G.tyreBp);
  G.tyreBp.connect(G.tyreG);
  G.tyreG.connect(G.bedBus);

  /* --- wind ------------------------------------------------------------- */
  G.windSrc = hold(src(G.brown, true));
  G.windBp = bq("bandpass", 420, 0.7);
  G.windG = gn(EPS);
  G.windSrc.connect(G.windBp);
  G.windBp.connect(G.windG);
  G.windG.connect(G.bedBus);

  // Gusts: a slow random-ish sweep of both the filter and the level, so the
  // wind rises and falls instead of blowing at one constant strength.
  G.windLfo = hold(osc("sine", 0.11));
  G.windLfoG = gn(180);
  G.windLfo.connect(G.windLfoG);
  G.windLfoG.connect(G.windBp.frequency);
  G.windLfo2 = hold(osc("sine", 0.071));
  G.windLfo2G = gn(0.3);
  G.windLfo2.connect(G.windLfo2G);
  // Into a tremolo stage rather than the envelope gain, for the same reason
  // the grind LFO is: an LFO summed onto a gain resting at zero leaks.
  G.windTrem = gn(1);
  G.windBp.disconnect();
  G.windBp.connect(G.windTrem);
  G.windTrem.connect(G.windG);
  G.windLfo2G.connect(G.windTrem.gain);
}

/**
 * One room-tone voice. Two exist; one is always being retuned in silence while
 * the other plays, which is the whole crossfade mechanism.
 */
function makeAmbienceVoice() {
  const v = {};
  v.out = gn(0); // the only gain the crossfade touches
  v.trem = gn(1);
  v.tone = bq("lowpass", 420, 0.9);

  v.hum = hold(osc("sine", 68));
  // 2.007 rather than 2: the ~0.5 Hz beat between them is why the hum sounds
  // like a building and not like a test tone.
  v.hum2 = hold(osc("triangle", 136.5));
  v.humG = gn(0.1);
  v.sub = hold(osc("sine", 34));
  v.subG = gn(0.04);

  v.noise = hold(src(G.noise, true));
  v.band = bq("bandpass", 900, 2);
  v.noiseG = gn(0.05);

  v.lfo = hold(osc("sine", 0.2));
  v.lfoG = gn(80);
  v.lfoG2 = gn(200);
  v.trm = hold(osc("sine", 0.13));
  v.trmG = gn(0.1);

  v.hum.connect(v.humG);
  v.hum2.connect(v.humG);
  v.humG.connect(v.tone);
  v.sub.connect(v.subG);
  v.subG.connect(v.tone);
  v.tone.connect(v.trem);

  // The noise floor skips the drone's lowpass. In the 4 m cell the floor is the
  // close, slightly bright hiss of air right next to your head, and running it
  // through a 400 Hz lowpass removes exactly the part that reads as "close".
  v.noise.connect(v.band);
  v.band.connect(v.noiseG);
  v.noiseG.connect(v.trem);

  v.trem.connect(v.out);
  v.out.connect(G.ambBus);

  v.lfo.connect(v.lfoG);
  v.lfoG.connect(v.tone.frequency);
  v.lfo.connect(v.lfoG2);
  v.lfoG2.connect(v.band.frequency);
  // Tremolo sits before the crossfade fader, so a voice faded to zero is truly
  // silent. Modulating the fader itself would leak the LFO through it.
  v.trm.connect(v.trmG);
  v.trmG.connect(v.trem.gain);
  return v;
}

function tuneVoice(v, p, t, tc) {
  v.hum.frequency.setTargetAtTime(p.hum, t, tc);
  v.hum2.frequency.setTargetAtTime(p.hum * 2.007, t, tc);
  v.sub.frequency.setTargetAtTime(p.hum * 0.5, t, tc);
  v.humG.gain.setTargetAtTime(p.humLevel, t, tc);
  v.subG.gain.setTargetAtTime(p.subLevel, t, tc);
  v.tone.frequency.setTargetAtTime(p.droneCut, t, tc);
  v.tone.Q.setTargetAtTime(p.droneQ, t, tc);
  v.band.frequency.setTargetAtTime(p.noiseF, t, tc);
  v.band.Q.setTargetAtTime(p.noiseQ, t, tc);
  v.noiseG.gain.setTargetAtTime(p.noiseLevel, t, tc);
  v.lfo.frequency.setTargetAtTime(p.lfoRate, t, tc);
  v.lfoG.gain.setTargetAtTime(p.lfoDepth, t, tc);
  v.lfoG2.gain.setTargetAtTime(p.lfoDepth * 2.4, t, tc);
  v.trm.frequency.setTargetAtTime(p.lfoRate * 0.63, t, tc);
  v.trmG.gain.setTargetAtTime(p.tremDepth, t, tc);
}

/* ========================================================================== *
 * ROOM TONE
 * ========================================================================== */

/**
 * Derive a room tone from metres.
 *
 * Two numbers are taken from physics rather than from taste, because they are
 * the ones the ear checks:
 *
 *   hum      the lowest vertical standing wave, c / 2h. A 2.5 m ceiling rings
 *            at 69 Hz, and that really is why small concrete rooms hum where
 *            they do. Floored at 29 Hz, below which it stops being a pitch and
 *            starts being a pressure.
 *   fdnTime  how long sound takes to cross the room, span / c. 4 m is 12 ms,
 *            which the ear hears as a tight box rather than as an echo, and
 *            that is correct.
 *
 * Everything else is mix: big rooms get more sub, a wider and lower noise bed,
 * slower modulation and far more wet, because distance is mostly the loss of
 * high frequencies and the arrival of everything slightly late.
 */
function profileFor(w, d, h) {
  const span = Math.max(w, d);
  // Log scale. The step from 4 m to 6 m is a far bigger change to the ear than
  // the step from 120 m to 250 m, and a linear map gets that exactly backwards.
  const size = clamp01(Math.log(span / 4) / Math.log(250 / 4));
  S.size = size;

  prof.hum = clamp(C_AIR / (2 * Math.max(h, 1)), 29, 115);
  prof.humLevel = lerp(0.085, 0.052, size);
  prof.subLevel = lerp(0.015, 0.1, size);
  prof.droneCut = lerp(540, 230, size);
  prof.droneQ = lerp(2.4, 0.7, size);
  prof.noiseF = lerp(1250, 380, size);
  prof.noiseQ = lerp(2.6, 0.4, size);
  prof.noiseLevel = lerp(0.05, 0.085, size);
  prof.lfoRate = lerp(0.33, 0.055, size);
  prof.lfoDepth = lerp(130, 55, size);
  prof.tremDepth = lerp(0.09, 0.22, size);
  prof.fdnTime = clamp(span / C_AIR, 0.012, 0.115);
  prof.fdnFb = lerp(0.3, 0.86, size);
  prof.fdnWet = lerp(0.05, 0.6, size);
  prof.verbWet = lerp(0.04, 0.5, size);
  return prof;
}

function applyRoomProfile(p, t, tc) {
  for (let i = 0; i < 4; i++) {
    // A long time-constant on delayTime is deliberate: the resulting smear is
    // the room resizing. Snapping it would click on all four lines at once.
    G.fdnDelay[i].delayTime.setTargetAtTime(p.fdnTime * FDN_TAPS[i], t, tc);
    G.fdnFb[i].gain.setTargetAtTime(p.fdnFb, t, tc);
    G.fdnLp[i].frequency.setTargetAtTime(lerp(3200, 1500, S.size), t, tc);
  }
  G.fdnOut.gain.setTargetAtTime(p.fdnWet, t, tc);
  G.verbSize.gain.setTargetAtTime(p.verbWet, t, tc);
  G.ambSend.gain.setTargetAtTime(lerp(0.1, 0.4, S.size), t, tc);
}

/* ========================================================================== *
 * RUMBLE - the signature sound
 * ========================================================================== */

/**
 * One structural creak.
 *
 * Two detuned sawtooths through a very resonant bandpass, both sliding upward.
 * The slide is stick-slip: material under load holds, yields, and the pitch
 * rises as the remaining section takes the strain. A single oscillator sounds
 * like a game sound effect; the beating between two does not.
 */
function creak(t, tight) {
  const f = tight ? rnd(170, 640) : rnd(85, 380);
  const dur = tight ? rnd(0.07, 0.22) : rnd(0.12, 0.45);
  const slip = tight ? rnd(0.12, 0.3) : rnd(0.04, 0.14);

  const o1 = osc("sawtooth", f);
  const o2 = osc("sawtooth", f * 1.0145);
  const b = bq("bandpass", f * rnd(2.4, 4.6), rnd(13, 26));
  const g = gn(EPS);

  o1.frequency.setValueAtTime(f, t);
  o1.frequency.linearRampToValueAtTime(f * (1 + slip), t + dur);
  o2.frequency.setValueAtTime(f * 1.0145, t);
  o2.frequency.linearRampToValueAtTime(f * (1 + slip * 1.22), t + dur);
  b.frequency.setValueAtTime(b.frequency.value, t);
  b.frequency.linearRampToValueAtTime(b.frequency.value * 1.35, t + dur);

  env(g.gain, t, (tight ? 0.105 : 0.085) * rnd(0.5, 1.2), 0.006, dur);

  o1.connect(b);
  o2.connect(b);
  b.connect(g);
  g.connect(G.rumBus);
  g.connect(G.sendMid);
  o1.start(t);
  o2.start(t);
  o1.stop(t + dur + 0.06);
  o2.stop(t + dur + 0.06);
  pending.push(o1, o2);
}

/** The walls arriving. `hard` is the shrink version: brighter, shorter, nastier. */
function wallImpact(t, amount, hard) {
  const body = burst(
    t,
    0.85 * amount,
    0.003,
    hard ? 0.5 : 0.75,
    "lowpass",
    hard ? 520 : 260,
    0.9,
    G.rumBus,
    hard ? G.sendBig : G.sendMid,
    G.brown
  );
  body.frequency.exponentialRampToValueAtTime(90, t + (hard ? 0.35 : 0.6));
  thump(
    t,
    hard ? 46 : 35,
    hard ? 27 : 23,
    amount,
    hard ? 0.42 : 0.6,
    G.rumBus,
    G.sendMid
  );
  // Grit shaken off the ceiling. Tiny, and the first thing anyone misses if it
  // is not there - without it the impact stops dead instead of settling.
  burst(
    t + 0.02,
    0.13 * amount,
    0.012,
    hard ? 0.7 : 1.2,
    "highpass",
    2600,
    0.7,
    G.rumBus,
    G.sendSoft
  );
  if (hard) {
    // The crack of the stop. Short, bright, and sent hard to the reverb so the
    // shrink ends in a tail instead of in silence.
    burst(t, 0.5, 0.001, 0.09, "bandpass", 1800, 1.1, G.rumBus, G.sendBig);
  }
}

/**
 * Duck the room tone.
 *
 * setTargetAtTime throughout rather than ramps, because the duck has to be able
 * to start from wherever the previous duck left off - a shrink interrupting an
 * expansion must not re-anchor the gain at 1 and pop.
 */
function duckAmbience(t, to, tc) {
  G.ambDuck.gain.cancelScheduledValues(t);
  G.ambDuck.gain.setTargetAtTime(Math.max(to, EPS), t, tc);
}

function rumbleExpand(t0, sec) {
  const end = t0 + sec;

  // Sub-bass swell, 27 Hz up to 45. Rising pitch is the entire emotional
  // difference between this and the shrink: it reads as release.
  G.rumSubA.frequency.cancelScheduledValues(t0);
  G.rumSubA.frequency.setValueAtTime(27, t0);
  G.rumSubA.frequency.exponentialRampToValueAtTime(45, end);
  // Partner a fifth above, faded in late. Consonant on purpose.
  G.rumSubB.frequency.cancelScheduledValues(t0);
  G.rumSubB.frequency.setValueAtTime(40.5, t0);
  G.rumSubB.frequency.exponentialRampToValueAtTime(67.5, end);
  G.rumSubBG.gain.cancelScheduledValues(t0);
  G.rumSubBG.gain.setValueAtTime(EPS, t0);
  G.rumSubBG.gain.linearRampToValueAtTime(0.12, end - sec * 0.2);
  G.rumSubBG.gain.linearRampToValueAtTime(0.02, end);

  G.rumSubG.gain.cancelScheduledValues(t0);
  G.rumSubG.gain.setValueAtTime(EPS, t0);
  G.rumSubG.gain.linearRampToValueAtTime(0.62, t0 + sec * 0.45);
  G.rumSubG.gain.linearRampToValueAtTime(0.78, end - 0.15);
  G.rumSubG.gain.exponentialRampToValueAtTime(EPS, end + 0.5);

  // Grinding concrete, sweeping up and tightening.
  G.grindBp.frequency.cancelScheduledValues(t0);
  G.grindBp.frequency.setValueAtTime(95, t0);
  G.grindBp.frequency.exponentialRampToValueAtTime(820, end);
  G.grindBp.Q.cancelScheduledValues(t0);
  G.grindBp.Q.setValueAtTime(0.8, t0);
  G.grindBp.Q.linearRampToValueAtTime(6.5, end);
  G.grindG.gain.cancelScheduledValues(t0);
  G.grindG.gain.setValueAtTime(EPS, t0);
  G.grindG.gain.linearRampToValueAtTime(0.5, t0 + sec * 0.5);
  G.grindG.gain.linearRampToValueAtTime(0.16, end);
  G.grindG.gain.exponentialRampToValueAtTime(EPS, end + 0.18);
  G.grindLfoG.gain.setValueAtTime(0.22, t0);

  // Creaks at non-uniform intervals. The squared random is what matters: it
  // clusters a few close together and then leaves a gap, which is how timber
  // and rebar actually behave, and it is also why this never sounds looped.
  let ct = t0 + 0.45;
  while (ct < end - 0.35) {
    creak(ct, false);
    ct += 0.22 + Math.random() * Math.random() * 1.15;
  }

  wallImpact(end, 0.95, false);

  // The payoff. Ducked while the walls travel, then actively taken to silence
  // for 1.2 s after they stop. The silence is the reward - the room just got
  // bigger and for a moment there is nothing in it at all - and it only works
  // if it is real silence rather than a low room tone.
  duckAmbience(t0, 0.3, sec * 0.3);
  duckAmbience(end + 0.04, EPS, 0.09);
  G.verbWet.gain.cancelScheduledValues(end + 0.04);
  G.verbWet.gain.setTargetAtTime(EPS, end + 0.55, 0.12);
  duckAmbience(end + 1.25, 1, 0.45);
  G.verbWet.gain.setTargetAtTime(1, end + 1.25, 0.4);

  return end + 2.1;
}

function rumbleShrink(t0, sec) {
  const end = t0 + sec;

  // The lunge. Expansion opens with a swell; this opens with a hit, because the
  // walls move before the player has decided what is happening.
  burst(t0, 0.55, 0.002, 0.25, "lowpass", 900, 0.8, G.rumBus, G.sendMid);
  thump(t0, 120, 38, 0.8, 0.3, G.rumBus, G.sendSoft);

  // Descending sub, with a second sine a semitone above it. The ~3 Hz beat
  // between 58 and 61.4 Hz is physically uncomfortable, and that is the entire
  // point: a shrink should not merely be a louder expansion.
  G.rumSubA.frequency.cancelScheduledValues(t0);
  G.rumSubA.frequency.setValueAtTime(58, t0);
  G.rumSubA.frequency.exponentialRampToValueAtTime(24, end);
  G.rumSubB.frequency.cancelScheduledValues(t0);
  G.rumSubB.frequency.setValueAtTime(58 * 1.0595, t0);
  G.rumSubB.frequency.exponentialRampToValueAtTime(24 * 1.0595, end);
  G.rumSubBG.gain.cancelScheduledValues(t0);
  G.rumSubBG.gain.setValueAtTime(EPS, t0);
  G.rumSubBG.gain.linearRampToValueAtTime(0.5, t0 + sec * 0.4);
  G.rumSubBG.gain.exponentialRampToValueAtTime(EPS, end + 0.35);

  G.rumSubG.gain.cancelScheduledValues(t0);
  G.rumSubG.gain.setValueAtTime(EPS, t0);
  G.rumSubG.gain.linearRampToValueAtTime(0.9, t0 + 0.12);
  G.rumSubG.gain.linearRampToValueAtTime(0.8, end - 0.1);
  G.rumSubG.gain.exponentialRampToValueAtTime(EPS, end + 0.35);

  // Grind sweeping the other way: closing in, not opening out.
  G.grindBp.frequency.cancelScheduledValues(t0);
  G.grindBp.frequency.setValueAtTime(1250, t0);
  G.grindBp.frequency.exponentialRampToValueAtTime(170, end);
  G.grindBp.Q.cancelScheduledValues(t0);
  G.grindBp.Q.setValueAtTime(1.1, t0);
  G.grindBp.Q.linearRampToValueAtTime(9, end);
  G.grindG.gain.cancelScheduledValues(t0);
  G.grindG.gain.setValueAtTime(EPS, t0);
  G.grindG.gain.linearRampToValueAtTime(0.62, t0 + 0.2);
  G.grindG.gain.linearRampToValueAtTime(0.4, end);
  G.grindG.gain.exponentialRampToValueAtTime(EPS, end + 0.2);
  G.grindLfoG.gain.setValueAtTime(0.34, t0);

  // Tighter, faster, higher creaks - the structure complaining continuously
  // rather than occasionally.
  let ct = t0 + 0.12;
  while (ct < end - 0.2) {
    creak(ct, true);
    ct += 0.09 + Math.random() * Math.random() * 0.36;
  }

  wallImpact(end, 1, true);

  // No payoff silence here. The ambience comes back almost immediately, at the
  // new smaller size, which is the bad news: this is where you live now.
  duckAmbience(t0, 0.25, 0.35);
  duckAmbience(end + 0.02, EPS, 0.06);
  duckAmbience(end + 0.5, 1, 0.3);

  return end + 1.1;
}

/* ========================================================================== *
 * SCHEDULER
 *
 * setInterval, not requestAnimationFrame. rAF stops in a background tab and is
 * capped to the display refresh, so a breath lands late and a heartbeat judders
 * - and both of those are things the player reads as their own body.
 * ========================================================================== */

function startSched() {
  if (schedTimer || !live()) return;
  schedTimer = setInterval(pump, SCHED_MS);
}

function stopSched() {
  if (!schedTimer) return;
  clearInterval(schedTimer);
  schedTimer = 0;
}

/**
 * One breath cycle, scheduled whole.
 *
 * Inhale and exhale are not the same sound played twice. Air drawn in through a
 * tightening throat gets brighter as it speeds up, so the bandpass rises; air
 * let out does the opposite. Swapping those two makes a person sound like they
 * are breathing backwards, which is a genuinely unsettling accident but the
 * wrong kind of unsettling.
 */
function scheduleBreath(t, L) {
  const period = lerp(5.0, 1.35, L);
  const inhale = period * 0.34;
  const gap = period * 0.07;
  const exhale = period * 0.42;
  // Gated at the bottom so breathing(0) is actually silent: a calm player does
  // not hear themselves, and the first audible breath is information.
  const amp = (0.03 + 0.17 * L) * clamp01(L * 6);
  const top = lerp(700, 1750, L);
  const bottom = lerp(250, 520, L);
  const g = G.brG.gain;
  const f = G.brBand.frequency;

  G.brBand.Q.setTargetAtTime(lerp(0.8, 2.8, L), t, 0.2);

  f.cancelScheduledValues(t);
  f.setValueAtTime(bottom, t);
  f.linearRampToValueAtTime(top, t + inhale);
  g.cancelScheduledValues(t);
  g.setValueAtTime(EPS, t);
  g.linearRampToValueAtTime(amp, t + inhale * 0.68);
  g.exponentialRampToValueAtTime(Math.max(amp * 0.2, EPS * 2), t + inhale);
  g.exponentialRampToValueAtTime(EPS, t + inhale + gap);

  const xt = t + inhale + gap;
  f.setValueAtTime(top * 0.72, xt);
  f.linearRampToValueAtTime(bottom * 0.68, xt + exhale);
  g.setValueAtTime(EPS, xt);
  g.linearRampToValueAtTime(amp * 0.82, xt + exhale * 0.22);
  g.exponentialRampToValueAtTime(EPS, xt + exhale);

  // Panic extras. A catch at the top of the inhale, and a voiced edge on the
  // way out - the point where breathing stops being breathing and becomes a
  // sound the player did not consent to making.
  if (L > 0.55) {
    burst(t, amp * 1.4, 0.004, 0.05, "bandpass", 2400, 1.4, G.bodyBus);
  }
  if (L > 0.72) {
    const v = partial(
      xt + exhale * 0.1,
      lerp(96, 142, L) * rnd(0.97, 1.03),
      amp * 0.5,
      exhale * 0.5,
      "triangle",
      G.bodyBus
    );
    v.frequency.linearRampToValueAtTime(lerp(88, 120, L), xt + exhale * 0.6);
  }
  return period;
}

/** Lub-dub. Two thumps, the second quieter and closer than most people expect. */
function scheduleBeat(t, L) {
  const bpm = lerp(56, 152, L);
  const iv = 60 / bpm;
  const amp = (0.1 + 0.55 * L) * clamp01(L * 5);
  thump(t, 58 + L * 16, 30, amp, 0.17, G.heartLp);
  thump(t + iv * 0.26, 50 + L * 13, 27, amp * 0.6, 0.13, G.heartLp);
  if (L > 0.65) {
    // Blood in the ears. Quiet, lowpassed, and only when it has earned it.
    burst(t, amp * 0.3, 0.02, 0.2, "lowpass", 420, 0.7, G.bodyBus);
  }
  // A couple of percent of jitter. A metronomic heart reads as a machine.
  return iv * rnd(0.975, 1.025);
}

function pump() {
  if (!ready()) return;
  const now = ctx.currentTime;
  const horizon = now + SCHED_AHEAD;

  if (S.breathLevel > 0.004 || S.breathTarget > 0) {
    // Resync rather than catch up. After a suspend the context clock stops, but
    // a dropped frame or a debugger pause can still leave this behind, and
    // firing six breaths back to back is worse than skipping five.
    if (S.nextBreath < now) S.nextBreath = now + 0.05;
    while (S.nextBreath < horizon) {
      S.nextBreath += scheduleBreath(S.nextBreath, S.breathLevel);
    }
  }

  if (S.heartLevel > 0.004 || S.heartTarget > 0) {
    if (S.nextBeat < now) S.nextBeat = now + 0.05;
    while (S.nextBeat < horizon) {
      S.nextBeat += scheduleBeat(S.nextBeat, S.heartLevel);
    }
  }
}

/* ========================================================================== *
 * ONE-SHOTS
 * ========================================================================== */

/** Reverb send appropriate to the current room. Small rooms barely get one. */
function sendFor(size) {
  return size < 0.25 ? G.sendSoft : size < 0.6 ? G.sendMid : G.sendBig;
}

/**
 * An inharmonic struck body. Bells, glass, metal and wood are all the same
 * synthesis with different partial ratios and decay times - the ratios are the
 * material, and nothing else about the sound matters nearly as much.
 */
function struck(t, base, ratios, amps, decays, peak, dest, send) {
  for (let i = 0; i < ratios.length; i++) {
    partial(
      t,
      base * ratios[i],
      peak * amps[i],
      decays[i],
      "sine",
      dest || G.comp,
      send
    );
  }
}

const BELL_R = [0.5, 1, 2.0, 2.76, 3.0, 4.07, 5.4];
const BELL_A = [0.3, 1, 0.52, 0.42, 0.32, 0.2, 0.12];
const BELL_D = [3.2, 2.6, 1.9, 1.4, 1.2, 0.8, 0.6];

const GLASS_R = [1, 2.41, 4.93, 7.2];
const GLASS_A = [1, 0.55, 0.3, 0.14];
const GLASS_D = [0.55, 0.38, 0.22, 0.13];

const METAL_R = [1, 1.73, 2.31, 3.14, 4.61, 6.07];
const METAL_A = [1, 0.7, 0.55, 0.42, 0.26, 0.17];
const METAL_D = [0.9, 0.72, 0.6, 0.45, 0.3, 0.22];

const WOOD_R = [1, 2.11, 3.4];
const WOOD_A = [1, 0.4, 0.17];
const WOOD_D = [0.1, 0.07, 0.045];

function oneShot(name, opts) {
  const t = ctx.currentTime + 0.002;
  const amp = opts && typeof opts.gain === "number" ? clamp(opts.gain, 0, 2) : 1;
  const force =
    opts && typeof opts.force === "number" ? clamp01(opts.force) : 0.5;
  const send = sendFor(S.size);

  switch (name) {
    case "pickup": {
      // Cloth and friction, plus a small rising blip so the player gets a clear
      // "that is now mine" even in a noisy moment.
      const b = burst(t, 0.1 * amp, 0.008, 0.11, "bandpass", 1500, 1.2, G.comp, G.sendSoft);
      b.frequency.exponentialRampToValueAtTime(3200, t + 0.1);
      const o = partial(t + 0.01, 520, 0.055 * amp, 0.1, "triangle", G.comp);
      o.frequency.exponentialRampToValueAtTime(780, t + 0.08);
      break;
    }
    case "drop": {
      thump(t, 95, 52, 0.42 * amp, 0.19, G.comp, send);
      burst(t, 0.2 * amp, 0.002, 0.12, "lowpass", 900, 0.8, G.comp, G.sendSoft);
      break;
    }
    case "impact": {
      // One continuum from a nudge to a thrown crate. Force opens the filter
      // and adds the crack layer; it does not merely turn the volume up.
      const f = force * force;
      const b = burst(
        t,
        (0.2 + 0.65 * f) * amp,
        0.001,
        0.1 + 0.3 * f,
        "lowpass",
        300 + 2600 * f,
        0.9,
        G.comp,
        send
      );
      b.frequency.exponentialRampToValueAtTime(180 + 300 * f, t + 0.2);
      thump(t, 80 + 70 * f, 40, (0.25 + 0.5 * f) * amp, 0.14 + 0.2 * f, G.comp, G.sendSoft);
      if (force > 0.55) {
        burst(t, 0.3 * f * amp, 0.001, 0.05, "highpass", 3200, 0.8, G.comp, send);
      }
      break;
    }
    case "doorLocked": {
      // Two hard clunks and a rattle that goes nowhere. The low thud under it
      // is the mass of the door refusing to move, and is what makes this read
      // as "locked" rather than "knocked".
      struck(t, 170, METAL_R, METAL_A, [0.14, 0.11, 0.09, 0.07, 0.05, 0.04], 0.16 * amp, G.comp, send);
      struck(t + 0.085, 158, METAL_R, METAL_A, [0.12, 0.1, 0.08, 0.06, 0.04, 0.03], 0.13 * amp, G.comp, send);
      for (let i = 0; i < 3; i++) {
        burst(t + 0.1 + i * rnd(0.03, 0.07), 0.07 * amp, 0.001, 0.04, "bandpass", rnd(2000, 3600), 6, G.comp, G.sendSoft);
      }
      thump(t, 72, 44, 0.3 * amp, 0.22, G.comp, G.sendSoft);
      break;
    }
    case "doorOpen": {
      // A long hinge creak: one sawtooth through a very resonant bandpass,
      // wobbling as the door swings, finished with the clunk of it arriving.
      const o = osc("sawtooth", 148);
      const b = bq("bandpass", 620, 18);
      const g = gn(EPS);
      o.frequency.setValueAtTime(148, t);
      o.frequency.linearRampToValueAtTime(196, t + 0.55);
      o.frequency.linearRampToValueAtTime(172, t + 1.0);
      b.frequency.setValueAtTime(560, t);
      b.frequency.linearRampToValueAtTime(1180, t + 0.8);
      g.gain.setValueAtTime(EPS, t);
      g.gain.linearRampToValueAtTime(0.09 * amp, t + 0.09);
      g.gain.linearRampToValueAtTime(0.045 * amp, t + 0.45);
      g.gain.linearRampToValueAtTime(0.075 * amp, t + 0.72);
      g.gain.exponentialRampToValueAtTime(EPS, t + 1.05);
      o.connect(b);
      b.connect(g);
      g.connect(G.comp);
      g.connect(send);
      o.start(t);
      o.stop(t + 1.1);
      thump(t + 1.02, 90, 48, 0.3 * amp, 0.2, G.comp, send);
      burst(t + 1.02, 0.14 * amp, 0.002, 0.1, "lowpass", 1400, 0.8, G.comp, G.sendSoft);
      break;
    }
    case "switchOn":
    case "switchOff": {
      const up = name === "switchOn";
      burst(t, 0.16 * amp, 0.0005, 0.018, "bandpass", up ? 2900 : 2100, 3.5, G.comp, G.sendSoft);
      partial(t, up ? 1150 : 820, 0.07 * amp, 0.03, "square", G.comp);
      if (up) {
        // A tail of mains buzz. Only on the way up, because the thing the
        // switch just energised is now sitting there being energised.
        const b = burst(t + 0.02, 0.025 * amp, 0.01, 0.3, "bandpass", 120, 9, G.comp);
        b.frequency.setValueAtTime(120, t + 0.02);
      } else {
        thump(t, 150, 90, 0.08 * amp, 0.06, G.comp);
      }
      break;
    }
    case "clockTick": {
      burst(t, 0.1 * amp, 0.0005, 0.012, "bandpass", 2300, 7, G.comp, G.sendSoft);
      struck(t, 900, WOOD_R, WOOD_A, [0.035, 0.025, 0.02], 0.05 * amp, G.comp, G.sendSoft);
      break;
    }
    case "clockChime": {
      // Risset-style partial ratios. The 2.76 is the one doing the work: it is
      // what the ear calls "bell" and it is in no harmonic series.
      struck(t, 392, BELL_R, BELL_A, BELL_D, 0.1 * amp, G.comp, G.sendBig);
      burst(t, 0.05 * amp, 0.001, 0.03, "highpass", 4000, 0.8, G.comp);
      break;
    }
    case "glassTap": {
      struck(t, 1760, GLASS_R, GLASS_A, GLASS_D, 0.075 * amp, G.comp, send);
      burst(t, 0.06 * amp, 0.0005, 0.01, "highpass", 6000, 0.8, G.comp);
      break;
    }
    case "metalTap": {
      struck(t, 1180, METAL_R, METAL_A, METAL_D, 0.065 * amp, G.comp, send);
      burst(t, 0.07 * amp, 0.0005, 0.015, "bandpass", 3400, 2, G.comp, G.sendSoft);
      break;
    }
    case "woodTap": {
      struck(t, 430, WOOD_R, WOOD_A, WOOD_D, 0.14 * amp, G.comp, G.sendSoft);
      burst(t, 0.1 * amp, 0.0005, 0.016, "bandpass", 1500, 2.2, G.comp, G.sendSoft);
      break;
    }
    case "waterDrip": {
      // The pitch RISES. A drip is a bubble collapsing, the cavity shrinks and
      // the resonance climbs; a falling pitch sounds like a cartoon. This is the
      // one sound in the file where getting the direction wrong is unmistakable.
      const o = partial(t, 420, 0.1 * amp, 0.1, "sine", G.comp, G.sendBig);
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.055);
      burst(t, 0.05 * amp, 0.0005, 0.012, "highpass", 3000, 0.9, G.comp, G.sendMid);
      break;
    }
    case "paperRustle": {
      // Grains, not a swell. Paper is a sequence of tiny separate events and
      // smoothing them into one envelope turns it into radio static.
      const n = 4 + ((Math.random() * 3) | 0);
      let at = t;
      for (let i = 0; i < n; i++) {
        burst(at, rnd(0.02, 0.055) * amp, 0.004, rnd(0.03, 0.09), "bandpass", rnd(2200, 5200), rnd(0.8, 2.2), G.comp, G.sendSoft);
        at += rnd(0.025, 0.1);
      }
      break;
    }
    case "lightFlicker": {
      // Electrical, not musical: a 100 Hz buzz (mains hum at twice line
      // frequency) gated two or three times, with arc crackle over it.
      const o = osc("sawtooth", 100);
      const b = bq("bandpass", 1400, 4);
      const g = gn(EPS);
      g.gain.setValueAtTime(EPS, t);
      let at = t;
      const gates = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < gates; i++) {
        g.gain.setValueAtTime(0.06 * amp, at);
        g.gain.setValueAtTime(EPS, at + rnd(0.012, 0.045));
        at += rnd(0.04, 0.1);
      }
      g.gain.exponentialRampToValueAtTime(EPS, at + 0.05);
      o.connect(b);
      b.connect(g);
      g.connect(G.comp);
      o.start(t);
      o.stop(at + 0.1);
      for (let i = 0; i < gates; i++) {
        burst(t + i * 0.05, 0.05 * amp, 0.0005, 0.02, "highpass", 4500, 0.8, G.comp, G.sendSoft);
      }
      break;
    }
    case "crack": {
      // Structural, close, and over before the player locates it.
      burst(t, 0.45 * amp, 0.0005, 0.035, "highpass", 1800, 0.9, G.comp, send);
      struck(t, 160, [1, 2.7, 5.1], [1, 0.5, 0.22], [0.26, 0.16, 0.1], 0.2 * amp, G.comp, send);
      break;
    }
    case "dustFall": {
      // Slow in, slow out, with a few discrete grains landing. The slow attack
      // is what places it above the player rather than in front of them.
      const b = burst(t, 0.07 * amp, 0.25, 1.0, "bandpass", 3600, 0.7, G.comp, send);
      b.frequency.exponentialRampToValueAtTime(1800, t + 1.1);
      for (let i = 0; i < 5; i++) {
        burst(t + rnd(0.2, 1.0), rnd(0.01, 0.03) * amp, 0.001, 0.02, "bandpass", rnd(2500, 6000), 4, G.comp, G.sendSoft);
      }
      break;
    }
    /* ====================================================================== *
     * WITHROOM
     *
     * Everything below belongs to the story layer: the ghost, the horror
     * beats, the two new puzzle mechanisms and the car. They live in the same
     * switch as the rest because they are the same kind of thing - a one-shot
     * synthesised from the same primitives - and splitting them into a second
     * file would mean two places that both need the node graph.
     * ====================================================================== */

    case "ghostBreath": {
      /*
       * An inhale, not an exhale.
       *
       * The direction is the whole sound. An exhale is a sigh and reads as
       * release; an inhale is something preparing to speak, and it is the
       * reason the player looks behind them. Noise through a bandpass that
       * OPENS as the level rises - a widening airway - with a slow attack so
       * it cannot be mistaken for a transient in the room.
       */
      const b = burst(t, 0.07 * amp, 0.42, 0.5, "bandpass", 420, 1.5, G.ghostBus, G.sendBig);
      b.frequency.setValueAtTime(380, t);
      b.frequency.linearRampToValueAtTime(1250, t + 0.5);
      b.Q.setValueAtTime(2.2, t);
      b.Q.linearRampToValueAtTime(0.9, t + 0.55);
      break;
    }

    case "distantScream": {
      /*
       * Her, through a wall, a long way down.
       *
       * Formants are the only reason this reads as a human voice: two narrow
       * resonances sliding upward in parallel, which is a vowel being pushed
       * to the top of a register. Everything above 2 kHz is removed, because
       * distance through a building is a low-pass filter - a bright scream
       * sounds like it is in the room with you, which is the opposite of what
       * this is for.
       */
      const peak = 0.055 * amp;
      for (const [f0, f1, a] of [[760, 1180, 1], [1400, 2050, 0.55], [2300, 3100, 0.2]]) {
        const o = osc("sawtooth", f0);
        const b = bq("bandpass", f0, 9);
        const g = gn(EPS);
        o.frequency.setValueAtTime(f0, t);
        o.frequency.linearRampToValueAtTime(f1, t + 0.5);
        o.frequency.linearRampToValueAtTime(f1 * 0.86, t + 1.5);
        b.frequency.setValueAtTime(f0, t);
        b.frequency.linearRampToValueAtTime(f1, t + 0.5);
        g.gain.setValueAtTime(EPS, t);
        g.gain.linearRampToValueAtTime(peak * a, t + 0.14);
        g.gain.setValueAtTime(peak * a, t + 0.9);
        g.gain.exponentialRampToValueAtTime(EPS, t + 1.7);
        const lp = bq("lowpass", 1900, 0.7);
        o.connect(b);
        b.connect(lp);
        lp.connect(g);
        g.connect(G.comp);
        g.connect(G.sendBig);
        o.start(t);
        o.stop(t + 1.8);
      }
      break;
    }

    case "whisperPass": {
      // A whisper crossing behind the player's head. Noise grains sweeping in
      // frequency, which the ear reads as movement rather than as a position.
      for (let i = 0; i < 7; i++) {
        const at = t + i * rnd(0.05, 0.11);
        const b = burst(at, rnd(0.014, 0.034) * amp, 0.02, rnd(0.08, 0.16), "bandpass", 0, rnd(3, 7), G.comp, G.sendBig);
        const f = 700 + i * 260;
        b.frequency.setValueAtTime(f, at);
        b.frequency.linearRampToValueAtTime(f * 1.5, at + 0.18);
      }
      break;
    }

    case "footstepFar": {
      // Someone else walking, two rooms away. All the energy under 300 Hz:
      // what reaches you through a floor is the impact, never the scuff.
      thump(t, 64, 38, 0.22 * amp, 0.13, G.comp, G.sendBig);
      burst(t, 0.045 * amp, 0.004, 0.08, "lowpass", 280, 0.9, G.comp, G.sendBig);
      break;
    }

    case "doorKnock": {
      // Three knocks, unevenly spaced. Evenly spaced knocks are a sound
      // effect; uneven ones are a hand.
      let at = t;
      for (let i = 0; i < 3; i++) {
        struck(at, 140, WOOD_R, WOOD_A, [0.18, 0.12, 0.08], 0.2 * amp, G.comp, send);
        thump(at, 86, 50, 0.3 * amp, 0.16, G.comp, G.sendSoft);
        at += rnd(0.19, 0.27);
      }
      break;
    }

    case "handleTurn": {
      // The mechanism inside a door handle being turned slowly from the other
      // side, and released. Metal on metal, dry, close.
      struck(t, 320, METAL_R, METAL_A, [0.06, 0.05, 0.04, 0.03, 0.02, 0.015], 0.07 * amp, G.comp, G.sendSoft);
      const b = burst(t + 0.04, 0.03 * amp, 0.05, 0.34, "bandpass", 1800, 5, G.comp, G.sendSoft);
      b.frequency.linearRampToValueAtTime(1300, t + 0.38);
      struck(t + 0.46, 280, METAL_R, METAL_A, [0.08, 0.06, 0.05, 0.04, 0.03, 0.02], 0.09 * amp, G.comp, send);
      break;
    }

    case "shelfFall": {
      // One object leaving a surface, one impact, one roll. The gap between
      // the leaving and the landing is what gives it a height.
      burst(t, 0.05 * amp, 0.004, 0.06, "bandpass", 2600, 3, G.comp, G.sendSoft);
      const land = t + 0.42;
      thump(land, 110, 54, 0.5 * amp, 0.2, G.comp, send);
      burst(land, 0.3 * amp, 0.001, 0.14, "lowpass", 1100, 0.8, G.comp, send);
      for (let i = 0; i < 5; i++) {
        struck(land + 0.12 + i * rnd(0.07, 0.15), 380 + i * 40, WOOD_R, WOOD_A, [0.06, 0.04, 0.03], 0.05 * amp, G.comp, G.sendSoft);
      }
      break;
    }

    case "glitchZap": {
      // The sound of the image failing. Deliberately electronic, because the
      // glitch is not something in the room - it is something wrong with what
      // the player is being shown.
      const o = osc("square", 90);
      const g = gn(EPS);
      const hp = bq("highpass", 400, 0.8);
      o.frequency.setValueAtTime(rnd(70, 130), t);
      for (let i = 0; i < 6; i++) {
        o.frequency.setValueAtTime(rnd(60, 1400), t + i * 0.016);
        g.gain.setValueAtTime(i % 2 ? 0.05 * amp : EPS, t + i * 0.016);
      }
      g.gain.setValueAtTime(EPS, t + 0.1);
      o.connect(hp);
      hp.connect(g);
      g.connect(G.comp);
      o.start(t);
      o.stop(t + 0.12);
      burst(t, 0.07 * amp, 0.0005, 0.04, "highpass", 3800, 0.8, G.comp);
      break;
    }

    case "keyInsert": {
      // Brass sliding into a worn iron lock: a scrape with pins ticking over
      // it, ending against the back of the barrel.
      const b = burst(t, 0.045 * amp, 0.01, 0.3, "bandpass", 2400, 4, G.comp, G.sendSoft);
      b.frequency.linearRampToValueAtTime(3400, t + 0.3);
      for (let i = 0; i < 4; i++) {
        struck(t + 0.05 + i * 0.06, 2600 + i * 180, METAL_R, METAL_A, [0.02, 0.015, 0.01], 0.03 * amp, G.comp, G.sendSoft);
      }
      struck(t + 0.32, 420, METAL_R, METAL_A, [0.05, 0.04, 0.03, 0.02], 0.07 * amp, G.comp, send);
      break;
    }

    case "lockTurn": {
      /*
       * The one sound in the game the whole story is pointing at.
       *
       * Three stages, because a real mortice lock has three: the barrel
       * turning under load (a slow grind), the bolt travelling (a scrape),
       * and the bolt clearing the keep (a hard, final clunk). The clunk is
       * deliberately the loudest transient in the game outside the walls
       * themselves.
       */
      const grind = burst(t, 0.06 * amp, 0.05, 0.5, "bandpass", 700, 3, G.comp, send);
      grind.frequency.linearRampToValueAtTime(420, t + 0.55);
      for (let i = 0; i < 7; i++) {
        struck(t + 0.08 + i * rnd(0.05, 0.09), 520 + i * 70, METAL_R, METAL_A, [0.04, 0.03, 0.02, 0.015], 0.04 * amp, G.comp, G.sendSoft);
      }
      const bolt = t + 0.68;
      const scrape = burst(bolt, 0.07 * amp, 0.02, 0.22, "bandpass", 1500, 2.5, G.comp, send);
      scrape.frequency.linearRampToValueAtTime(900, bolt + 0.24);
      const clunk = bolt + 0.3;
      struck(clunk, 190, METAL_R, METAL_A, [0.22, 0.18, 0.14, 0.1, 0.07, 0.05], 0.24 * amp, G.comp, G.sendBig);
      thump(clunk, 96, 46, 0.62 * amp, 0.26, G.comp, send);
      break;
    }

    case "keypadBeep": {
      // A mechanical button with a contact behind it, not a beep. The tiny
      // square-wave click is the contact; the body is the plastic.
      burst(t, 0.07 * amp, 0.0004, 0.014, "bandpass", 2800, 4, G.comp, G.sendSoft);
      partial(t, 1320, 0.035 * amp, 0.025, "square", G.comp);
      struck(t, 640, WOOD_R, WOOD_A, [0.03, 0.02, 0.015], 0.03 * amp, G.comp, G.sendSoft);
      break;
    }

    case "keypadWrong": {
      // A dead buzz that stops abruptly. The abrupt stop is the refusal.
      const o = osc("square", 132);
      const lp = bq("lowpass", 900, 1);
      const g = gn(EPS);
      g.gain.setValueAtTime(0.055 * amp, t);
      g.gain.setValueAtTime(0.055 * amp, t + 0.26);
      g.gain.setValueAtTime(EPS, t + 0.27);
      o.connect(lp);
      lp.connect(g);
      g.connect(G.comp);
      g.connect(G.sendSoft);
      o.start(t);
      o.stop(t + 0.3);
      thump(t, 70, 50, 0.16 * amp, 0.2, G.comp, G.sendSoft);
      break;
    }

    case "keypadRight": {
      // Two relays and a bolt. No musical cue: the room never congratulates
      // anybody, it just stops refusing.
      struck(t, 880, METAL_R, METAL_A, [0.05, 0.04, 0.03, 0.02], 0.08 * amp, G.comp, G.sendSoft);
      struck(t + 0.11, 1180, METAL_R, METAL_A, [0.05, 0.04, 0.03, 0.02], 0.07 * amp, G.comp, G.sendSoft);
      thump(t + 0.22, 120, 58, 0.4 * amp, 0.22, G.comp, send);
      break;
    }

    case "fuseSeat": {
      // Ceramic into a sprung contact: a dull body, two spring ticks, and a
      // brief arc as the circuit makes.
      struck(t, 520, WOOD_R, WOOD_A, [0.05, 0.035, 0.025], 0.07 * amp, G.comp, G.sendSoft);
      struck(t + 0.05, 1600, METAL_R, METAL_A, [0.03, 0.02, 0.015], 0.05 * amp, G.comp, G.sendSoft);
      burst(t + 0.07, 0.04 * amp, 0.0005, 0.03, "highpass", 5200, 0.9, G.comp);
      break;
    }

    case "leverPull": {
      // A heavy knife switch. The travel is a slow scrape under load; the
      // arrival is iron hitting iron and is what tells the player it took.
      const sc = burst(t, 0.05 * amp, 0.06, 0.45, "bandpass", 560, 2.2, G.comp, send);
      sc.frequency.linearRampToValueAtTime(380, t + 0.5);
      const hit = t + 0.52;
      struck(hit, 150, METAL_R, METAL_A, [0.3, 0.24, 0.18, 0.13, 0.09, 0.06], 0.2 * amp, G.comp, G.sendBig);
      thump(hit, 88, 42, 0.5 * amp, 0.28, G.comp, send);
      // The arc. Mains making contact across a gap.
      for (let i = 0; i < 4; i++) {
        burst(hit + i * rnd(0.01, 0.04), 0.05 * amp, 0.0005, 0.02, "highpass", rnd(4000, 7000), 0.9, G.comp);
      }
      break;
    }

    case "powerUp": {
      /*
       * A building coming back on.
       *
       * The rising 50 Hz hum is the sound; everything else is dressing. It
       * sweeps up in both pitch and level over nearly two seconds, which is
       * roughly how long a transformer and a corridor of fluorescent fittings
       * actually take, and three flicker gates land on top of it so the ear
       * and the lighting rig agree about what is happening.
       */
      const o = osc("sawtooth", 24);
      const lp = bq("lowpass", 180, 1.2);
      const g = gn(EPS);
      o.frequency.setValueAtTime(24, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 1.7);
      lp.frequency.setValueAtTime(140, t);
      lp.frequency.linearRampToValueAtTime(620, t + 1.8);
      g.gain.setValueAtTime(EPS, t);
      g.gain.linearRampToValueAtTime(0.09 * amp, t + 1.5);
      g.gain.linearRampToValueAtTime(0.045 * amp, t + 2.4);
      o.connect(lp);
      lp.connect(g);
      g.connect(G.comp);
      g.connect(G.sendMid);
      o.start(t);
      o.stop(t + 2.6);
      for (const at of [0.9, 1.25, 1.55]) {
        burst(t + at, 0.06 * amp, 0.001, 0.05, "bandpass", rnd(1200, 2600), 3, G.comp, G.sendSoft);
      }
      thump(t + 1.62, 60, 34, 0.3 * amp, 0.5, G.comp, G.sendBig);
      break;
    }

    case "mirrorRing": {
      // A big sheet of glass finding its resonance. Long decays and a slight
      // beat between the first two partials: a pane is never quite flat.
      struck(t, 620, [1, 1.47, 2.09, 2.93, 4.1], [1, 0.62, 0.4, 0.22, 0.12], [2.6, 2.1, 1.5, 1.0, 0.7], 0.055 * amp, G.comp, G.sendBig);
      struck(t + 0.02, 626, [1, 1.47], [0.5, 0.3], [2.4, 1.9], 0.03 * amp, G.comp, G.sendBig);
      break;
    }

    case "clockStop": {
      // Two more ticks, the second late, then nothing. The silence afterwards
      // is the event - which is why this sound is mostly absence.
      burst(t, 0.09 * amp, 0.0005, 0.012, "bandpass", 2300, 7, G.comp, G.sendSoft);
      burst(t + 0.98, 0.07 * amp, 0.0005, 0.012, "bandpass", 2100, 7, G.comp, G.sendSoft);
      // The escapement giving up: one dull tick with no return.
      struck(t + 1.9, 300, WOOD_R, WOOD_A, [0.09, 0.06, 0.04], 0.05 * amp, G.comp, G.sendSoft);
      break;
    }

    case "carDoor": {
      // Sheet metal and a rubber seal. The seal is what makes it a car rather
      // than a cupboard: a short, dead, airy thud with no ring at all.
      thump(t, 120, 54, 0.5 * amp, 0.18, G.comp, G.sendSoft);
      burst(t, 0.22 * amp, 0.002, 0.1, "lowpass", 700, 0.8, G.comp, G.sendSoft);
      struck(t, 180, METAL_R, METAL_A, [0.08, 0.06, 0.04, 0.03, 0.02, 0.015], 0.07 * amp, G.comp, G.sendSoft);
      break;
    }

    case "wiper": {
      // Rubber dragging across wet glass and clunking at the end of its arc.
      const b = burst(t, 0.03 * amp, 0.06, 0.26, "bandpass", 1100, 1.6, G.comp, G.sendSoft);
      b.frequency.linearRampToValueAtTime(1700, t + 0.3);
      struck(t + 0.34, 240, WOOD_R, WOOD_A, [0.05, 0.035, 0.02], 0.045 * amp, G.comp, G.sendSoft);
      break;
    }

    case "thunder": {
      // Distant: no crack at all, just a long low roll that takes a second to
      // arrive at its loudest. The absence of a transient is the distance.
      const b = burst(t, 0.1 * amp, 0.9, 2.6, "lowpass", 180, 0.9, G.comp, G.sendBig);
      b.frequency.exponentialRampToValueAtTime(70, t + 3.2);
      thump(t + 0.7, 44, 26, 0.3 * amp, 1.4, G.comp, G.sendBig);
      break;
    }

    case "crashImpact": {
      /*
       * The car meeting the smoke.
       *
       * Not a collision - nothing is hit. It is a pressure event: a very low
       * thump, a broadband wash that swallows the whole mix for a quarter of a
       * second, and then the holes in the sound where the engine and the rain
       * used to be. The cutscene cuts the beds at the same instant, and the
       * two together are what make it read as the world dropping out.
       */
      thump(t, 70, 24, 1.0 * amp, 0.7, G.comp, G.sendBig);
      const wash = burst(t, 0.6 * amp, 0.004, 0.45, "lowpass", 3000, 0.7, G.comp, G.sendBig);
      wash.frequency.exponentialRampToValueAtTime(280, t + 0.5);
      burst(t, 0.3 * amp, 0.001, 0.12, "highpass", 2600, 0.8, G.comp, G.sendMid);
      // The ring-out. One long metallic tail, wrong for a car, which is the
      // first hint that what happened was not an accident.
      struck(t + 0.05, 128, METAL_R, METAL_A, [1.6, 1.3, 1.0, 0.7, 0.5, 0.35], 0.12 * amp, G.comp, G.sendBig);
      break;
    }

    default:
      // Unknown name: silence beats a placeholder beep in a horror game, and
      // beats a thrown exception everywhere.
      break;
  }
}

/* ========================================================================== *
 * PUBLIC API
 * ========================================================================== */

/**
 * Create the context, or resume one the browser has parked.
 *
 * This is the entire unlock strategy, and it only works because it is
 * idempotent: call it from pointerdown, keydown, touchend, the start button,
 * the pause menu - anywhere a gesture might be the first one. Browsers only
 * honour `resume()` inside a gesture, and the only reliable way to be inside a
 * gesture is to be called from all of them.
 */
function init() {
  try {
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
        S.selfSuspended = false;
        // suspend() faded the master to nothing on the way down, and a gesture
        // that resumes the context without restoring it leaves a game that is
        // running and completely silent. Deliberately does NOT undo a pause
        // menu duck: init() is wired to every gesture, including the clicks
        // inside that menu.
        applyVolumes(0.08);
        if (S.breathTarget > 0 || S.heartTarget > 0) startSched();
      }
      return ready();
    }
    if (typeof window === "undefined") return false;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor({ latencyHint: "interactive" });
    build();
    bindBus();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    // A room requested before there was a context to put it in.
    if (S.wantRoom >= 0) {
      const id = S.wantRoom;
      S.wantRoom = -1;
      S.roomId = -1;
      tmpDims.w = S.wantW;
      tmpDims.d = S.wantD;
      tmpDims.h = S.wantH;
      ambience(id, tmpDims);
    }
    if (S.breathTarget > 0 || S.heartTarget > 0) startSched();
    return ready();
  } catch {
    // A context that failed to construct is worse than none: every later call
    // would try to use half a graph. Drop it and run silent.
    ctx = null;
    return false;
  }
}

/** For visibilitychange, and for the auto-pause the loop fires on blur. */
function suspend() {
  if (!live() || ctx.state !== "running") return;
  try {
    // Fade first. Suspending a context mid-waveform leaves a DC step that some
    // output devices click on, and this game has a lot of sustained low end.
    const t = ctx.currentTime;
    G.master.gain.cancelScheduledValues(t);
    G.master.gain.setTargetAtTime(EPS, t, 0.03);
    stopSched();
    S.selfSuspended = true;
    setTimeout(() => {
      if (S.selfSuspended && live()) ctx.suspend().catch(() => {});
    }, 120);
  } catch {
    /* Nothing to recover: silence is the failure mode we want. */
  }
}

/**
 * Undo everything either kind of pause did. Idempotent, and the only path back
 * to a playing mix - the pause-menu duck is lifted here rather than in the bus
 * handler, so that a caller who resumes the game by hand gets the same result
 * as one who emits the event.
 */
function resume() {
  if (!live()) return;
  try {
    S.selfSuspended = false;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (S.menuPaused) {
      S.menuPaused = false;
      const t = ctx.currentTime;
      G.bodyBus.gain.setTargetAtTime(1, t, 0.12);
      G.rumBus.gain.setTargetAtTime(1, t, 0.12);
    }
    applyVolumes(0.1);
    if (S.breathTarget > 0 || S.heartTarget > 0) startSched();
  } catch {
    /* As above. */
  }
}

function applyVolumes(tc) {
  if (!live() || !S.built) return;
  const t = ctx.currentTime;
  const k = tc === undefined ? 0.05 : tc;
  G.master.gain.setTargetAtTime(curve(vol.master) * HEADROOM, t, k);
  // The music fader is where the pause-menu duck lives, so it has to be
  // respected here: the volume sliders are IN that menu, and without this
  // check dragging one brings the room tone back while the game is paused.
  G.music.gain.setTargetAtTime(
    S.menuPaused ? EPS : curve(vol.music) * 0.9,
    t,
    k
  );
  G.sfx.gain.setTargetAtTime(curve(vol.sfx), t, k);
}

/** Partial update: only the keys present are changed. */
function setVolumes(v) {
  if (!v) return;
  if (typeof v.master === "number") vol.master = clamp01(v.master);
  if (typeof v.music === "number") vol.music = clamp01(v.music);
  if (typeof v.sfx === "number") vol.sfx = clamp01(v.sfx);
  applyVolumes(0.05);
}

/* -------------------------------------------------------------------------- *
 * Footsteps
 * -------------------------------------------------------------------------- */

/**
 * Surface recipes.
 *
 * `body` is the thump of a mass landing, `scuff` is the slide of the sole, and
 * the ratio between them is the whole character: concrete is nearly all scuff,
 * dust is nearly all body with the top rolled off.
 */
const SURFACES = {
  concrete: { bodyF: 72, bodyA: 0.17, bodyD: 0.07, type: "bandpass", f: 1500, q: 1.1, a: 0.1, d: 0.075, grit: 0.045 },
  wood: { bodyF: 110, bodyA: 0.2, bodyD: 0.13, type: "bandpass", f: 520, q: 3.2, a: 0.1, d: 0.12, grit: 0.02 },
  dust: { bodyF: 58, bodyA: 0.11, bodyD: 0.1, type: "lowpass", f: 900, q: 0.7, a: 0.085, d: 0.17, grit: 0.03 },
};

function footstep(surface, speed, crouched) {
  if (!ready()) return;
  try {
    const s = SURFACES[surface] || SURFACES.concrete;
    const sp = clamp01(speed === undefined ? 0.5 : speed);
    // Crouching is not just quieter, it is darker: a deliberate foot placed
    // flat makes far less high-frequency scuff than a heel strike.
    const q = crouched ? 0.3 : 1;
    const amp = (0.45 + 0.55 * sp) * q;
    const bright = crouched ? 0.55 : 0.8 + 0.5 * sp;
    const t = ctx.currentTime + 0.002;
    // Per-step jitter. Identical steps machine-gun after about four of them.
    const j = rnd(0.92, 1.09);
    const send = sendFor(S.size);

    thump(t, s.bodyF * j, s.bodyF * 0.62, s.bodyA * amp, s.bodyD, G.comp, G.sendSoft);
    const b = burst(t, s.a * amp, 0.002, s.d * rnd(0.85, 1.2), s.type, s.f * bright * j, s.q, G.comp, send);
    b.frequency.exponentialRampToValueAtTime(s.f * 0.6 * bright, t + s.d);

    if (!crouched && s.grit > 0) {
      // Grit under the sole, a few milliseconds behind the strike. This is the
      // detail that makes a floor sound like a floor instead of a drum.
      burst(t + rnd(0.015, 0.04), s.grit * amp, 0.002, rnd(0.03, 0.07), "highpass", rnd(3000, 6500), 0.8, G.comp, G.sendSoft);
    }
    if (surface === "wood" && Math.random() < 0.22 * (1 - sp * 0.5)) {
      // Boards complain under a slow foot more than under a running one.
      creakLight(t + rnd(0.02, 0.06), amp);
    }
  } catch {
    /* A missing surface or a closed context must not cost the player a step. */
  }
}

function creakLight(t, amp) {
  const f = rnd(190, 420);
  const o = osc("sawtooth", f);
  const b = bq("bandpass", f * 3.1, 16);
  const g = gn(EPS);
  const dur = rnd(0.12, 0.3);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * rnd(1.04, 1.13), t + dur);
  env(g.gain, t, 0.035 * amp, 0.01, dur);
  o.connect(b);
  b.connect(g);
  g.connect(G.comp);
  g.connect(G.sendSoft);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/* -------------------------------------------------------------------------- *
 * Room tone
 * -------------------------------------------------------------------------- */

/**
 * Set or crossfade the room tone.
 *
 * `dims` may be omitted, in which case the authored dimensions for that room
 * state are used - the state table is the source of truth for how big the room
 * is, and audio has no business keeping a second copy.
 */
function ambience(roomStateId, dims) {
  const id = roomStateId | 0;
  const st = ROOM_STATES[id] || ROOM_STATES[0];
  const w = dims && dims.w ? dims.w : st.w;
  const d = dims && dims.d ? dims.d : st.d;
  const h = dims && dims.h ? dims.h : st.h;

  if (!live() || !S.built) {
    // Remember it. Ambience is routinely set while the context is still locked
    // behind the first gesture, and losing it leaves the game silent until the
    // next room change, which may be several minutes of play away.
    S.wantRoom = id;
    S.wantW = w;
    S.wantD = d;
    S.wantH = h;
    return;
  }
  if (S.roomId === id) return;

  try {
    const t = ctx.currentTime;
    const p = profileFor(w, d, h);
    const first = S.roomId < 0;
    const incoming = ambFront === ambA ? ambB : ambA;

    // The incoming voice is silent, so it can be retuned instantly. Only its
    // fader has to move slowly.
    tuneVoice(incoming, p, t, first ? 0.01 : 0.05);
    applyRoomProfile(p, t, first ? 0.05 : XFADE_TC);

    incoming.out.gain.setTargetAtTime(1, t, first ? 1.2 : XFADE_TC);
    ambFront.out.gain.setTargetAtTime(first ? 0 : EPS, t, XFADE_TC);
    ambFront = incoming;
    S.roomId = id;
  } catch {
    /* A failed crossfade leaves the old tone playing, which is survivable. */
  }
}

/* -------------------------------------------------------------------------- *
 * Rumble
 * -------------------------------------------------------------------------- */

function rumble(kind, seconds) {
  if (!ready()) return;
  try {
    const shrink = kind === "shrink";
    const sec = clamp(
      typeof seconds === "number" && seconds > 0
        ? seconds
        : shrink
        ? SHRINK.duration
        : EXPANSION.duration,
      0.6,
      30
    );
    // A rumble interrupting a rumble restarts the sub from a standing start,
    // which clicks. Kill the old one and start a tenth of a second later: the
    // walls have just changed their mind and a small hitch sells that anyway.
    const busy = S.rumbleUntil > ctx.currentTime;
    if (busy) stopRumble();
    const t0 = ctx.currentTime + (busy ? 0.12 : 0.01);
    track = true;
    try {
      S.rumbleUntil = shrink ? rumbleShrink(t0, sec) : rumbleExpand(t0, sec);
    } finally {
      track = false;
    }
  } catch {
    /* Silence, never a half-moved room with an exception in the console. */
    track = false;
  }
}

function stopRumble() {
  if (!live() || !S.built) return;
  try {
    const t = ctx.currentTime;
    G.rumSubG.gain.cancelScheduledValues(t);
    G.rumSubG.gain.setTargetAtTime(EPS, t, 0.06);
    G.rumSubBG.gain.cancelScheduledValues(t);
    G.rumSubBG.gain.setTargetAtTime(EPS, t, 0.06);
    G.grindG.gain.cancelScheduledValues(t);
    G.grindG.gain.setTargetAtTime(EPS, t, 0.06);
    // Creaks are already scheduled minutes of context time ahead in the worst
    // case, and a bus fade does not unschedule them - they would reappear the
    // moment the bus came back up.
    for (let i = 0; i < pending.length; i++) {
      try {
        pending[i].stop(t);
      } catch {
        /* Already finished. */
      }
    }
    pending.length = 0;
    duckAmbience(t + 0.05, 1, 0.4);
    G.verbWet.gain.cancelScheduledValues(t);
    G.verbWet.gain.setTargetAtTime(1, t, 0.3);
    S.rumbleUntil = 0;
  } catch {
    /* As above. */
  }
}

/* -------------------------------------------------------------------------- *
 * The ghost
 *
 * `ghostVoiceBed` is called by story/voice.js at the instant an utterance is
 * handed to the speech synthesiser, and sized to that line's duration. The
 * result is that the sub-bass and the whisper bed start and stop with the
 * sentence rather than droning under the whole scene - which is the difference
 * between a voice that is unsettling and a soundtrack that is merely loud.
 * -------------------------------------------------------------------------- */

function ghostVoiceBed(seconds, opts = {}) {
  if (!ready() || !S.built) return;
  const secs = clamp(typeof seconds === "number" ? seconds : 2, 0.4, 14);

  try {
    const t = ctx.currentTime + 0.01;
    const end = t + secs;

    // Sub: in over a third of a second, out over most of a second. A hard
    // start on 41 Hz is an audible click on anything with a woofer.
    G.gSubG.gain.cancelScheduledValues(t);
    G.gSubG.gain.setValueAtTime(Math.max(G.gSubG.gain.value, EPS), t);
    G.gSubG.gain.linearRampToValueAtTime(0.26, t + 0.35);
    G.gSubG.gain.setValueAtTime(0.26, end - 0.3);
    G.gSubG.gain.exponentialRampToValueAtTime(EPS, end + 0.7);

    // Whisper bed, quieter than the sub and gone sooner, so the last thing
    // left in the room after the ghost stops talking is the pressure.
    //
    // `grainLevel` lets the voice engine pull this down while a line is being
    // spoken: this band is where consonants live, and a bed that masks them
    // makes the ghost unintelligible.
    const level = typeof opts.grainLevel === "number" ? opts.grainLevel : 1;
    const air = (opts.grains === false ? 0.018 : 0.05) * level;
    G.gAirG.gain.cancelScheduledValues(t);
    G.gAirG.gain.setValueAtTime(Math.max(G.gAirG.gain.value, EPS), t);
    G.gAirG.gain.linearRampToValueAtTime(air, t + 0.22);
    G.gAirG.gain.setValueAtTime(air, end - 0.25);
    G.gAirG.gain.exponentialRampToValueAtTime(EPS, end + 0.25);

    // Ring modulation drifts downward across the line. A fixed rate reads as
    // a broken speaker; a falling one reads as something losing its grip on
    // the shape of a human voice.
    G.gRing.frequency.cancelScheduledValues(t);
    G.gRing.frequency.setValueAtTime(31, t);
    G.gRing.frequency.linearRampToValueAtTime(19, end);
    G.gRingG.gain.cancelScheduledValues(t);
    G.gRingG.gain.setValueAtTime(0, t);
    G.gRingG.gain.linearRampToValueAtTime(0.5, t + 0.3);
    G.gRingG.gain.linearRampToValueAtTime(0, end + 0.2);

    if (opts.grains !== false) {
      /*
       * Whisper grains.
       *
       * Short filtered noise bursts at roughly syllable rate, which the ear
       * fuses with the synthesised voice into one doubled utterance. This is
       * the single most effective thing in the file, and it works precisely
       * because the grains are NOT synchronised to the words: a doubling that
       * lines up perfectly sounds like an echo, one that nearly lines up
       * sounds like a second mouth.
       */
      const syllables = Math.max(2, Math.round(secs * 3.4));
      for (let i = 0; i < syllables; i++) {
        const at = t + (i / syllables) * secs + rnd(-0.03, 0.05);
        if (at <= t) continue;
        burst(
          at,
          rnd(0.012, 0.03) * level,
          0.012,
          rnd(0.05, 0.12),
          "bandpass",
          rnd(900, 2600),
          rnd(2, 5),
          G.ghostBus,
          G.sendBig,
        );
      }
    }

    // The room gets out of the way. Not silence - a duck, so the player can
    // tell the ambience is still there being suppressed. Deeper than it was:
    // room tone is broadband and it was the other thing competing with the
    // words.
    duckAmbience(t, 0.2, 0.25);
    duckAmbience(end + 0.4, 1, 0.6);
  } catch {
    /* A line that fails to get its bed still gets its words. */
  }
}

/**
 * The laugh.
 *
 * Not a sample and not a pitched-down human: it is three detuned formant
 * pairs gated into syllables at an irregular rate, with the gate slowing down
 * as it goes. Laughter is periodic bursts of voiced breath, so gating voiced
 * noise is the honest way to build one - and because the rate is wrong for a
 * human from the first syllable, it never has to pretend to be one.
 */
function ghostLaugh(seconds = 2) {
  if (!ready() || !S.built) return;
  const secs = clamp(seconds, 0.6, 6);

  try {
    const t0 = ctx.currentTime + 0.01;

    ghostVoiceBed(secs + 0.4, { grains: false });

    // Syllables slow down across the laugh: 9 per second at the start, about
    // 4 by the end. A constant rate is a machine gun.
    let at = t0;
    let i = 0;
    while (at < t0 + secs) {
      const k = (at - t0) / secs;
      const gap = 0.1 + k * 0.14 + rnd(-0.012, 0.03);
      const amp = (1 - k * 0.35) * rnd(0.7, 1);

      // Two formants is the minimum for a vowel. 700/1100 is roughly an open
      // "ah"; dropping both with k turns the laugh into a growl by the end.
      const f1 = (640 - k * 180) * (i % 2 ? 0.94 : 1);
      const f2 = 1180 - k * 320;

      burst(at, 0.075 * amp, 0.006, gap * 0.8, "bandpass", f1, 7, G.ghostBus, G.sendBig);
      burst(at, 0.045 * amp, 0.006, gap * 0.7, "bandpass", f2, 9, G.ghostBus, G.sendBig);
      // A pitched component under each syllable, an octave below where a
      // woman's laugh would sit.
      partial(at, (108 - k * 26) * (i % 3 === 2 ? 1.19 : 1), 0.05 * amp, gap * 0.9, "sawtooth", G.ghostBus);

      at += gap;
      i++;
    }

    // The tail: one long exhale that keeps going after the laugh stops, which
    // is what makes it read as something enjoying itself rather than as a
    // sound effect that ended.
    const tail = burst(t0 + secs, 0.05, 0.08, 1.6, "bandpass", 520, 1.4, G.ghostBus, G.sendBig);
    tail.frequency.exponentialRampToValueAtTime(220, t0 + secs + 1.5);
  } catch {
    /* As everywhere else here: a missing sound is never worth a thrown frame. */
  }
}

/* -------------------------------------------------------------------------- *
 * Cutscene beds
 *
 * One call per layer, with a target level and a fade. Cutscenes bring these up
 * and take them down; nothing else in the game touches them, and they are at
 * silence the rest of the time.
 * -------------------------------------------------------------------------- */

/** Target levels per bed name, so a caller asks for "rain", not for 0.09. */
const BEDS = {
  rain: [["rainG", 0.075], ["roofG", 0.03]],
  engine: [["engG", 0.055], ["indG", 0.03]],
  tyres: [["tyreG", 0.05]],
  wind: [["windG", 0.06]],
};

/**
 * Fade a bed to `level` (0..1 of its own designed loudness) over `fade`
 * seconds. Level 0 takes it to silence without stopping the source, so the
 * same bed can come back later with no allocation and no click.
 */
function bed(name, level = 1, fade = 1.2) {
  if (!ready() || !S.built) return;
  const layers = BEDS[name];
  if (!layers) return;
  try {
    const t = ctx.currentTime;
    const k = clamp01(level);
    for (const [node, peak] of layers) {
      const g = G[node]?.gain;
      if (!g) continue;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(g.value, EPS), t);
      // Linear, not exponential: these are noise beds and an exponential fade
      // on broadband noise is audible as a swoop.
      g.linearRampToValueAtTime(Math.max(EPS, peak * k), t + Math.max(0.02, fade));
    }
  } catch {
    /* Silence is an acceptable failure for weather. */
  }
}

/** Take every cutscene bed to silence. Called when a cutscene hands back. */
function bedsOff(fade = 1) {
  for (const name of Object.keys(BEDS)) bed(name, 0, fade);
}

/**
 * Engine and road speed, 0..1.
 *
 * Drives the firing frequency, the filter and the tyre noise together - the
 * three things that actually change when a car slows down. A car scene that
 * only changes volume sounds like a car scene with a volume knob.
 */
function engineRpm(k, seconds = 0.6) {
  if (!ready() || !S.built) return;
  const v = clamp01(k);
  try {
    const t = ctx.currentTime;
    const base = 38 + v * 54;
    G.engA.frequency.cancelScheduledValues(t);
    G.engA.frequency.linearRampToValueAtTime(base, t + seconds);
    G.engB.frequency.cancelScheduledValues(t);
    G.engB.frequency.linearRampToValueAtTime(base * 2, t + seconds);
    G.engLp.frequency.cancelScheduledValues(t);
    G.engLp.frequency.linearRampToValueAtTime(260 + v * 520, t + seconds);
    G.tyreBp.frequency.cancelScheduledValues(t);
    G.tyreBp.frequency.linearRampToValueAtTime(600 + v * 900, t + seconds);
  } catch {
    /* Leave it where it was. */
  }
}

/* -------------------------------------------------------------------------- *
 * The player's body
 * -------------------------------------------------------------------------- */

function breathing(level) {
  const L = clamp01(typeof level === "number" ? level : 0);
  S.breathTarget = L;
  if (L > 0) startSched();
}

function heartbeat(level) {
  const L = clamp01(typeof level === "number" ? level : 0);
  S.heartTarget = L;
  if (L > 0) startSched();
}

/* -------------------------------------------------------------------------- *
 * Stingers
 * -------------------------------------------------------------------------- */

function stinger(kind) {
  if (!ready()) return;
  try {
    const t = ctx.currentTime + 0.005;
    switch (kind) {
      case "solved": {
        // A fifth, warm, with a slow attack. Deliberately not a fanfare: the
        // reward in this game is the room getting bigger, and the music's job
        // is to get out of the way of it.
        const a = partial(t, 220, 0.11, 1.5, "sine", G.comp, G.sendBig);
        a.frequency.setValueAtTime(220, t);
        partial(t + 0.06, 330, 0.08, 1.4, "sine", G.comp, G.sendBig);
        partial(t + 0.12, 440, 0.045, 1.2, "triangle", G.comp, G.sendBig);
        const b = burst(t, 0.07, 0.25, 1.1, "bandpass", 2400, 0.8, G.comp, G.sendBig);
        b.frequency.exponentialRampToValueAtTime(5200, t + 1.1);
        break;
      }
      case "failedMinor": {
        // A minor second, dull and short. Enough to say no, not enough to
        // punish experimenting - which the stability rules deliberately do not.
        partial(t, 146.8, 0.11, 0.5, "sine", G.comp, G.sendMid);
        partial(t, 155.6, 0.09, 0.45, "sine", G.comp, G.sendMid);
        burst(t, 0.1, 0.002, 0.14, "lowpass", 700, 0.8, G.comp, G.sendSoft);
        break;
      }
      case "failedMajor": {
        // Tritone, descending, with a sub under it. The pitch falls because
        // everything that goes wrong in this game makes the room smaller.
        const a = partial(t, 110, 0.18, 1.7, "sawtooth", G.comp, G.sendBig);
        a.frequency.exponentialRampToValueAtTime(82, t + 1.5);
        const b2 = partial(t, 155.6, 0.12, 1.5, "sawtooth", G.comp, G.sendBig);
        b2.frequency.exponentialRampToValueAtTime(116, t + 1.4);
        thump(t, 60, 28, 0.55, 1.1, G.comp, G.sendMid);
        const n = burst(t, 0.16, 0.3, 1.3, "lowpass", 1600, 0.8, G.comp, G.sendBig);
        n.frequency.exponentialRampToValueAtTime(300, t + 1.4);
        break;
      }
      case "checkpoint": {
        // One soft bell with a long tail. Safety, stated once, quietly.
        struck(t, 523.25, BELL_R, BELL_A, BELL_D, 0.055, G.comp, G.sendBig);
        break;
      }
      case "gameover": {
        // The walls arrive and do not leave. A 24 Hz sub, a cluster of three
        // sines a semitone apart so nothing resolves, and the room tone taken
        // to zero and held there - the next ambience() call is what brings the
        // world back, and that only happens on a restart.
        thump(t, 48, 20, 0.85, 3.6, G.comp, G.sendBig);
        partial(t, 55, 0.14, 4, "sine", G.comp, G.sendBig);
        partial(t, 58.27, 0.12, 4, "sine", G.comp, G.sendBig);
        partial(t, 61.74, 0.1, 3.6, "sine", G.comp, G.sendBig);
        const n = burst(t, 0.25, 0.08, 3.4, "lowpass", 2200, 0.7, G.comp, G.sendBig);
        n.frequency.exponentialRampToValueAtTime(180, t + 3);
        duckAmbience(t, EPS, 0.6);
        // A body that is still panting after the game is over is a bug the
        // player will hear immediately.
        S.breathTarget = 0;
        S.heartTarget = 0;
        break;
      }
      default:
        break;
    }
  } catch {
    /* A missing stinger must never block the state change behind it. */
  }
}

/* -------------------------------------------------------------------------- *
 * UI
 *
 * Routed around the compressor and the reverb. Menu sounds are not in the room:
 * putting a click in a 250 m reverb tail makes the menu feel like part of the
 * world, which is exactly what a pause menu must not feel like.
 * -------------------------------------------------------------------------- */

function ui(name) {
  if (!ready()) return;
  try {
    const t = ctx.currentTime + 0.002;
    switch (name) {
      case "hover":
        burst(t, 0.035, 0.0005, 0.008, "bandpass", 2600, 5, G.uiBus);
        break;
      case "click":
        burst(t, 0.1, 0.0005, 0.02, "bandpass", 1800, 2.5, G.uiBus);
        partial(t, 880, 0.05, 0.035, "triangle", G.uiBus);
        break;
      case "back": {
        const o = partial(t, 660, 0.055, 0.09, "triangle", G.uiBus);
        o.frequency.exponentialRampToValueAtTime(440, t + 0.07);
        burst(t, 0.06, 0.0005, 0.018, "bandpass", 1200, 2.5, G.uiBus);
        break;
      }
      case "toggle":
        // Two clicks, because a toggle is a mechanism with two positions and
        // one click leaves the player unsure which one it landed in.
        burst(t, 0.08, 0.0005, 0.014, "bandpass", 2200, 4, G.uiBus);
        burst(t + 0.035, 0.07, 0.0005, 0.016, "bandpass", 1500, 4, G.uiBus);
        break;
      default:
        break;
    }
  } catch {
    /* A silent button still works as a button. */
  }
}

/* -------------------------------------------------------------------------- *
 * Frame hook
 * -------------------------------------------------------------------------- */

/**
 * Called once a frame. Allocation-free: no object literals, no closures, no
 * array growth, nothing that can end up in a minor GC.
 *
 * The work is deliberately throttled to ~20 Hz. Writing AudioParam targets at
 * 144 Hz does nothing a player can hear and does add 144 events a second to
 * the audio thread's schedule, and a frame hook that is cheap is a frame hook
 * nobody has to come back and optimise.
 */
function tick(dt) {
  if (!ctx) return;
  S.tickAcc += dt;
  if (S.tickAcc < 0.05) return;
  S.tickAcc = 0;

  // Smooth the body levels here rather than in the scheduler. The scheduler
  // samples the level once per breath, so a hard jump from calm to panic would
  // otherwise change the rate mid-cycle and sound like a skipped beat.
  S.breathLevel += (S.breathTarget - S.breathLevel) * 0.22;
  S.heartLevel += (S.heartTarget - S.heartLevel) * 0.22;

  if (S.rumbleUntil && ctx.currentTime > S.rumbleUntil) {
    S.rumbleUntil = 0;
    // The sources have all stopped by now; dropping the references is what
    // stops this array growing for the length of a session.
    pending.length = 0;
  }

  // Stop burning a timer in a calm room. It restarts the moment either level
  // is raised again.
  if (
    schedTimer &&
    S.breathTarget === 0 &&
    S.heartTarget === 0 &&
    S.breathLevel < 0.004 &&
    S.heartLevel < 0.004
  ) {
    stopSched();
  }
}

/* -------------------------------------------------------------------------- *
 * Teardown
 * -------------------------------------------------------------------------- */

function dispose() {
  try {
    stopSched();
    for (let i = 0; i < unbind.length; i++) {
      try {
        unbind[i]();
      } catch {
        /* Already gone. */
      }
    }
    unbind.length = 0;
    S.bound = false;
    for (let i = 0; i < G.running.length; i++) {
      try {
        G.running[i].stop();
      } catch {
        /* Already stopped. */
      }
    }
    G.running.length = 0;
    pending.length = 0;
    if (ctx) {
      try {
        G.master.disconnect();
      } catch {
        /* Nothing connected. */
      }
      ctx.close().catch(() => {});
    }
  } catch {
    /* Teardown must not be the thing that throws on the way out. */
  } finally {
    ctx = null;
    ambA = null;
    ambB = null;
    ambFront = null;
    S.built = false;
    S.roomId = -1;
    S.rumbleUntil = 0;
    S.breathLevel = 0;
    S.heartLevel = 0;
  }
}

/* ========================================================================== *
 * BUS
 *
 * The mixer subscribes rather than being told. A settings panel that has to
 * remember to call the audio system is a settings panel that will one day
 * forget, and the symptom - a volume slider that works everywhere except after
 * a reload - is miserable to track down.
 * ========================================================================== */

function readVolumes(payload) {
  if (!payload) return false;
  // Three shapes seen in the wild: the whole settings object, a partial, and a
  // {key, value} pair. Accept all three rather than coupling to one.
  const s = payload.settings ? payload.settings : payload;
  let touched = false;
  if (typeof s.masterVolume === "number") {
    vol.master = clamp01(s.masterVolume);
    touched = true;
  }
  if (typeof s.musicVolume === "number") {
    vol.music = clamp01(s.musicVolume);
    touched = true;
  }
  if (typeof s.sfxVolume === "number") {
    vol.sfx = clamp01(s.sfxVolume);
    touched = true;
  }
  if (typeof s.key === "string" && typeof s.value === "number") {
    if (s.key === "masterVolume") {
      vol.master = clamp01(s.value);
      touched = true;
    } else if (s.key === "musicVolume") {
      vol.music = clamp01(s.value);
      touched = true;
    } else if (s.key === "sfxVolume") {
      vol.sfx = clamp01(s.value);
      touched = true;
    }
  }
  return touched;
}

function bindBus() {
  if (S.bound) return;
  S.bound = true;

  unbind.push(
    on(EV.SETTINGS_CHANGED, (payload) => {
      if (readVolumes(payload)) applyVolumes(0.05);
    })
  );

  unbind.push(
    on(EV.GAME_PAUSE, (payload) => {
      if (!live()) return;
      stopSched();
      // An automatic pause - the tab was hidden or focus was lost - suspends
      // the context outright, because nobody is listening and a phone should
      // not keep an audio thread warm in a pocket.
      //
      // The pause MENU is different. Suspending there kills the menu's own
      // clicks, so the game buses are taken to silence and the context is left
      // running. It is a few hundred microseconds of CPU for a menu that
      // actually responds, which is the right trade.
      const auto = !payload || payload.auto !== false;
      if (auto) {
        suspend();
      } else {
        S.menuPaused = true;
        const t = ctx.currentTime;
        G.bodyBus.gain.setTargetAtTime(EPS, t, 0.08);
        G.rumBus.gain.setTargetAtTime(EPS, t, 0.08);
        applyVolumes(0.08); // takes the music bus down, see the note there
      }
    })
  );

  unbind.push(on(EV.GAME_RESUME, resume));

  unbind.push(
    on(EV.GAME_OVER, () => {
      // Belt and braces: whoever ends the run may or may not fire the stinger,
      // but a heartbeat must never outlive the player.
      S.breathTarget = 0;
      S.heartTarget = 0;
    })
  );
}

// Subscribe immediately, before any context exists. Settings are commonly
// restored from localStorage during boot, long before the first gesture, and
// the volumes that arrive then have to be in place when init() finally runs.
bindBus();

/* -------------------------------------------------------------------------- *
 * Recorded voice clips
 *
 * The thing speech synthesis can never be is CONSISTENT. Whichever voice the
 * browser hands us differs per device, per OS version and per language pack,
 * so the ghost sounds like a different entity on every machine - and because
 * `speechSynthesis` output is unreachable from an AudioContext, none of the
 * processing in `buildGhost` above can be applied to it.
 *
 * A recorded clip fixes both halves at once. It is one performance everywhere,
 * and it is an AudioBuffer, which means it goes through the SAME chain as
 * everything else the ghost does: darkened, doubled, reverberated into the big
 * room, ducking the ambience out from under itself. That is what makes forty
 * separately generated lines sound like one voice rather than forty - the tone
 * is applied here, after the fact, identically to all of them.
 *
 * Clips are optional. A missing file is not an error: `clip()` reports it and
 * story/voice.js falls back to the synthesiser for that line alone.
 * -------------------------------------------------------------------------- */

/**
 * Extensions tried, in order of preference.
 *
 * mp3 first so a project can convert its wavs down later without touching a
 * line of code: forty 48 kHz mono wavs is about fifteen megabytes, the same
 * clips at 96 kbps are under one, and nothing in this file cares which arrived.
 */
const CLIP_EXT = ["mp3", "ogg", "wav"];

/**
 * The extension that worked last time, tried first from then on.
 *
 * A voice set is one format throughout, so the first successful clip tells us
 * what the other forty are. Without this, probing three extensions for every
 * clip means ninety-odd 404s on a wav-only set - which works, and which is a
 * silly thing to do to a phone on a hotel connection.
 */
let clipExt = null;

/** base path (no extension) -> AudioBuffer, or null once known to be absent. */
const clipBuf = new Map();
/** base path -> in-flight load, so a line asked for twice is fetched once. */
const clipLoad = new Map();

/** decodeAudioData, promise form where it exists and callback form where not. */
function decode(bytes) {
  try {
    const p = ctx.decodeAudioData(bytes);
    if (p && typeof p.then === "function") return p;
  } catch {
    /* Safari's older signature throws on the one-argument call. */
  }
  return new Promise((res, rej) => ctx.decodeAudioData(bytes, res, rej));
}

async function fetchClip(base) {
  const order = clipExt
    ? [clipExt, ...CLIP_EXT.filter((e) => e !== clipExt)]
    : CLIP_EXT;

  for (const ext of order) {
    try {
      const res = await fetch(`${encodeURI(base)}.${ext}`, { cache: "force-cache" });
      if (!res.ok) continue;
      const buf = await decode(await res.arrayBuffer());
      clipExt = ext;
      clipBuf.set(base, buf);
      return buf;
    } catch {
      /* Wrong extension, 404, or bytes this browser cannot decode. Try the next. */
    }
  }
  // Remembered as absent, so a line with no clip is not re-fetched on every
  // delivery for the rest of the session.
  clipBuf.set(base, null);
  return null;
}

/** Start a load, or hand back the one already in flight. */
function startLoad(base) {
  if (clipBuf.has(base)) return Promise.resolve(clipBuf.get(base));
  let p = clipLoad.get(base);
  if (!p) {
    p = fetchClip(base).finally(() => clipLoad.delete(base));
    clipLoad.set(base, p);
  }
  return p;
}

/**
 * The buffer for a clip, if it is ready right now.
 *
 *   AudioBuffer  play it
 *   null         there is no such clip; use the synthesiser
 *   undefined    not loaded yet - a load has been started, use the
 *                synthesiser this time and the clip will be there next time
 *
 * Deliberately synchronous. The caller is mid-sentence in a cutscene and
 * cannot await anything: a line that waits for a network round trip has
 * already missed its subtitle.
 */
function clip(base) {
  if (!ready()) return undefined;
  if (clipBuf.has(base)) return clipBuf.get(base);
  startLoad(base);
  return undefined;
}

/**
 * Warm the cache.
 *
 * Called once per language from story/voice.js. Every line that is not in
 * memory when it is first spoken is a line the player hears in a different
 * voice from the rest, which is worse than a slightly longer load.
 */
function preloadClips(bases) {
  // Reported, not silent: the caller needs to know whether the warm-up
  // actually happened so it can try again once a gesture has started the
  // context. Everything here runs long before the first click on most loads.
  if (!ready()) return false;

  const [first, ...rest] = bases;
  if (!first) return true;

  // One clip first, alone, so `clipExt` is known before the other forty go
  // out - otherwise they all race and all probe, which is the thing clipExt
  // exists to avoid.
  startLoad(first).then(() => {
    for (const b of rest) startLoad(b);
  });
  return true;
}

/**
 * How a clip becomes the ghost.
 *
 * The first version of this chain did too little. It darkened the voice and
 * doubled it slightly, which is enough to place a clip in the room but not
 * enough to stop it being recognisably a text-to-speech voice reading a line.
 * A ghost is not a quiet person; it is a voice with something wrong with it,
 * and "wrong" has to be done on purpose:
 *
 *   PITCH        The single biggest factor, and the one the first version did
 *                not touch at all. Played slow, the voice drops in pitch and
 *                lengthens together - no phase vocoder here, so the two are
 *                the same control - and both of those read as inhuman.
 *   WOBBLE       A slow drift in pitch, a few cents either way. A living
 *                throat holds a pitch; this one cannot quite.
 *   RING         Amplitude modulation in the low twenties of hertz, mixed
 *                UNDER the clean voice rather than replacing it. This is the
 *                classic possessed artefact, and the mix is the whole trick:
 *                at 1.0 it is a broken speaker and the words are gone, at
 *                about a quarter it is a voice with a second thing inside it.
 *                The rate falls across the line, like the bed's.
 *   SUB          A copy an octave down, lowpassed to a growl. It cannot track
 *                the words - half speed means half the words in the same time
 *                - which is exactly why it is filtered to below where words
 *                live and kept quiet. It is weight, not language.
 *   DOUBLE       A second copy, 50 ms late and detuned by about a quarter
 *                tone, bandpassed into the whisper register. Near-but-not-
 *                aligned is what makes it a second mouth instead of an echo.
 *   DARKNESS     Highpass to leave the sub bed its own band; lowpass to take
 *                the digital sheen off; a dip where text-to-speech sibilance
 *                lives and a lift in the chest register.
 *
 * Every number is overridable per call, which is what the slider panel in
 * voice-preview.html drives. Tune there, then change the defaults here.
 */
const GHOST_VOICE = {
  rate: 0.82, // playback speed AND pitch: about three semitones down
  wobble: 20, // cents of pitch drift
  wobbleHz: 0.7, // how fast it drifts
  highpass: 140,
  lowpass: 3400,
  sibilance: -7, // dB, at 2.2 kHz
  chest: 3.5, // dB, at 420 Hz
  sub: 0.3, // the octave-down growl
  ring: 0.3, // ring-modulated mix
  ringFrom: 30, // Hz at the start of the line
  ringTo: 21, // Hz by the end
  double: 0.42,
  doubleDelay: 0.05,
  doubleDetune: 0.972, // playback rate of the double, relative to the main
};

/** `opts` wins, then the table above. */
const tune = (opts, key) =>
  typeof opts[key] === "number" ? opts[key] : GHOST_VOICE[key];

/**
 * Play one clip as the ghost.
 *
 * Returns `{ seconds, stop }` - `seconds` is the clip's real duration AFTER
 * the pitch change, which is the whole point of a clip over an estimate: the
 * subtitle is held for exactly as long as the words last.
 *
 * Everything lands on `ghostBus`, which is pre-compressor and permanently sent
 * to the long reverb, so a clip occupies exactly the space the synthesised
 * half of the ghost already does.
 */
function voiceClip(buffer, opts = {}) {
  const noop = { seconds: 0, stop() {} };
  if (!ready() || !S.built || !buffer) return noop;

  const level = clamp(typeof opts.gain === "number" ? opts.gain : 1, 0, 1.5);
  // `raw` is the preview tool asking for the file as it is on disk, so it is
  // the one case that is played at its own speed.
  const rate = clamp(opts.raw ? 1 : tune(opts, "rate"), 0.4, 1.5);
  const seconds = buffer.duration / rate;

  try {
    const t = ctx.currentTime + 0.02;
    const end = t + seconds;

    /* --- the output gain, and the fades ------------------------------- */
    const g = gn(0);
    g.connect(opts.raw ? G.master : G.ghostBus);

    // A buffer that starts at full gain clicks if the generator left a
    // non-zero first sample, and most of them do.
    const fade = Math.min(0.03, seconds * 0.2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + fade);
    g.gain.setValueAtTime(level, Math.max(t + fade, end - fade));
    g.gain.linearRampToValueAtTime(0, end + 0.01);

    const sources = [];
    const parts = [];
    const main = src(buffer, false);
    main.playbackRate.value = rate;
    sources.push(main);

    /* --- raw: no chain at all ----------------------------------------- */
    if (opts.raw) {
      main.connect(g);
    } else {
      /* --- the main voice --------------------------------------------- */
      const hp = bq("highpass", tune(opts, "highpass"), 0.7);
      const lp = bq("lowpass", tune(opts, "lowpass"), 0.9);
      const dip = bq("peaking", 2200, 1.1);
      dip.gain.value = tune(opts, "sibilance");
      const chest = bq("peaking", 420, 0.9);
      chest.gain.value = tune(opts, "chest");
      const shaped = gn(1);

      main.connect(hp);
      hp.connect(lp);
      lp.connect(dip);
      dip.connect(chest);
      chest.connect(shaped);
      shaped.connect(g);
      parts.push(hp, lp, dip, chest, shaped);

      /* --- pitch wobble ----------------------------------------------- */
      const cents = tune(opts, "wobble");
      if (cents > 0 && main.detune) {
        const lfo = osc("sine", tune(opts, "wobbleHz"));
        const depth = gn(cents);
        lfo.connect(depth);
        depth.connect(main.detune);
        lfo.start(t);
        lfo.stop(end + 0.3);
        parts.push(depth);
      }

      /* --- ring modulation, mixed under the clean voice ---------------- */
      const ringMix = tune(opts, "ring");
      if (ringMix > 0) {
        // A gain node whose gain is driven by a bipolar oscillator IS a ring
        // modulator: the signal is multiplied by the carrier, inversions and
        // all. Nothing else in the Web Audio set does this.
        const vca = gn(0);
        const carrier = osc("sine", tune(opts, "ringFrom"));
        const out = gn(ringMix);
        carrier.connect(vca.gain);
        shaped.connect(vca);
        vca.connect(out);
        out.connect(g);
        carrier.frequency.setValueAtTime(tune(opts, "ringFrom"), t);
        carrier.frequency.linearRampToValueAtTime(tune(opts, "ringTo"), end);
        carrier.start(t);
        carrier.stop(end + 0.3);
        parts.push(vca, out);
      }

      /* --- the octave-down growl --------------------------------------- */
      const subMix = tune(opts, "sub");
      if (subMix > 0) {
        const low = src(buffer, false);
        low.playbackRate.value = rate * 0.5;
        const lowLp = bq("lowpass", 700, 1.1);
        const lowG = gn(subMix);
        low.connect(lowLp);
        lowLp.connect(lowG);
        lowG.connect(g);
        sources.push(low);
        parts.push(lowLp, lowG);
      }

      /* --- the second mouth -------------------------------------------- */
      const dblMix = tune(opts, "double");
      if (dblMix > 0) {
        const second = src(buffer, false);
        second.playbackRate.value = rate * tune(opts, "doubleDetune");
        const d = ctx.createDelay(0.5);
        d.delayTime.value = tune(opts, "doubleDelay");
        const bp = bq("bandpass", 1500, 0.8);
        const dg = gn(dblMix);
        second.connect(d);
        d.connect(bp);
        bp.connect(dg);
        dg.connect(g);
        sources.push(second);
        parts.push(d, bp, dg);
      }
    }

    let stopped = false;
    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* Already finished. */
        }
        s.disconnect();
      }
      for (const p of parts) p.disconnect();
      g.disconnect();
    };

    // The main voice is the one that defines the line's length. The sub copy
    // runs at half speed and would otherwise outlast it by the length of the
    // line again, so every source is stopped together.
    main.onended = cleanup;
    for (const s of sources) {
      s.start(t);
      s.stop(end + 0.25);
    }

    return {
      seconds,
      stop() {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          // 40 ms out rather than a hard stop: a cut-off voice is a glitch,
          // a voice that stops in 40 ms is a voice that stopped.
          g.gain.setTargetAtTime(0, ctx.currentTime, 0.013);
        } catch {
          /* Falling straight to cleanup is still better than nothing. */
        }
        window.setTimeout(cleanup, 70);
      },
    };
  } catch {
    // A clip that cannot be routed is a line with no voice, which the caller
    // handles the same way it handles a device with no speech engine at all.
    return noop;
  }
}

/* ========================================================================== *
 * EXPORT
 *
 * One object, no `this` anywhere behind it, so every method can be handed
 * straight to the loop or to an event listener without binding:
 *
 *   addFrame(audio.tick, ORDER.AUDIO);
 *   window.addEventListener("pointerdown", audio.init);
 * ========================================================================== */

export const audio = {
  init,
  suspend,
  resume,
  setVolumes,
  footstep,
  play(name, opts) {
    if (!ready()) return;
    try {
      oneShot(name, opts);
    } catch {
      /* One missing sound is never worth a broken interaction. */
    }
  },
  ambience,
  rumble,
  stopRumble,
  breathing,
  heartbeat,
  stinger,
  ui,
  tick,
  dispose,

  /* --- WITHROOM: the story layer's own voices --- */
  clip,
  preloadClips,
  voiceClip,
  // A copy, so the tuning panel in voice-preview.html can show the defaults
  // without being able to change them behind the game's back.
  ghostVoiceDefaults: () => ({ ...GHOST_VOICE }),
  ghostVoiceBed,
  ghostLaugh,
  bed,
  bedsOff,
  engineRpm,
};

export default audio;
