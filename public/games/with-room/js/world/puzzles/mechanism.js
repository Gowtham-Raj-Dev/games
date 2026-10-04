/**
 * STAGE 3 - THE MECHANISM.
 *
 * A fuse box with three empty sockets and a knife switch under it. Three fuses
 * are hidden in the room. Find them, seat them, throw the switch, and the
 * building has power.
 *
 * This is the stage that asks the player to COMBINE things, and it is built so
 * that each of the three fuses teaches a different way of searching:
 *
 *   IN SOMETHING    one is in the mug on the table. Picking the mug up is
 *                   enough to find it, which rewards the player who has been
 *                   handling everything since stage one.
 *   UNDER SOMETHING one is inside the crate, which has to be opened.
 *   BEHIND SOMETHING one is behind a painting, which swings aside.
 *
 * Seating a fuse is deliberately not a placement check like the other
 * placement puzzles: the player presses the box WHILE CARRYING a fuse and it is
 * taken out of their hands. A 5 cm object dropped into a 3 cm socket by
 * proximity would be the most frustrating thirty seconds in the game.
 */

import * as THREE from "three";

import { audio } from "../../audio/manager.js";
import { EV, emit } from "../../core/bus.js";
import { lerp } from "../../core/maths.js";
import { mat } from "../../engine/materials.js";
import * as textures from "../../engine/textures.js";
import { t } from "../../i18n/strings.js";
import * as hud from "../../ui/hud.js";
import * as interaction from "../../interaction/manager.js";
import * as roomScale from "../roomScale.js";

export const id = "mechanism";

const STATE = 2;
const FUSES = ["fuseRed", "fuseAmber", "fuseBlue"];

let api = null;
let group = null;
let box = null;
let lever = null;
let sockets = [];
let painting = null;
let paintingPivot = null;
/** Which fuse ids are seated, in socket order. */
let seated = [];
let powered = false;
let solved = false;
/** Fuse records, so they can be hidden once consumed. */
const fuseRecords = new Map();

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(outer) {
  api = outer;
  group = new THREE.Group();
  group.name = "puzzle:mechanism";
  group.visible = false;
  api.root.add(group);

  buildBox();
  buildPainting();
  buildFuses();
}

/**
 * The fuse box.
 *
 * A cast iron case on the wall with the cover off, three porcelain socket
 * carriers in a row, and a knife switch below. Everything about it is from the
 * 1930s, because the building has to feel like it was wired once and never
 * touched again.
 */
function buildBox() {
  box = new THREE.Group();
  box.name = "fusebox";

  const W = 0.34;
  const H = 0.42;

  // Case: a back plate and a surrounding lip, so the sockets sit inside
  // something rather than on a board.
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), mat.iron());
  back.castShadow = true;
  back.receiveShadow = true;
  box.add(back);
  for (const [w, h, x, y] of [
    [W, 0.02, 0, H / 2], [W, 0.02, 0, -H / 2],
    [0.02, H, -W / 2, 0], [0.02, H, W / 2, 0],
  ]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), mat.iron());
    lip.position.set(x, y, 0.05);
    lip.castShadow = true;
    box.add(lip);
  }

  // Sockets. Each is a porcelain carrier with a brass contact at each end and a
  // painted ring matching one fuse's band colour - which is how the player
  // knows which fuse goes where without a word of text.
  const BAND = { fuseRed: 0x8e2f26, fuseAmber: 0xa07324, fuseBlue: 0x2b4e6e };
  sockets = FUSES.map((want, i) => {
    const holder = new THREE.Group();
    holder.position.set(0, H * 0.3 - i * 0.11, 0.055);

    const carrier = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.05, 0.05),
      mat.ceramic(),
    );
    carrier.castShadow = true;
    holder.add(carrier);

    for (const sx of [-1, 1]) {
      const contact = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.016, 8),
        mat.brass(),
      );
      contact.rotation.z = Math.PI / 2;
      contact.position.set(sx * 0.082, 0, 0.012);
      holder.add(contact);
    }

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.016, 0.0035, 5, 12),
      new THREE.MeshStandardMaterial({ color: BAND[want], roughness: 0.6, metalness: 0 }),
    );
    ring.position.set(0, 0, 0.028);
    holder.add(ring);

    /*
     * The seated fuse, built now and hidden.
     *
     * Creating geometry at the moment a fuse is seated would mean a prop build
     * - and a possible texture generation - inside a key press. It is a
     * hundredth of a second of stall at the exact instant the player is
     * expecting a satisfying mechanical response.
     */
    const fitted = api.makeProp(want);
    if (fitted) {
      fitted.position.set(0, 0, 0.026);
      fitted.visible = false;
      holder.add(fitted);
    }

    box.add(holder);
    return { holder, want, fitted, filled: false };
  });

  /* --- the knife switch ------------------------------------------------- */
  lever = new THREE.Group();
  lever.position.set(0, -H * 0.34, 0.06);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.03), mat.ceramic());
  lever.add(base);
  const pivot = new THREE.Group();
  pivot.position.set(-0.05, 0, 0.02);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.008), mat.brass());
  blade.position.x = 0.05;
  pivot.add(blade);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mat.plastic(0x1a1512));
  handle.position.x = 0.1;
  pivot.add(handle);
  // Starts up and off: a knife switch in the open position is unmistakably off,
  // which matters because the player has to understand what throwing it means.
  pivot.rotation.z = 0.85;
  lever.add(pivot);
  lever.userData.pivot = pivot;
  box.add(lever);

  api.place(box, { kind: "wall", side: "north", along: 0.26, offset: 0.08, y: 1.35 });
  group.add(box);

  /* --- interactions ----------------------------------------------------- */
  // One target for the whole case: seat whatever is being carried.
  api.register(box, {
    hit: back,
    verb: "fitFuse",
    name: "objFusebox",
    onUse: () => {
      api.setFlag("sawFusebox");
      return seatCarried();
    },
  });

  // The switch is its own target, so the player can throw it without the box
  // intercepting the press.
  api.register(lever, {
    hit: handle,
    verb: "pullLever",
    name: "objLever",
    onUse: () => throwSwitch(),
  });
}

/**
 * Seat the fuse the player is carrying.
 *
 * Returns true if something happened. The caller is the interaction system and
 * a false return falls through to its default - which for a non-carryable
 * target is nothing at all, so a player pressing the box with empty hands gets
 * a line of dialogue rather than silence.
 */
function seatCarried() {
  const carried = interaction.getCarried();
  const propId = carried?.root?.userData?.propId;

  if (!propId || !FUSES.includes(propId)) {
    hud.subtitle(t("fuseboxEmpty"), 3);
    audio.play("metalTap", { gain: 0.6 });
    return true;
  }

  const socket = sockets.find((s) => s.want === propId);
  if (!socket || socket.filled) {
    hud.subtitle(t("fuseAlready"), 2.4);
    audio.play("keypadWrong", { gain: 0.5 });
    return true;
  }

  // Taken out of the player's hands and into the socket. The carried object is
  // dropped first, then hidden: dropping it returns it to the world cleanly,
  // including releasing its collider, which hiding it alone would not.
  interaction.drop(false);
  const record = fuseRecords.get(propId);
  if (record) {
    record.object.visible = false;
    record.consumed = true;
    // Moved far below the floor as well as hidden, so the room's own placement
    // checks and the player's collision can never find it again.
    record.object.position.set(0, -50, 0);
  }

  socket.filled = true;
  if (socket.fitted) socket.fitted.visible = true;
  seated = sockets.filter((s) => s.filled).map((s) => s.want);

  audio.play("fuseSeat");
  api.setFlag(`seated:${propId}`);

  const left = sockets.filter((s) => !s.filled).length;
  hud.subtitle(left > 0 ? t("fuseSeated", left) : t("fusesDone"), 3.2);
  return true;
}

/**
 * Throw the switch.
 *
 * With all three fuses in, this is the solve. With fewer, it arcs and does
 * nothing - and the arc is important: the switch has to feel like it WORKED and
 * the circuit did not, rather than like the game ignored the press.
 */
function throwSwitch() {
  if (powered) {
    audio.play("metalTap");
    return true;
  }

  const ready = sockets.every((s) => s.filled);
  lever.userData.pivot.rotation.z = ready ? -0.12 : 0.85;

  if (!ready) {
    audio.play("leverPull", { gain: 0.7 });
    audio.play("keypadWrong", { gain: 0.6 });
    hud.subtitle(t("leverDead", sockets.filter((s) => !s.filled).length), 3.4);
    // A minor failure: it costs nothing. Throwing a switch to see what it does
    // is exactly the behaviour this game wants to encourage.
    emit(EV.PUZZLE_FAILED_MINOR, { id: "lever" });
    return true;
  }

  powered = true;
  solved = true;
  api.setFlag("stage3Solved");
  api.setFlag("powerOn");

  audio.play("leverPull");
  audio.play("powerUp");
  audio.stinger("solved");

  // The sockets glow once the circuit is live. Three small lights that were
  // dead a second ago is the clearest possible statement that the room changed.
  for (const s of sockets) {
    if (!s.fitted) continue;
    const band = s.fitted.children.find((c) => c.material?.emissive);
    if (band) band.material.emissiveIntensity = 1.6;
  }

  api.solve(3);
  return true;
}

/**
 * The painting, and the fuse behind it.
 *
 * It swings on one corner rather than coming off the wall, because a painting
 * that can be taken down is an object the player then has to put somewhere -
 * and a 60 cm canvas in a 10 m room is a prop that spends the rest of the game
 * lying in a doorway.
 */
function buildPainting() {
  painting = new THREE.Group();
  painting.name = "painting";

  paintingPivot = new THREE.Group();
  painting.add(paintingPivot);

  const W = 0.52;
  const H = 0.66;

  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({
      map: textures.painting(0),
      roughness: 0.88,
      metalness: 0,
    }),
  );
  canvas.position.set(W / 2, 0, 0.02);
  paintingPivot.add(canvas);

  // A heavy moulded frame. The only ornate object in the room, which is what
  // makes it conspicuous enough to be worth pressing.
  const frameMat = mat.wood();
  for (const [w, h, x, y] of [
    [W + 0.08, 0.05, W / 2, H / 2 + 0.02],
    [W + 0.08, 0.05, W / 2, -H / 2 - 0.02],
    [0.05, H + 0.08, 0.0, 0],
    [0.05, H + 0.08, W, 0],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), frameMat);
    bar.position.set(x, y, 0.02);
    bar.castShadow = true;
    paintingPivot.add(bar);
  }

  // Hinged at its left edge: the pivot is at x=0 and the canvas runs to +W.
  paintingPivot.position.set(-W / 2, 0, 0);

  api.place(painting, { kind: "wall", side: "east", along: 0.3, offset: 0.06, y: 1.55 });
  group.add(painting);

  api.register(painting, {
    hit: canvas,
    verb: "inspect",
    name: "objPainting",
    onUse: () => {
      const open = !api.getFlag("paintingOpen");
      api.setFlag("paintingOpen", open);
      api.setFlag("sawPainting");
      audio.play(open ? "doorOpen" : "woodTap", { gain: 0.5 });
      if (open) hud.subtitle(t("paintingBehind"), 3.4);
      return true;
    },
  });
}

/**
 * Where the three fuses start.
 *
 * `in` is the object they are hidden in or behind, and it is only a comment -
 * the fuse is simply placed at that spot and is invisible until the thing that
 * conceals it is dealt with. Simulating containment properly would need a
 * parent-child system for props that nothing else in the game wants.
 */
function buildFuses() {
  const spots = [
    // In the mug, on the table. Sticking out of the top: visible if you look
    // into it, invisible from across the room.
    { id: "fuseAmber", on: "mug", reveal: "mugLooked" },
    // In the crate in the corner.
    { id: "fuseBlue", on: "crate", reveal: "crateOpen" },
    // Behind the painting.
    { id: "fuseRed", on: "painting", reveal: "paintingOpen" },
  ];

  for (const spot of spots) {
    const prop = api.makeProp(spot.id);
    if (!prop) continue;
    const record = api.place(
      prop,
      { kind: "free" },
      { size: api.propSize(spot.id), id: spot.id },
    );
    if (!record) continue;
    record.hiddenBy = spot.reveal;
    record.item = api.register(prop, {
      verb: "takeItem",
      name: "objFuse",
      carry: true,
      inspect: true,
      mass: 0.06,
      collider: record.collider,
      onUse: () => {
        api.setFlag("foundFuse");
        return false;
      },
    });
    fuseRecords.set(spot.id, record);
    group.add(prop);
  }
}

/* -------------------------------------------------------------------------- *
 * Layout and visibility
 * -------------------------------------------------------------------------- */

export function layout() {
  if (!group) return;

  /*
   * A fuse sits ON the thing that hides it, and that position is read from the
   * hiding object's own record rather than written down here.
   *
   * It has to be: the mug sits on a table that is anchored to a wall, the crate
   * to a corner, the painting to a wall - all three travel when the room grows,
   * and a fuse at a remembered coordinate would be left floating in the middle
   * of the floor the first time the walls moved.
   */
  const hosts = [
    { fuse: "fuseAmber", host: "mug", lift: 0.05 },
    { fuse: "fuseBlue", host: "crate", lift: 0.46 },
    { fuse: "fuseRed", host: "painting", lift: 0, behind: 0.12 },
  ];

  for (const spot of hosts) {
    const record = fuseRecords.get(spot.fuse);
    if (!record || record.touched || record.consumed || record.item?.held) continue;

    if (spot.host === "painting") {
      // Behind the canvas, on the wall itself - so it is revealed by the
      // painting swinging aside rather than by being lifted off something.
      const dims = roomScale.dims;
      painting.updateMatrixWorld(true);
      record.object.position.set(
        dims.hw - spot.behind,
        painting.position.y,
        painting.position.z,
      );
      continue;
    }

    const host = api.find(spot.host);
    if (!host) continue;
    record.object.position.set(
      host.object.position.x,
      host.object.position.y + spot.lift,
      host.object.position.z,
    );
  }
}

export function onBeat() {
  const state = roomScale.stateId();
  // The box exists from the stage it is used at onward - it is a fixture, and
  // the power it switches on stays on for the rest of the game.
  const on = state >= STATE;
  if (group) group.visible = on;
  if (painting) painting.visible = on;

  if (paintingPivot) {
    paintingPivot.rotation.y = api.getFlag("paintingOpen") ? -1.25 : 0;
  }

  // A fuse is only visible once whatever conceals it has been dealt with.
  for (const [fuseId, record] of fuseRecords) {
    if (record.consumed) {
      record.object.visible = false;
      continue;
    }
    const revealed = record.touched || api.getFlag(record.hiddenBy);
    record.object.visible = on && !!revealed;
  }

  layout();
}

export function tick() {
  // Nothing per-frame: this puzzle is entirely event-driven, which is why it is
  // the cheapest of the five.
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  return {
    solved,
    powered,
    seated: sockets.map((s) => s.filled),
    consumed: [...fuseRecords.entries()]
      .filter(([, r]) => r.consumed)
      .map(([k]) => k),
  };
}

export function deserialise(data) {
  if (!data) return;
  solved = !!data.solved;
  powered = !!data.powered;

  for (let i = 0; i < sockets.length; i++) {
    sockets[i].filled = !!data.seated?.[i];
    if (sockets[i].fitted) sockets[i].fitted.visible = sockets[i].filled;
  }
  for (const fuseId of data.consumed ?? []) {
    const record = fuseRecords.get(fuseId);
    if (!record) continue;
    record.consumed = true;
    record.object.visible = false;
    record.object.position.set(0, -50, 0);
  }
  if (lever) lever.userData.pivot.rotation.z = powered ? -0.12 : 0.85;
  onBeat();
}

export function reset() {
  solved = false;
  powered = false;
  seated = [];
  for (const s of sockets) {
    s.filled = false;
    if (s.fitted) s.fitted.visible = false;
  }
  for (const record of fuseRecords.values()) {
    record.consumed = false;
    record.touched = false;
    record.object.visible = false;
  }
  if (lever) lever.userData.pivot.rotation.z = 0.85;
  onBeat();
}
