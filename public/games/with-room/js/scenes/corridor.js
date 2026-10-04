/**
 * THE CORRIDOR THAT DOES NOT END.
 *
 * The last thing the game shows. He opens the door he has spent the whole story
 * earning, and what is on the other side is more doors than he can count.
 *
 * This is the only scene in WITHROOM shot in the THIRD PERSON, and that is the
 * whole idea: for two acts the player has been looking out of his eyes, and the
 * ending works by stepping outside them - so that the thing the player sees is
 * not the corridor, it is a man standing in front of it. A first-person ending
 * would show the doors; this one shows how small he is next to them.
 *
 * The scale trick, which is the only technical thing here worth knowing: the
 * corridor is 70 m long and the fog ends at 38 m, so the far end is never
 * visible and the eye assumes it continues. Then the camera pulls BACKWARD and
 * the walls keep producing doors, which confirms the assumption without ever
 * having to build an infinite hallway. The doors behind the camera are recycled
 * to the front as it goes, exactly as the trees are in the car scene - so an
 * endless corridor is forty doors.
 */

import * as THREE from "three";

import { EV, emit } from "../core/bus.js";
import { clamp01, damp, lerp, makeRng, noise1 } from "../core/maths.js";
import { get as getPlatform } from "../core/platform.js";
import { mat } from "../engine/materials.js";
import * as renderer from "../engine/renderer.js";
import * as textures from "../engine/textures.js";
import { audio } from "../audio/manager.js";
import * as human from "../characters/human.js";
import * as wraithFactory from "../characters/wraith.js";
import * as cinema from "../ui/cinema.js";
import * as dialogue from "../story/dialogue.js";
import * as director from "../story/director.js";
import { t } from "../i18n/strings.js";
import * as playclock from "../state/playclock.js";
import { ENDLESS as ENDLESS_SCRIPT } from "../story/script.js";

let scene = null;
let corridor = null;
let doors = [];
let lamps = [];
let him = null;
let wraith = null;
let farWall = null;
let lights = null;

const LEN = 70;
const WIDTH = 3.4;
const HEIGHT = 3.0;
const SPACING = 2.3;

const S = {
  active: false,
  time: 0,
  /** How far the camera has travelled back from the doorway. */
  pull: 0,
  /** 0 before the reveal, 1 after: drives the extra doors and the darkness. */
  reveal: 0,
  wantReveal: 0,
  /** Global dimming for the ending. */
  dark: 0,
  wantDark: 0,
  himLook: null,
};

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

function build() {
  const q = getPlatform().settings;
  const rng = makeRng(770077);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050a);
  // The fog is what makes the corridor endless, so it is tuned to the geometry
  // rather than to taste: it closes before the far wall and after the furthest
  // door the camera will ever reach.
  scene.fog = new THREE.Fog(0x04050a, 2, 38);

  corridor = new THREE.Group();
  scene.add(corridor);

  // Plaster rather than the room's concrete: this is a corridor in a building
  // that was once used, and the difference in surface is the only thing saying
  // the player has left the cell behind.
  const wallMat = new THREE.MeshStandardMaterial({
    map: textures.plaster().map,
    roughnessMap: textures.plaster().roughnessMap,
    normalMap: textures.plaster().normalMap ?? null,
    color: 0x4a443c,
    roughness: 0.94,
    metalness: 0,
  });
  const floorMat = mat.cloth(0x2a2621, 0.92);
  const ceilMat = mat.cloth(0x1e1b18, 0.95);

  /* --- shell ------------------------------------------------------------ */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LEN), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -LEN / 2 + 6;
  floor.receiveShadow = q.shadows;
  corridor.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LEN), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, HEIGHT, floor.position.z);
  corridor.add(ceiling);

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(LEN, HEIGHT), wallMat);
    wall.rotation.y = side * -Math.PI / 2;
    wall.position.set(side * WIDTH / 2, HEIGHT / 2, floor.position.z);
    wall.receiveShadow = q.shadows;
    corridor.add(wall);
  }

  /* --- doors ------------------------------------------------------------ *
   * One shared geometry and one shared material for every door in the game's
   * final shot, so forty doors are forty draw calls of the same buffer - and
   * the only thing that distinguishes them is how far each one is open, which
   * is exactly what the shot is about.
   */
  const doorW = 0.88;
  const doorH = 2.1;
  const leafGeo = new THREE.BoxGeometry(doorW, doorH, 0.055);
  const frameGeo = new THREE.BoxGeometry(doorW + 0.16, doorH + 0.1, 0.1);
  const doorMat = mat.wood();
  const frameMat = mat.woodPale();
  const voidMat = mat.void();
  const voidGeo = new THREE.PlaneGeometry(doorW, doorH);

  doors = [];
  const perSide = Math.floor(LEN / SPACING);
  for (let i = 0; i < perSide; i++) {
    for (const side of [-1, 1]) {
      const z = -i * SPACING + 2;
      const group = new THREE.Group();
      group.position.set(side * (WIDTH / 2 - 0.05), 0, z);
      group.rotation.y = side * -Math.PI / 2;

      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.y = doorH / 2;
      group.add(frame);

      // The darkness behind each one. Flat black, unlit, unfogged: a doorway
      // with the wall visible through it is not a doorway.
      const dark = new THREE.Mesh(voidGeo, voidMat);
      dark.position.set(0, doorH / 2, -0.08);
      group.add(dark);

      const pivot = new THREE.Group();
      pivot.position.set(-doorW / 2, 0, 0.06);
      const leaf = new THREE.Mesh(leafGeo, doorMat);
      leaf.position.set(doorW / 2, doorH / 2, 0);
      leaf.castShadow = q.shadows;
      pivot.add(leaf);
      group.add(pivot);

      corridor.add(group);
      doors.push({
        group,
        pivot,
        side,
        // Most are shut. A few are ajar, and the ones that are ajar are the
        // ones the eye goes to - so their positions are seeded, not random, and
        // they are spread rather than clustered.
        open: rng() < 0.22 ? 0.08 + rng() * 0.3 : 0,
        phase: rng() * 40,
        rate: 0.1 + rng() * 0.25,
      });
    }
  }

  /* --- the far wall of doors ------------------------------------------- *
   * At 44 m, just inside the fog, a wall that is nothing but doors in a grid.
   * It is barely visible and it is never meant to be clearly seen - it is
   * there so that a player who squints down the corridor finds something worse
   * than more corridor.
   */
  farWall = new THREE.Group();
  farWall.position.z = -44;
  for (let x = -2; x <= 2; x++) {
    for (let y = 0; y < 3; y++) {
      const g = new THREE.Group();
      g.position.set(x * 1.05, y * 2.25, 0);
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.y = doorH / 2;
      g.add(frame);
      const leaf = new THREE.Mesh(leafGeo, doorMat);
      leaf.position.set(0, doorH / 2, 0.06);
      g.add(leaf);
      farWall.add(g);
    }
  }
  scene.add(farWall);

  /* --- lamps ----------------------------------------------------------- *
   * Emissive strips every few metres with THREE point lights between them -
   * not one per strip. A corridor needs to look lit along its length and the
   * number of real lights is the only thing in this scene that could cost
   * anything, so the strips do the looking and three lights do the lighting.
   */
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    emissive: 0xffd9a0,
    emissiveIntensity: 1.4,
    roughness: 0.6,
  });
  const lampGeo = new THREE.PlaneGeometry(0.5, 0.1);
  lamps = [];
  for (let i = 0; i < 16; i++) {
    const strip = new THREE.Mesh(lampGeo, lampMat.clone());
    strip.rotation.x = Math.PI / 2;
    strip.position.set(0, HEIGHT - 0.02, -i * 4.2 + 2);
    corridor.add(strip);
    lamps.push({ mesh: strip, phase: rng() * 30, base: 1.4 });
  }

  lights = { points: [] };
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PointLight(0xffcf96, 5.5, 13, 2);
    p.position.set(0, HEIGHT - 0.3, -i * 9 - 2);
    p.castShadow = q.shadows && i === 0;
    if (p.castShadow) {
      p.shadow.mapSize.set(Math.min(512, q.shadowMapSize), Math.min(512, q.shadowMapSize));
      p.shadow.camera.near = 0.2;
      p.shadow.camera.far = 14;
    }
    scene.add(p);
    lights.points.push(p);
  }
  lights.hemi = new THREE.HemisphereLight(0x1a1c22, 0x05060a, 0.35);
  scene.add(lights.hemi);

  /* --- him -------------------------------------------------------------- */
  him = human.build("him");
  him.place(0, 0, 1.4, Math.PI);
  him.setPose("wary", { instant: true });
  scene.add(him.root);

  /* --- it --------------------------------------------------------------- */
  wraith = wraithFactory.build(scene, { seed: 4545 });
  wraith.place(0.5, 0, 4.4);

  renderer.requestShadowUpdate();
  return scene;
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!S.active || !scene) return;
  S.time += dt;

  S.reveal = damp(S.reveal, S.wantReveal, 1.2, dt);
  S.dark = damp(S.dark, S.wantDark, 0.9, dt);

  /* --- doors ------------------------------------------------------------ */
  for (const d of doors) {
    /*
     * They breathe.
     *
     * Every door in the corridor swings a degree or two on its own slow clock,
     * and the ones that are ajar swing further. Nothing slams - a slam is a
     * jump scare and this scene is not trying to startle anybody. It is trying
     * to make forty doors feel occupied.
     */
    const t0 = S.time * d.rate + d.phase;
    const breath = noise1(t0) * 0.5 + 0.5;
    const extra = S.reveal * 0.35 * (noise1(t0 * 0.7 + 5) * 0.5 + 0.5);
    d.pivot.rotation.y = -(d.open + extra) * breath * 1.4 * d.side;
  }

  /* --- the camera's travel recycles the corridor ----------------------- */
  /*
   * The camera is pulling backward through the doorway, so the whole corridor
   * is slid forward underneath it once it has travelled a door's width. The
   * geometry is identical and the spacing is uniform, so there is nothing to
   * see at the moment it happens - which is exactly why this works.
   */
  const camZ = director.camera?.position.z ?? 0;
  if (camZ - S.pull > SPACING) {
    S.pull += SPACING;
    for (const d of doors) {
      d.group.position.z += SPACING;
      if (d.group.position.z > camZ + SPACING * 2) d.group.position.z -= doors.length / 2 * SPACING;
    }
    for (const l of lamps) {
      l.mesh.position.z += SPACING;
      if (l.mesh.position.z > camZ + SPACING) l.mesh.position.z -= lamps.length * 4.2;
    }
  }

  /* --- lamps ----------------------------------------------------------- */
  for (const l of lamps) {
    // A corridor of failing fluorescents. Each on its own clock, and the
    // dropouts get deeper as the scene darkens.
    const n = noise1(S.time * 6 + l.phase);
    let k = 0.75 + n * 0.25;
    if (n < -0.6 - (1 - S.dark) * 0.2) k *= 0.12;
    l.mesh.material.emissiveIntensity = l.base * k * (1 - S.dark * 0.85);
  }
  for (let i = 0; i < lights.points.length; i++) {
    const p = lights.points[i];
    p.intensity = 5.5 * (1 - S.dark * 0.9) * (0.8 + noise1(S.time * 4 + i * 11) * 0.2);
  }
  lights.hemi.intensity = 0.35 * (1 - S.dark * 0.8);

  /* --- him -------------------------------------------------------------- */
  const speaker = dialogue.currentSpeaker();
  const emo = dialogue.currentLine()?.emo ?? "calm";
  him.update(dt, {
    talking: speaker === "him",
    emotion: speaker === "him" ? emo : "afraid",
    // Breathing hard and getting worse. By the final line he is close to
    // hyperventilating, which is audible as well as visible.
    breathRate: 0.34 + S.reveal * 0.4,
    lookAt: S.himLook,
    pose: "wary",
  });

  wraith.update(dt, director.camera);
}

/* -------------------------------------------------------------------------- *
 * Shots
 * -------------------------------------------------------------------------- */

function shots() {
  return [
    // 1. Behind him in the doorway, tight. He fills the frame; the corridor is
    //    a smear of light past his shoulder.
    {
      pos: [0.55, 1.62, 3.1], to: [0.42, 1.6, 2.7],
      look: [0.05, 1.45, 0.4], lookTo: [0, 1.4, -3],
      fov: 36, dur: 5, hold: 0.4, ease: "sineInOut", handheld: 1.4,
    },
    // 2. Past him, down the corridor. The reveal: the doors go as far as the
    //    fog, and the fog does not end.
    {
      pos: [0.0, 1.58, 2.0], to: [0.0, 1.55, 3.2],
      look: [0, 1.5, -6], lookTo: [0, 1.5, -22],
      fov: 30, fovTo: 44, dur: 7, hold: 0.8, ease: "expoInOut", handheld: 1,
    },
    // 3. THE PULL BACK. One continuous 14-second move away from him, and the
    //    only slow thing in the ending. He gets smaller; the corridor does not.
    {
      pos: [0.0, 1.55, 3.2], to: [0.0, 1.72, 17],
      look: [0, 1.4, -4], lookTo: [0, 1.3, -1],
      fov: 44, fovTo: 52, dur: 14, hold: 1.2, ease: "sineInOut", handheld: 0.7,
    },
    // 4. The last shot of the game: he is a silhouette in a doorway of light
    //    with the dark closing on both sides of him.
    {
      pos: [0.0, 1.72, 17], to: [0.0, 1.8, 23],
      look: [0, 1.3, -1], lookTo: [0, 1.4, 0],
      fov: 52, fovTo: 58, dur: 8, hold: 2, ease: "sineInOut", handheld: 0.5,
      shake: 0.3,
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * The sequence
 * -------------------------------------------------------------------------- */

const _behind = new THREE.Vector3();

function onCue(cue) {
  switch (cue) {
    case "reveal":
      S.wantReveal = 1;
      audio.play("powerUp", { gain: 0.6 });
      break;

    case "shock":
      // He turns his head along the corridor, which is also the moment the
      // player's eye is sent down it.
      S.himLook = new THREE.Vector3(0, 1.5, -14);
      director.addTrauma(0.3);
      break;

    case "pullBack":
      S.himLook = null;
      cinema.glitch(0.3, 1.4);
      break;

    case "wide":
      // Doors on every surface now, swinging further. The corridor stops
      // pretending to be architecture.
      S.wantReveal = 1;
      audio.play("doorKnock", { gain: 0.5 });
      break;

    case "behindHim":
      /*
       * It is behind him, and he does not turn round.
       *
       * The player can see it and he cannot, which is the only moment in the
       * game that uses that gap - and it is saved for the last thirty seconds
       * for exactly that reason.
       */
      wraith.place(0.55, 0, him.root.position.z + 1.1);
      wraith.appear(0.85);
      audio.play("ghostBreath", { gain: 1.1 });
      break;

    case "laugh":
      wraith.fury(0.5);
      cinema.glitch(0.45, 1.6);
      director.addTrauma(0.4);
      break;

    case "final":
      S.wantDark = 0.75;
      wraith.reach(true);
      break;

    case "laughLong":
      S.wantDark = 1;
      wraith.fury(1);
      cinema.glitch(0.7, 2.4);
      director.addTrauma(0.8);
      break;

    default:
      break;
  }
}

/**
 * Play the ending. Resolves on a black screen, with the title card gone.
 *
 * The caller is expected to return to the title screen afterwards: this module
 * does not know the title screen exists.
 */
export async function play() {
  if (!scene) build();

  S.active = true;
  S.time = 0;
  S.pull = 0;
  S.reveal = S.wantReveal = 0;
  S.dark = S.wantDark = 0;
  S.himLook = null;
  wraith.vanish();
  him.place(0, 0, 1.4, Math.PI);

  emit(EV.CUTSCENE_START, { id: "ENDLESS_DOORS" });

  cinema.cut(1);
  director.takeOver(scene);
  director.play([shots()[0]]);
  audio.ambience(3, { w: 3.4, d: 70, h: 3 });
  await cinema.fade(0, 2);

  await Promise.all([
    director.play(shots()),
    dialogue.play(ENDLESS_SCRIPT, { id: "ENDLESS_DOORS", onCue }),
  ]);

  /* --- TO BE CONTINUED -------------------------------------------------- */
  // The card comes up over the live scene going dark, not over a cut to black:
  // the doors are still swinging behind the type.
  cinema.smoke(true);
  cinema.glitch(0.5, 3);
  await cinema.fade(0.82, 2.6);
  audio.ghostLaugh(3.2);
  // The run time goes under TO BE CONTINUED. It is the one number in the game
  // that is purely the player's own, and the end is where it belongs.
  await cinema.card(
    t("cardContinued"),
    t("cardContinuedTime", playclock.spell()),
    { hold: 3.2, out: 1.6 },
  );

  await cinema.fade(1, 2);
  cinema.smoke(false);
  cinema.glitchHold(0);
  audio.bedsOff(1);
  await new Promise((r) => window.setTimeout(r, 1600));

  S.active = false;
  emit(EV.CUTSCENE_END, { id: "ENDLESS_DOORS" });
}

/* -------------------------------------------------------------------------- *
 * Teardown
 * -------------------------------------------------------------------------- */

export function dispose() {
  if (!scene) return;
  S.active = false;

  if (him?.root.parent) him.root.parent.remove(him.root);
  wraith?.dispose();

  for (const l of lamps) l.mesh.material.dispose();

  scene.traverse((node) => {
    if (node.isMesh && node.geometry) node.geometry.dispose();
  });
  // The one material this scene made for itself.
  corridor?.children.find((c) => c.isMesh && c.material?.map)?.material.dispose();

  scene = corridor = farWall = lights = null;
  doors = [];
  lamps = [];
}
