/**
 * THE FLASHBACK.
 *
 * What actually happened at the door. Played once, after the fourth lock opens,
 * and it is the only time the game tells the player the truth.
 *
 * The scene is built to answer exactly one question - how did he get inside? -
 * and to raise two more: what took her, and why it left him alive. So it shows
 * the arrival, the door, and the grab, and then it stops. There is no shot of
 * her being carried away and no shot of the thing's face, because the game has
 * another two acts to run and a horror that has been seen clearly is a horror
 * that is finished.
 *
 * Staged as a WALK-IN, which is the one piece of blocking this engine's
 * characters are built for: they are seen from behind at a distance, in fog, in
 * silhouette, with a single torch - and a silhouette walking away from camera is
 * the most forgiving shot a procedural human can be given. The close-ups are
 * saved for the two seconds where they are lit by the torch and the player is
 * looking at her face rather than at her gait.
 */

import * as THREE from "three";

import { EV, emit } from "../core/bus.js";
import { clamp01, damp, lerp, makeRng, noise1 } from "../core/maths.js";
import { get as getPlatform } from "../core/platform.js";
import { mat } from "../engine/materials.js";
import * as renderer from "../engine/renderer.js";
import { audio } from "../audio/manager.js";
import * as human from "../characters/human.js";
import * as wraithFactory from "../characters/wraith.js";
import * as cinema from "../ui/cinema.js";
import * as dialogue from "../story/dialogue.js";
import * as director from "../story/director.js";
import { t } from "../i18n/strings.js";
import { FLASHBACK as FLASHBACK_SCRIPT } from "../story/script.js";

let scene = null;
let facade = null;
let doorPivot = null;
let torch = null;
let torchGlow = null;
let wraith = null;
let him = null;
let her = null;
let lights = null;
let car = null;

/** Where the two of them are on their walk, in metres from the door. */
const S = {
  active: false,
  time: 0,
  /** 0 at the car, 1 at the door. */
  walk: 0,
  wantWalk: 0,
  /** Walk speed in m/s, 0 when standing. */
  pace: 0,
  doorOpen: 0,
  wantDoorOpen: 0,
  /** The grab: 0 before, 1 at full violence. */
  attack: 0,
  wantAttack: 0,
  /** Her position, which the attack takes over from the walk. */
  herDrag: 0,
  blackout: 0,
  himLook: null,
  herLook: null,
  himPose: "wary",
  herPose: "wary",
};

/** The walk runs from z = +WALK_FROM to z = +WALK_TO (the door is at z = 0). */
const WALK_FROM = 13;
const WALK_TO = 2.1;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

function build() {
  const q = getPlatform().settings;
  const rng = makeRng(515151);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050a);
  /*
   * Fog, but not as tight as the car's.
   *
   * The first pass used 34 m, which is less than the distance the opening shot
   * stands at - so the building the scene is about was 55% fog before anything
   * was lit, and the whole sequence played out on a black screen. 58 m leaves
   * the facade readable from the car and still hides everything beyond it.
   */
  scene.fog = new THREE.Fog(0x05070b, 2, 58);

  /* --- ground ----------------------------------------------------------- */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    mat.cloth(0x12140f, 1),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = q.shadows;
  scene.add(ground);

  // A gravel path to the door: a slightly lighter strip, so the eye knows
  // where the scene is going before anybody starts walking.
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 26), mat.asphalt());
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.008, 11);
  scene.add(path);

  /* --- the building ----------------------------------------------------- */
  facade = buildFacade(rng);
  scene.add(facade);

  /* --- the car, parked, lights still on --------------------------------- */
  car = buildParkedCar();
  car.position.set(1.6, 0, 17.5);
  car.rotation.y = -0.3;
  scene.add(car);

  /* --- lights ----------------------------------------------------------- */
  lights = buildLights();

  /* --- torch ------------------------------------------------------------ */
  /*
   * He is carrying a phone, not a torch.
   *
   * It matters: a phone's light is a small, cold, badly-aimed source held at
   * chest height, and that is a far more unsettling way to light a building
   * than a proper beam. It also motivates the one warm highlight on their
   * faces in the whole scene.
   */
  torch = new THREE.SpotLight(0xcfe4ff, 9, 16, 0.6, 0.5, 1.6);
  torch.castShadow = q.shadows;
  if (torch.castShadow) {
    torch.shadow.mapSize.set(Math.min(1024, q.shadowMapSize), Math.min(1024, q.shadowMapSize));
    torch.shadow.camera.near = 0.3;
    torch.shadow.camera.far = 18;
    torch.shadow.bias = -0.0015;
  }
  scene.add(torch);
  scene.add(torch.target);

  torchGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 0.14),
    mat.beam(0xd8ecff, 0.8),
  );
  scene.add(torchGlow);

  /* --- the people ------------------------------------------------------- */
  him = human.build("him");
  her = human.build("her");
  him.setPose("wary", { instant: true });
  her.setPose("wary", { instant: true });
  scene.add(him.root);
  scene.add(her.root);

  /* --- the thing -------------------------------------------------------- */
  wraith = wraithFactory.build(scene, { seed: 2027 });
  wraith.place(0, 0, -0.9);

  renderer.requestShadowUpdate();
  return scene;
}

/**
 * The front of the building.
 *
 * Only the front. The scene never sees a corner, so there is no building behind
 * this - it is a wall, a doorway, a porch and a roofline, which from the only
 * angle the camera ever takes is indistinguishable from a building and costs
 * about one percent as much.
 */
function buildFacade(rng) {
  const g = new THREE.Group();
  const wallMat = mat.cloth(0x3a3630, 0.95);
  const stoneMat = mat.cloth(0x2e2b26, 0.9);
  const woodMat = mat.wood();

  // The wall, with a doorway hole left in it: two side panels and a lintel
  // panel rather than one wall with a boolean cut.
  const H = 9.5;
  const W = 22;
  const doorW = 1.3;
  const doorH = 2.4;

  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry((W - doorW) / 2, H, 0.6),
      wallMat,
    );
    panel.position.set(side * (doorW / 2 + (W - doorW) / 4), H / 2, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    g.add(panel);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.4, H - doorH, 0.6), wallMat);
  lintel.position.set(0, doorH + (H - doorH) / 2, 0);
  lintel.castShadow = true;
  lintel.receiveShadow = true;
  g.add(lintel);

  // A blacked-out interior plane behind the doorway. Without it the doorway
  // shows the fog colour and reads as a window rather than as a way in.
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(doorW + 0.3, doorH + 0.2), mat.void());
  inside.position.set(0, doorH / 2, -0.45);
  g.add(inside);

  // Steps up to it. Three, shallow, because they are the thing the characters
  // stop at and the camera will be level with them.
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 0.4), stoneMat);
    step.position.set(0, 0.07 + i * 0.14, 0.9 - i * 0.4);
    step.castShadow = true;
    step.receiveShadow = true;
    g.add(step);
  }

  // Porch: two posts and a flat hood. It frames the door, which is what makes
  // the door the subject of every shot it is in.
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.9, 0.16), woodMat);
    post.position.set(side * 1.5, 1.45, 1.1);
    post.castShadow = true;
    g.add(post);
  }
  const hood = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.5), woodMat);
  hood.position.set(0, 2.95, 0.5);
  hood.castShadow = true;
  g.add(hood);

  /* --- the door itself -------------------------------------------------- */
  doorPivot = new THREE.Group();
  doorPivot.position.set(-doorW / 2, 0, 0.02);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.07), woodMat);
  leaf.position.set(doorW / 2, doorH / 2, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  doorPivot.add(leaf);
  g.add(doorPivot);

  /* --- windows ---------------------------------------------------------- */
  // Boarded, every one of them, which says more about the building than any
  // amount of texture work: somebody closed this place and meant it.
  const boardMat = mat.woodPale();
  for (let i = 0; i < 8; i++) {
    const col = (i % 4) - 1.5;
    const row = Math.floor(i / 4);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.1), mat.void());
    frame.position.set(col * 4.2 + (col > 0 ? 1.2 : -1.2), 4.2 + row * 2.8, 0.26);
    g.add(frame);
    for (let b = 0; b < 3; b++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.05), boardMat);
      board.position.set(frame.position.x, frame.position.y - 0.5 + b * 0.5, 0.34);
      board.rotation.z = (rng() - 0.5) * 0.14;
      board.castShadow = true;
      g.add(board);
    }
  }

  // Roofline: a shallow parapet, so the building has a top edge against the
  // fog instead of fading out into it.
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.5, 1.0), stoneMat);
  parapet.position.set(0, H + 0.2, 0.1);
  parapet.castShadow = true;
  g.add(parapet);

  return g;
}

/** The car they arrived in, seen from behind with its lights still on. */
function buildParkedCar() {
  const g = new THREE.Group();
  const body = mat.carPaint(0x1b1f23);

  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.78, 4.3), body);
  shell.position.y = 0.72;
  shell.castShadow = true;
  g.add(shell);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.62, 2.2), body);
  cab.position.set(0, 1.36, -0.1);
  cab.castShadow = true;
  g.add(cab);

  const tyre = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10);
  const tyreMat = mat.cloth(0x0b0b0d, 0.85);
  for (const x of [-0.84, 0.84]) {
    for (const z of [-1.4, 1.4]) {
      const w = new THREE.Mesh(tyre, tyreMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.33, z);
      g.add(w);
    }
  }

  // Headlights, still on, pointing away from the building. They are the only
  // light behind the characters, which makes them silhouettes as they walk off
  // - and silhouettes are the best thing these characters can be.
  for (const x of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.14),
      mat.beam(0xfff2d8, 0.9),
    );
    lamp.position.set(x, 0.72, -2.17);
    g.add(lamp);
  }
  const spill = new THREE.SpotLight(0xfff0d0, 14, 22, 0.5, 0.7, 1.5);
  spill.position.set(0, 0.72, -2.2);
  spill.target.position.set(0, 0, -16);
  g.add(spill);
  g.add(spill.target);

  return g;
}

function buildLights() {
  // Night, but a night with a sky in it. Low and cold.
  const hemi = new THREE.HemisphereLight(0x2a3848, 0x05070a, 1.1);
  scene.add(hemi);

  /*
   * The moon, in front of the building and high to the left.
   *
   * It was behind the building in the first pass - which is where you would put
   * a rim light - and the result was a facade with a lit edge and a completely
   * black face, in a scene whose entire subject is that face and the door in it.
   * A three-quarter front key at low intensity gives the wall its planes and
   * still leaves the doorway as the darkest thing in frame.
   */
  const key = new THREE.DirectionalLight(0x6f86a8, 1.5);
  key.position.set(-14, 16, 22);
  scene.add(key);
  scene.add(key.target);

  // And a true rim from behind, so the roofline separates from the sky.
  const rim = new THREE.DirectionalLight(0x3a5272, 0.8);
  rim.position.set(6, 18, -14);
  scene.add(rim);

  return { hemi, rim, key };
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

const _tmp = new THREE.Vector3();

export function tick(dt) {
  if (!S.active || !scene) return;
  S.time += dt;

  /* --- the walk --------------------------------------------------------- */
  const prev = S.walk;
  S.walk = damp(S.walk, S.wantWalk, 0.9, dt);
  // Pace is derived from how far they actually moved, so the walk cycle and the
  // translation can never disagree - the classic sliding-feet bug.
  const moved = Math.abs(S.walk - prev) * (WALK_FROM - WALK_TO);
  S.pace = dt > 0 ? clamp01(moved / dt / 1.4) : 0;

  const z = lerp(WALK_FROM, WALK_TO, S.walk);
  him.place(-0.42, 0, z, Math.PI);
  // She walks half a step behind him, as asked for in the dialogue, and drifts
  // further back as the walk goes on.
  her.place(0.46, 0, z + 0.55 + S.walk * 0.25 + S.herDrag * 2.4, Math.PI);

  /* --- the attack ------------------------------------------------------- */
  S.attack = damp(S.attack, S.wantAttack, 4, dt);
  if (S.attack > 0.01) {
    /*
     * She is pulled TOWARD the door and UP.
     *
     * Toward, because the thing is inside; up, because something lifting a
     * person off their feet is the clearest possible signal that it is not a
     * person. The vertical is small - 30 cm - because more than that stops
     * reading as a grab and starts reading as flight.
     */
    S.herDrag = damp(S.herDrag, -1.35, 2.6, dt);
    her.root.position.z = z + 0.55 + S.herDrag * 2.4;
    her.root.position.y = Math.max(0, -S.herDrag) * 0.3 * S.attack;
    her.root.rotation.z = Math.sin(S.time * 14) * 0.12 * S.attack;

    wraith.appear(S.attack);
    wraith.reach(true);
    wraith.fury(S.attack);

    // He lunges after her, and does not get there.
    him.root.position.z = z - S.attack * 0.55;

    director.addTrauma(dt * 2.4 * S.attack);
  }

  /* --- the door --------------------------------------------------------- */
  S.doorOpen = damp(S.doorOpen, S.wantDoorOpen, 1.6, dt);
  doorPivot.rotation.y = -S.doorOpen * 1.5;

  /* --- the phone -------------------------------------------------------- */
  // Held at his chest, aimed where he is looking, wobbling with his stride.
  him.parts.chest.getWorldPosition(_tmp);
  const wob = S.pace * 0.06;
  torch.position.set(
    _tmp.x + 0.12 + noise1(S.time * 2.1) * wob,
    _tmp.y + 0.1 + noise1(S.time * 2.6 + 9) * wob,
    _tmp.z - 0.24,
  );
  torchGlow.position.copy(torch.position);
  torchGlow.lookAt(director.camera?.position ?? _tmp);
  // Aimed slightly low and at the door: nobody holds a phone level.
  torch.target.position.set(
    noise1(S.time * 0.9) * 0.5,
    1.1 + noise1(S.time * 1.1 + 3) * 0.2,
    torch.position.z - 6,
  );
  // During the attack the phone is dropped and lies on the steps, pointing at
  // nothing. It is the last thing lighting the scene.
  if (S.attack > 0.5) {
    torch.position.y = damp(torch.position.y, 0.08, 3, dt);
    torch.target.position.set(2.5, 0.4, 3);
    torch.intensity = damp(torch.intensity, 3.5, 2, dt);
  }

  /* --- blackout --------------------------------------------------------- */
  if (S.blackout > 0) {
    const k = clamp01(S.blackout);
    lights.hemi.intensity = 1.1 * (1 - k);
    lights.rim.intensity = 0.8 * (1 - k);
    lights.key.intensity = 1.5 * (1 - k);
    torch.intensity = lerp(torch.intensity, 0, k);
    car.visible = k < 0.9;
  }

  /* --- the people ------------------------------------------------------- */
  const speaker = dialogue.currentSpeaker();
  const emo = dialogue.currentLine()?.emo ?? "calm";

  him.update(dt, {
    talking: speaker === "him",
    emotion: S.attack > 0.1 ? "desperate" : speaker === "him" ? emo : "wary",
    breathRate: 0.3 + S.attack * 0.6,
    lookAt: S.himLook,
    walk: S.attack > 0.1 ? 0 : S.pace,
    pose: S.himPose,
  });
  her.update(dt, {
    talking: speaker === "her",
    emotion: S.attack > 0.1 ? "panic" : speaker === "her" ? emo : "afraid",
    breathRate: 0.34 + S.attack * 0.9,
    lookAt: S.herLook,
    walk: S.attack > 0.1 ? 0 : S.pace,
    pose: S.herPose,
  });

  wraith.update(dt, director.camera);
}

/* -------------------------------------------------------------------------- *
 * Shots
 * -------------------------------------------------------------------------- */

function shots() {
  return [
    // 1. The building, from the car's bonnet, with the two of them in
    //    silhouette against the headlights. Slow push in.
    {
      pos: [1.2, 1.6, 16.5], to: [0.9, 1.55, 13.5],
      look: [0, 3.4, 0], lookTo: [0, 2.4, 0],
      fov: 40, dur: 9, hold: 0.8, ease: "sineInOut", handheld: 1,
    },
    // 2. Tracking behind them as they walk. The camera is on their level and
    //    slightly low, so the facade grows over them.
    {
      pos: [-1.5, 1.35, 11.5], to: [-1.1, 1.4, 6.5],
      look: [-0.2, 1.4, 2], lookTo: [0, 1.6, 0.4],
      fov: 36, dur: 12, hold: 0.4, ease: "sineInOut", handheld: 1.5,
    },
    // 3. Her face, from the front, lit by the phone. Two seconds of a close-up
    //    and then away: long enough to care, not long enough to inspect.
    {
      pos: [1.1, 1.6, 2.6], to: [0.95, 1.58, 2.4],
      look: [0.46, 1.52, 3.1], lookTo: [0.46, 1.5, 3.0],
      fov: 30, dur: 7, hold: 0.3, ease: "sineInOut", handheld: 1.6,
    },
    // 4. The door, over his shoulder, as he opens it. The darkness inside is
    //    the subject of the shot, and it is given the whole frame.
    {
      pos: [-0.9, 1.52, 3.4], to: [-0.7, 1.5, 2.9],
      look: [0, 1.3, 0.2], lookTo: [0, 1.2, -0.3],
      fov: 34, fovTo: 30, dur: 9, hold: 0.6, ease: "expoInOut", handheld: 1.2,
    },
  ];
}

/** The attack. Shorter, closer, and handheld to the point of being unusable. */
function attackShots() {
  return [
    // Snapped to her as she is taken. Violent handheld, no easing - the camera
    // is reacting, not composing.
    {
      pos: [1.6, 1.62, 3.0], to: [1.3, 1.66, 2.2],
      look: [0.5, 1.5, 2.6], lookTo: [0.2, 1.5, 1.2],
      fov: 42, dur: 1.6, ease: "linear", handheld: 3.4, shake: 0.8,
    },
    // His hand, and then nothing in it.
    {
      pos: [-0.1, 1.3, 2.9], to: [0.1, 1.24, 2.4],
      look: [-0.3, 1.3, 1.9], lookTo: [0.1, 1.1, 0.6],
      fov: 30, dur: 1.4, ease: "linear", handheld: 3, shake: 0.6,
    },
    // From the floor, as he goes down. The door frame above, and the dark
    // inside it closing.
    {
      pos: [0.3, 0.3, 2.6], to: [0.2, 0.18, 2.75],
      look: [0, 1.9, 0], lookTo: [0, 2.4, 0.2],
      fov: 48, dur: 2.2, hold: 0.6, ease: "sineOut", handheld: 2.2, shake: 0.5,
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * The sequence
 * -------------------------------------------------------------------------- */

function onCue(cue) {
  switch (cue) {
    case "card":
      // The title card is awaited by `play`, not here: a cue handler that
      // blocks would stall the dialogue it was called from.
      break;

    case "arrive":
      S.himPose = "wary";
      S.herPose = "wary";
      audio.play("carDoor", { gain: 0.9 });
      break;

    case "walk":
      // They start walking. `wantWalk` is damped, so this is an acceleration.
      S.wantWalk = 1;
      her.parts.head.getWorldPosition(_tmp);
      S.himLook = null;
      break;

    case "atDoor":
      S.wantWalk = 1;
      S.himLook = null;
      break;

    case "openDoor":
      S.wantDoorOpen = 1;
      audio.play("doorOpen");
      break;

    case "ghostAppears":
      wraith.appear(0.4);
      audio.play("ghostBreath", { gain: 1.2 });
      cinema.glitch(0.5, 0.5);
      // The shots change here, mid-dialogue, because the editing has to become
      // an edit at the same instant the scene does.
      director.play(attackShots());
      break;

    case "grab":
      S.wantAttack = 1;
      S.himPose = "reach";
      S.herPose = "taken";
      audio.play("distantScream", { gain: 1.4 });
      director.addTrauma(1);
      cinema.glitch(0.8, 1.2);
      break;

    case "reach":
      S.himPose = "reach";
      break;

    case "drag":
      audio.play("crack", { gain: 0.8 });
      break;

    case "lose":
      // The lights go out on this line, not on the next one. The darkness is
      // what he loses her in.
      S.blackout = 0.001;
      audio.play("switchOff", { gain: 1.4 });
      break;

    case "blackout":
      cinema.fade(1, 0.6);
      audio.play("crashImpact", { gain: 0.7 });
      break;

    case "whisperOut":
      cinema.glitch(0.25, 2);
      break;

    default:
      break;
  }
}

export async function play() {
  if (!scene) build();

  S.active = true;
  S.time = 0;
  S.walk = 0;
  S.wantWalk = 0;
  S.pace = 0;
  S.doorOpen = S.wantDoorOpen = 0;
  S.attack = S.wantAttack = 0;
  S.herDrag = 0;
  S.blackout = 0;
  S.himPose = "wary";
  S.herPose = "wary";
  torch.intensity = 9;
  if (lights) {
    lights.hemi.intensity = 1.1;
    lights.rim.intensity = 0.8;
    lights.key.intensity = 1.5;
  }
  car.visible = true;
  wraith.vanish();

  emit(EV.CUTSCENE_START, { id: "FLASHBACK" });

  /* --- the card --------------------------------------------------------- *
   * Shown over black, before the scene is revealed, with the wind already
   * audible under it. Sound first, picture second: the player should hear
   * where they are going before they see it.
   */
  cinema.cut(1);
  director.takeOver(scene);
  director.play([shots()[0]]);
  audio.bed("wind", 1, 3);
  audio.bed("rain", 0.4, 3);
  cinema.smoke(true);
  await cinema.card(t("cardFlashback"), t("cardFlashbackSub"), { hold: 1.8 });
  cinema.smoke(false);

  await cinema.fade(0, 2.4);

  await Promise.all([
    director.play(shots()),
    dialogue.play(FLASHBACK_SCRIPT, { id: "FLASHBACK", onCue }),
  ]);

  // Hold on black for a beat after the last whisper. The silence is the end of
  // the scene, not the fade.
  await cinema.fade(1, 1.2);
  cinema.clearSay();
  audio.bedsOff(1.2);
  await new Promise((r) => window.setTimeout(r, 1400));

  S.active = false;
  emit(EV.CUTSCENE_END, { id: "FLASHBACK" });
}

/* -------------------------------------------------------------------------- *
 * Teardown
 * -------------------------------------------------------------------------- */

export function dispose() {
  if (!scene) return;
  S.active = false;

  // The characters are cached and shared; detach, never dispose.
  if (him?.root.parent) him.root.parent.remove(him.root);
  if (her?.root.parent) her.root.parent.remove(her.root);

  wraith?.dispose();

  scene.traverse((node) => {
    if (node.isMesh && node.geometry) node.geometry.dispose();
  });

  scene = facade = doorPivot = torch = torchGlow = wraith = lights = car = null;
}
