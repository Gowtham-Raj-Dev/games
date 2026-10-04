/**
 * STAGE 4 - THE LOCK.
 *
 * A four-digit keypad bolted beside the main door. Three of the digits are
 * given to the player by the three stages before it; the fourth is scratched
 * into the floor under the bed and has to be found.
 *
 * The structure is the point. Act one is four doors and four answers, and this
 * is where the first three answers turn out to have been the same answer all
 * along - which is why the digits are not hidden in the world as four separate
 * collectables. They are EARNED, and the game shows them being earned: each
 * one is burned into the door frame at the moment its stage is solved, and the
 * frame can be re-read at any time so nobody is ever asked to remember four
 * digits across a twenty-minute session.
 *
 * The fourth digit is the exception and it is the one piece of pure searching in
 * act one: it is under the bed, which means the player has to crouch, which
 * means they have to be told crouching exists. That is why the hint for this
 * stage names the key.
 */

import * as THREE from "three";

import { audio } from "../../audio/manager.js";
import { EV, emit } from "../../core/bus.js";
import { mat } from "../../engine/materials.js";
import * as textures from "../../engine/textures.js";
import { t } from "../../i18n/strings.js";
import * as hud from "../../ui/hud.js";
import * as roomScale from "../roomScale.js";

export const id = "keypad";

const STATE = 3;

/**
 * The code.
 *
 * Each digit is attached to the stage that reveals it, so the door frame and
 * the keypad cannot disagree about what the answer is - and a designer changing
 * one digit changes it everywhere.
 */
export const CODE = [
  { digit: "4", from: "stage1Solved", why: "clock" },
  { digit: "7", from: "stage2Solved", why: "sigils" },
  { digit: "1", from: "stage3Solved", why: "power" },
  { digit: "9", from: "foundFloorDigit", why: "floor" },
];

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "E"];

let api = null;
let group = null;
let pad = null;
let frameMarks = null;
let floorMark = null;
let display = null;
let displayCanvas = null;
let displayTex = null;

let entry = "";
let solved = false;
let wrongCount = 0;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(outer) {
  api = outer;
  group = new THREE.Group();
  group.name = "puzzle:keypad";
  group.visible = false;
  api.root.add(group);

  buildPad();
  buildFrameMarks();
  buildFloorDigit();
}

/**
 * The keypad.
 *
 * Twelve separate interactable keys rather than one target that cycles a digit.
 * A cycling single target is far easier to build and it is the wrong thing: a
 * four-digit code entered by pressing one button forty times is not a lock, it
 * is a chore. Each key is 42 mm, which at the distance a player stands to use
 * it is a comfortably large target even with a thumb.
 */
function buildPad() {
  pad = new THREE.Group();
  pad.name = "keypad";

  const W = 0.17;
  const H = 0.25;

  const case_ = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.035), mat.plastic(0x1e2024));
  case_.castShadow = true;
  case_.receiveShadow = true;
  pad.add(case_);

  /* --- the display ------------------------------------------------------ *
   * One canvas, owned by this module, redrawn on every keypress. Four
   * characters at 256x64 is nothing, and it means the entry can be SEEN -
   * which a lock has to be, or a mistyped digit is indistinguishable from a
   * wrong code.
   */
  displayCanvas = document.createElement("canvas");
  displayCanvas.width = 256;
  displayCanvas.height = 72;
  displayTex = new THREE.CanvasTexture(displayCanvas);
  displayTex.colorSpace = THREE.SRGBColorSpace;

  display = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.82, H * 0.17),
    new THREE.MeshStandardMaterial({
      map: displayTex,
      emissiveMap: displayTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      metalness: 0,
    }),
  );
  display.position.set(0, H * 0.34, 0.019);
  pad.add(display);
  paintDisplay();

  /* --- the keys --------------------------------------------------------- */
  const keyGeo = new THREE.BoxGeometry(0.042, 0.042, 0.012);
  const keyMat = mat.plastic(0x33373d);
  const okMat = mat.plastic(0x2a4036);
  const clearMat = mat.plastic(0x40302e);

  for (let i = 0; i < KEYS.length; i++) {
    const label = KEYS[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = (col - 1) * 0.05;
    const y = H * 0.16 - row * 0.05;

    const key = new THREE.Group();
    key.position.set(x, y, 0.024);

    const cap = new THREE.Mesh(
      keyGeo,
      label === "E" ? okMat : label === "C" ? clearMat : keyMat,
    );
    cap.castShadow = false;
    key.add(cap);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 0.03),
      new THREE.MeshStandardMaterial({
        map: textures.wallText(label, {
          width: 128,
          height: 128,
          font: "700 86px Share Tech Mono, monospace",
        }),
        transparent: true,
        roughness: 0.6,
        emissive: 0x9fb0bb,
        emissiveIntensity: 0.25,
      }),
    );
    face.position.z = 0.0075;
    key.add(face);

    pad.add(key);

    api.register(key, {
      hit: cap,
      verb: "pressSwitch",
      name: "objKeypad",
      // No per-target reach adjustment is needed: the interaction raycast is a
      // sphere cast with INTERACT.aimAssist, and a 42 mm key at the distance a
      // player stands to use a keypad is already a comfortable thumb target.
      onUse: () => press(label, key),
    });
    key.userData.travel = 0;
  }

  api.place(pad, { kind: "wall", side: "south", along: 0.68, offset: 0.07, y: 1.24 });
  group.add(pad);
}

/** Redraw the four-character entry display. */
function paintDisplay() {
  if (!displayCanvas) return;
  const ctx = displayCanvas.getContext("2d");
  const w = displayCanvas.width;
  const h = displayCanvas.height;

  ctx.fillStyle = "#0a1512";
  ctx.fillRect(0, 0, w, h);

  // Segment ghosts: the unlit characters of a real LCD, which is what makes it
  // read as a display rather than as a label.
  ctx.font = "700 48px 'Share Tech Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(111,224,189,0.12)";
  for (let i = 0; i < 4; i++) ctx.fillText("8", w * (0.2 + i * 0.2), h * 0.54);

  ctx.fillStyle = solved ? "#9fe8c8" : wrongCount > 0 && entry === "" ? "#e8646a" : "#6fe0bd";
  const shown = solved ? "OPEN" : entry.padEnd(4, " ");
  for (let i = 0; i < 4; i++) {
    const ch = shown[i] ?? " ";
    if (ch !== " ") ctx.fillText(ch, w * (0.2 + i * 0.2), h * 0.54);
  }

  displayTex.needsUpdate = true;
}

/**
 * Digits burned into the door frame as they are earned.
 *
 * Four slots, each empty until its stage is solved. They are on the frame of
 * the door the code opens, which is the one place in the room a player will
 * certainly look again.
 */
function buildFrameMarks() {
  frameMarks = new THREE.Group();

  for (let i = 0; i < CODE.length; i++) {
    const slot = new THREE.Mesh(
      new THREE.PlaneGeometry(0.075, 0.075),
      new THREE.MeshStandardMaterial({
        map: textures.wallText(CODE[i].digit, {
          width: 128,
          height: 128,
          font: "700 90px Share Tech Mono, monospace",
        }),
        transparent: true,
        opacity: 0,
        roughness: 0.9,
        // Burned in, not written: a faint ember glow that never quite goes out.
        emissive: 0xa33c22,
        emissiveIntensity: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    slot.position.set(0, 1.6 - i * 0.1, 0);
    slot.visible = false;
    frameMarks.add(slot);
  }

  api.place(frameMarks, { kind: "wall", side: "south", along: 0.41, offset: 0.09, y: 0 });
  group.add(frameMarks);

  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.5),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.set(0, 1.35, 0.01);
  frameMarks.add(hit);

  api.register(frameMarks, {
    hit,
    verb: "readIt",
    name: "objBurnMarks",
    onUse: () => {
      const known = CODE.filter((c) => api.getFlag(c.from)).map((c) => c.digit);
      hud.subtitle(
        known.length === 0
          ? t("marksEmpty")
          : t("marksRead", known.join(" "), CODE.length - known.length),
        4.5,
      );
      audio.play("woodTap", { gain: 0.5 });
      return true;
    },
  });
}

/**
 * The fourth digit, scratched into the floor under the bed.
 *
 * Face up on the concrete, so it is only legible from low down and close - the
 * player has to crouch and put their head where his was. It is the one piece of
 * information in act one that the room does not hand over.
 */
function buildFloorDigit() {
  floorMark = new THREE.Group();

  const scratch = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshStandardMaterial({
      map: textures.wallText(CODE[3].digit, {
        width: 128,
        height: 128,
        font: "700 96px Share Tech Mono, monospace",
      }),
      transparent: true,
      opacity: 0.8,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  scratch.rotation.x = -Math.PI / 2;
  scratch.position.y = 0.003;
  floorMark.add(scratch);

  // A scratched-up patch of concrete around it, so the digit does not look
  // printed on a clean floor.
  const scuff = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.42),
    new THREE.MeshBasicMaterial({
      map: textures.stain(),
      color: 0x6a6258,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  scuff.rotation.x = -Math.PI / 2;
  scuff.position.y = 0.0015;
  floorMark.add(scuff);

  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.rotation.x = -Math.PI / 2;
  hit.position.y = 0.02;
  floorMark.add(hit);

  api.place(floorMark, { kind: "free" }, { id: "floorDigit" });
  group.add(floorMark);

  api.register(floorMark, {
    hit,
    verb: "readIt",
    name: "objScratch",
    onUse: () => {
      const first = !api.getFlag("foundFloorDigit");
      api.setFlag("foundFloorDigit");
      hud.subtitle(t("floorDigit", CODE[3].digit), 4);
      audio.play("paperRustle", { gain: 0.5 });
      if (first) {
        audio.play("clockChime", { gain: 0.4 });
        refreshMarks();
      }
      return true;
    },
  });
}

/* -------------------------------------------------------------------------- *
 * Entry
 * -------------------------------------------------------------------------- */

function press(label, key) {
  // The key physically moves. 2 mm, for 80 ms - and without it a keypad is a
  // picture of a keypad.
  key.userData.travel = 0.12;

  if (solved) {
    audio.play("keypadBeep", { gain: 0.5 });
    return true;
  }

  api.setFlag("usedKeypad");

  if (label === "C") {
    entry = "";
    wrongCount = 0;
    audio.play("keypadBeep", { gain: 0.8 });
    paintDisplay();
    return true;
  }

  if (label === "E") {
    submit();
    return true;
  }

  if (entry.length >= 4) {
    // Full. Rolling over silently would make a mistyped fifth digit look like
    // the keypad had stopped working.
    audio.play("keypadWrong", { gain: 0.4 });
    return true;
  }

  entry += label;
  audio.play("keypadBeep");
  paintDisplay();

  // Four digits in: submit on its own, without needing the enter key. A lock
  // that needs a confirmation press after a fixed-length code is a lock that
  // has been designed by a form.
  if (entry.length === 4) window.setTimeout(submit, 220);
  return true;
}

function submit() {
  if (solved || entry.length < 4) {
    if (!solved) {
      audio.play("keypadWrong", { gain: 0.6 });
      hud.subtitle(t("codeShort"), 2.4);
    }
    return;
  }

  const want = CODE.map((c) => c.digit).join("");
  if (entry !== want) {
    wrongCount++;
    entry = "";
    paintDisplay();
    audio.play("keypadWrong");
    hud.subtitle(wrongCount >= 3 ? t("codeWrongAgain") : t("codeWrong"), 3);
    /*
     * A wrong code costs nothing.
     *
     * Deliberate, and consistent with the rest of the game: the stability
     * economy only moves on MAJOR outcomes, and guessing at a lock has to stay
     * free or players stop experimenting. The punishment for a wrong code is
     * that the door is still shut.
     */
    emit(EV.PUZZLE_FAILED_MINOR, { id: "keypad" });
    return;
  }

  solved = true;
  entry = "";
  paintDisplay();

  api.setFlag("stage4Solved");
  // The door is now openable. The door itself owns what happens when it is -
  // which is the flashback, and it is not this module's business.
  api.setFlag("doorUnlocked");

  audio.play("keypadRight");
  audio.play("lockTurn");
  audio.stinger("solved");
  hud.subtitle(t("codeRight"), 4);

  api.solve(4);
}

/** Show the digits that have been earned. */
function refreshMarks() {
  if (!frameMarks) return;
  for (let i = 0; i < CODE.length; i++) {
    const slot = frameMarks.children[i];
    if (!slot?.material) continue;
    const known = api.getFlag(CODE[i].from);
    slot.visible = !!known;
    slot.material.opacity = known ? 0.92 : 0;
  }
}

/* -------------------------------------------------------------------------- *
 * Layout, beat, frame
 * -------------------------------------------------------------------------- */

export function layout() {
  if (!floorMark) return;
  /*
   * Under the bed - and the position is read from the bed's own record rather
   * than written down, because the bed is wall-anchored and travels outward
   * when the room grows. A digit left behind in the middle of the floor would
   * be the single most confusing thing in act one.
   */
  const bed = api.find("bed");
  if (bed) {
    floorMark.position.set(bed.object.position.x, 0, bed.object.position.z + 0.1);
  } else {
    const dims = roomScale.dims;
    floorMark.position.set(0, 0, -dims.hd + 1);
  }
}

export function onBeat() {
  const state = roomScale.stateId();
  // The keypad appears when the door's lock does - at the stage it belongs to -
  // and stays for the rest of the game.
  const on = state >= STATE;
  if (group) group.visible = on;
  // The floor digit is findable from the start. It has to be: a player who
  // crawls under the bed in the first five minutes should be rewarded for it,
  // not told to come back in three stages.
  if (floorMark) floorMark.visible = true;
  refreshMarks();
  layout();
}

export function tick(dt) {
  if (!pad) return;
  // Key travel. Cheap enough to run unconditionally, and it is the only
  // per-frame work this puzzle does.
  for (const child of pad.children) {
    if (child.userData.travel === undefined) continue;
    if (child.userData.travel <= 0) continue;
    child.userData.travel = Math.max(0, child.userData.travel - dt * 6);
    child.position.z = 0.024 - (child.userData.travel > 0.06 ? 0.002 : 0);
  }
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  return { solved, wrongCount };
}

export function deserialise(data) {
  if (!data) return;
  solved = !!data.solved;
  wrongCount = data.wrongCount ?? 0;
  entry = "";
  paintDisplay();
  onBeat();
}

export function reset() {
  solved = false;
  entry = "";
  wrongCount = 0;
  paintDisplay();
  onBeat();
}
