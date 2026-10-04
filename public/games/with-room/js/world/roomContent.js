/**
 * What is actually in the room.
 *
 * WITHROOM note: the puzzles themselves no longer live here. This file owns the
 * ARCHITECTURE and the FURNITURE - the things that are in the room whatever the
 * story is doing - and hands a small API to world/puzzles/*, which own the
 * mechanisms. That split exists because the five puzzles grew to be larger than
 * the room they are in, and because a puzzle that can only place, register and
 * declare itself solved cannot accidentally reach into the stability economy or
 * the story state.
 *
 * Placement is by ANCHOR, never by absolute coordinate, and that is the
 * whole design of this file. A table shoved against the north wall has to
 * still be against the north wall after the room doubles, or the expansion
 * reads as the furniture being abandoned in the middle of a field. So props
 * record what they are attached to and are re-placed from the live
 * dimensions every frame the room is moving.
 *
 *   wall    a fraction along a named wall, at an offset from it. Follows.
 *   floor   an absolute spot on the floor. Does not follow, but is pushed
 *           inward if a shrinking wall would otherwise pass through it.
 *   on      sitting on another prop. Follows its parent.
 *
 * The door and the window are built here rather than in the shell, because
 * they are holes in a specific wall rather than modules the wall is made of,
 * and because they both need to be interactable.
 */

import * as THREE from "three";

import { EV, emit, on } from "../core/bus.js";
import { clamp, makeRng } from "../core/maths.js";
import { get as getPlatform } from "../core/platform.js";
import * as textures from "../engine/textures.js";
import { mat } from "../engine/materials.js";
import * as roomScale from "./roomScale.js";
import * as puzzles from "./puzzles/index.js";
import * as interaction from "../interaction/manager.js";
import * as controller from "../player/controller.js";
import { audio } from "../audio/manager.js";
import { t } from "../i18n/strings.js";
import * as hud from "../ui/hud.js";

/** Everything placed, in placement order. */
const placed = [];
let root = null;
let propsApi = null;

/** Flags the world remembers: what has been read, moved, broken, solved. */
const flags = new Map();

/* -------------------------------------------------------------------------- *
 * Flags - the world's memory
 * -------------------------------------------------------------------------- */

export const getFlag = (key, fallback = false) => flags.get(key) ?? fallback;

export function setFlag(key, value = true) {
  if (flags.get(key) === value) return;
  flags.set(key, value);
}

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

/**
 * Populate the room.
 *
 * The props registry is imported dynamically so that a failure in one
 * builder degrades to an empty room with a console error, rather than an
 * unhandled rejection during boot that leaves the player on a black screen
 * with no explanation.
 */
export async function build(scene) {
  root = new THREE.Group();
  root.name = "roomContent";
  scene.add(root);

  try {
    propsApi = await import("../props/registry.js");
  } catch (err) {
    console.error("[content] prop registry failed to load", err);
    propsApi = null;
  }

  buildWriting();
  buildDoor();
  buildWindow();
  buildFurniture();
  buildStains();

  /*
   * The puzzles are built LAST and through an API.
   *
   * Last, because every one of them anchors something to a piece of furniture
   * that has to exist first - the digit under the bed, the glow on the mattress,
   * the fuse in the mug. Through an API, because a puzzle module may place
   * objects, register interactions and declare a stage solved, and nothing else.
   */
  puzzles.build(API);

  /*
   * Re-place everything whenever the room settles at a new size.
   *
   * `tick` only re-places while a transition is running, which misses every
   * immediate change: loading a save, and the debug panel jumping states.
   * Without this the furniture stays at the dimensions it was last laid out
   * for, so loading a save into a 15 m hall left the table and the crate
   * huddled around where the 6 m walls used to be.
   */
  on(EV.ROOM_CHANGED, () => {
    layout(true);
    puzzles.onBeat();
  });

  /*
   * An object the player has touched stops following the room.
   *
   * Several puzzles lay their pieces out from the live dimensions until the
   * first time they are picked up, after which the player owns where they are.
   * Marking it here means no puzzle has to subscribe to the interaction system.
   */
  on(EV.PICKED_UP, ({ item }) => {
    const record = placed.find((r) => r.object === item?.root);
    if (record) record.touched = true;
  });

  layout(true);
  puzzles.onBeat();
  return root;
}

/* -------------------------------------------------------------------------- *
 * The puzzle API
 *
 * The entire surface world/puzzles/* is allowed to see. Deliberately small: a
 * puzzle can make and place an object, make it interactable, read and write the
 * world's flags, and say that a stage is finished. It cannot move a wall, spend
 * stability, or advance the story - those are decided in one place each, and a
 * puzzle reaching into any of them would put a rule of the game inside a lock.
 * -------------------------------------------------------------------------- */

const API = {
  get root() {
    return root;
  },
  place,
  makeProp,
  propSize,
  register: (object, opts) => interaction.register(object, opts),
  setFlag,
  getFlag,
  /** The placement record for an id, so a puzzle can anchor to the furniture. */
  find: (id) => placed.find((r) => r.id === id) ?? null,
  /**
   * Declare a stage solved.
   *
   * The ONLY thing a puzzle says to the rest of the game. What a solve is worth
   * - stability, an expansion, a story beat - is decided by the one handler in
   * main.js that listens for this, which is what keeps the economy readable.
   */
  solve: (stage) => emit(EV.PUZZLE_SOLVED, { id: `stage${stage}`, stage, major: true }),
};

/** Make a prop from the registry, tolerating a missing or broken builder. */
function makeProp(id) {
  if (!propsApi?.build) return null;
  try {
    return propsApi.build(id);
  } catch (err) {
    console.error(`[content] prop "${id}" failed to build`, err);
    return null;
  }
}

function propSize(id) {
  return propsApi?.PROPS?.[id]?.size ?? { w: 0.4, h: 0.4, d: 0.4 };
}

/**
 * Place an object with an anchor.
 *
 * Returns the record, so a caller can register it for interaction or keep a
 * handle on it for a puzzle.
 */
function place(object, anchor, opts = {}) {
  if (!object) return null;
  root.add(object);

  const record = {
    object,
    anchor,
    size: opts.size ?? { w: 0.4, h: 0.4, d: 0.4 },
    /** Collider box in world space, kept up to date by `layout`. */
    box: opts.solid ? new THREE.Box3() : null,
    collider: null,
    /** Set while the player is holding it: layout must leave it alone. */
    item: null,
    id: opts.id ?? object.name,
  };

  if (record.box) {
    record.collider = controller.addCollider(record.box, record);
  }

  placed.push(record);
  return record;
}

/* -------------------------------------------------------------------------- *
 * STAGE 1 - THE CLOCK
 *
 * The tutorial puzzle, and it is deliberately easy. Its job is not to be
 * difficult; it is to teach the loop the whole game runs on - read something,
 * understand what the room wants, act, and watch the walls move - in under a
 * minute, so that when stage 2 asks for real thought the player already knows
 * what solving something feels like here.
 *
 * The clock stopped at 03:17. The book says it should read 04:00. Pressing
 * the clock walks the minute hand forward five minutes at a time, so getting
 * there takes nine presses: enough to feel deliberate, not enough to be a
 * chore.
 * -------------------------------------------------------------------------- */

/** Minutes past twelve. 197 = 03:17, where the clock stopped. */
const CLOCK_START = 3 * 60 + 17;
/** 04:00, what the book says it should say. */
const CLOCK_TARGET = 4 * 60;
const CLOCK_STEP = 5;

let clockMinutes = CLOCK_START;
let clockSolved = false;

/** Advance the clock one step and return true if it now reads the target. */
function stepClock(clock) {
  /*
   * The first press snaps to the next five-minute mark.
   *
   * Starting at :17 and adding five would walk :22, :27, :32 - and never land
   * on :00, so the puzzle would be unsolvable. Snapping first is less
   * surprising than rewriting the start time to something tidy, because the
   * player has already read 03:17 off the face.
   */
  if (clockMinutes % CLOCK_STEP !== 0) {
    clockMinutes += CLOCK_STEP - (clockMinutes % CLOCK_STEP);
  } else {
    clockMinutes += CLOCK_STEP;
  }
  clockMinutes %= 720;

  setClockTime(clock, Math.floor(clockMinutes / 60), clockMinutes % 60);
  return clockMinutes === CLOCK_TARGET;
}

const clockFaceText = () =>
  `${String(Math.floor(clockMinutes / 60) || 12).padStart(2, "0")}:${String(
    clockMinutes % 60,
  ).padStart(2, "0")}`;

/* -------------------------------------------------------------------------- *
 * Architecture
 * -------------------------------------------------------------------------- */

/**
 * FOUR DOORS. FOUR ANSWERS. Written on the north wall.
 *
 * A decal on a plane rather than part of the wall texture, so it can be
 * localised, so it stays the same physical size as the room grows, and so
 * it can be read as an interactable.
 */
function buildWriting() {
  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.55),
    new THREE.MeshStandardMaterial({
      map: textures.wallText("FOUR DOORS FOUR ANSWERS"),
      transparent: true,
      roughness: 0.95,
      metalness: 0,
      // Pushed toward the camera so it never z-fights with the wall it is
      // painted on. Polygon offset is the right tool; a 1 cm gap would cast
      // its own shadow and read as a sign hung on the wall.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  text.name = "writing";
  const record = place(text, { kind: "wall", side: "north", along: 0.5, offset: 0.01, y: 1.92 });

  interaction.register(text, {
    verb: "readIt",
    name: "objWriting",
    onUse: () => {
      setFlag("readWriting");
      hud.subtitle(t("objFirst"), 4);
      audio.play("paperRustle");
      return true;
    },
  });
  return record;
}

/**
 * The door. Locked, for now, and the first thing most players will try.
 *
 * It does not open in chapter one. The point of it is that it refuses: the
 * player has to accept that the way out is to make the room bigger, and a
 * door that rattles in its frame says that faster than any text.
 */
function buildDoor() {
  const group = new THREE.Group();
  group.name = "door";

  const W = 0.9;
  const H = 2.05;
  const T = 0.055;

  // Frame
  const frameMat = mat.wood();
  const jamb = new THREE.BoxGeometry(0.07, H + 0.08, 0.16);
  const left = new THREE.Mesh(jamb, frameMat);
  left.position.set(-W / 2 - 0.035, (H + 0.08) / 2, 0);
  const right = left.clone();
  right.position.x = W / 2 + 0.035;
  const head = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, 0.07, 0.16), frameMat);
  head.position.set(0, H + 0.075, 0);
  for (const m of [left, right, head]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(left, right, head);

  // Leaf, with recessed panels so it is not a slab.
  const leaf = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), frameMat);
  // BoxGeometry is centred on its origin, so without this the leaf straddles
  // the floor and half the door is buried in the concrete.
  slab.position.y = H / 2;
  slab.castShadow = true;
  slab.receiveShadow = true;
  leaf.add(slab);

  if (getPlatform().settings.propDetail >= 1) {
    const panelGeo = new THREE.BoxGeometry(W * 0.62, H * 0.3, T * 0.5);
    for (const y of [H * 0.68, H * 0.32]) {
      const panel = new THREE.Mesh(panelGeo, frameMat);
      panel.position.set(0, y, T * 0.42);
      panel.castShadow = false;
      panel.receiveShadow = true;
      leaf.add(panel);
    }
  }

  // Handle and plate.
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.11, 10),
    mat.brass(),
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.set(W / 2 - 0.1, H * 0.46, T * 0.6 + 0.03);
  handle.castShadow = true;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.14, 0.008),
    mat.brass(),
  );
  plate.position.set(W / 2 - 0.1, H * 0.46, T * 0.52);
  leaf.add(handle, plate);

  // Pivot at the hinge edge, so a future open animation is one rotation.
  // The children are shifted by +W/2 below and the pivot group by -W/2, which
  // is already the full offset - translating the leaf as well applied it
  // twice and parked the door most of a metre to the left of its frame.
  const pivot = new THREE.Group();
  pivot.add(leaf);
  for (const child of leaf.children) child.position.x += W / 2;
  pivot.position.set(-W / 2, 0, 0);
  group.add(pivot);
  group.userData.pivot = pivot;

  const record = place(group, { kind: "wall", side: "south", along: 0.5, offset: 0.08, y: 0 });

  interaction.register(group, {
    hit: slab,
    verb: "openDoor",
    name: "objDoor",
    onUse: () => {
      if (getFlag("doorUnlocked")) {
        /*
         * The door opens, and the story takes the screen.
         *
         * This is the single most important handoff in the game: opening this
         * door after the fourth lock is what starts the flashback. The door
         * does NOT know that - it announces that it was opened and main.js
         * decides what opening it means, which is the same rule every other
         * mechanism in the room follows.
         */
        setFlag("mainDoorOpened");
        audio.play("lockTurn");
        emit(EV.STORY_CUE, { cue: "mainDoorOpened" });
        return true;
      }
      // Rattle it. Minor failure: deliberately costs nothing.
      audio.play("doorLocked");
      group.userData.rattle = 0.42;
      hud.subtitle(t("lockedDoor"), 1.8);
      emit(EV.PUZZLE_FAILED_MINOR, { id: "door" });
      return true;
    },
  });

  return record;
}

/**
 * The window.
 *
 * In chapter one it shows nothing but a dim grey plate: the glass is filthy
 * and there is no light behind it. It exists now so that later, when it
 * starts showing somewhere that is not outside, it is already a fixture the
 * player has stopped noticing.
 */
function buildWindow() {
  const group = new THREE.Group();
  group.name = "window";

  const W = 0.86;
  const H = 1.0;

  const frame = mat.wood();
  const sideGeo = new THREE.BoxGeometry(0.06, H, 0.12);
  const l = new THREE.Mesh(sideGeo, frame);
  l.position.set(-W / 2, 0, 0);
  const r = new THREE.Mesh(sideGeo, frame);
  r.position.set(W / 2, 0, 0);
  const topGeo = new THREE.BoxGeometry(W + 0.12, 0.06, 0.12);
  const top = new THREE.Mesh(topGeo, frame);
  top.position.set(0, H / 2, 0);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.05, 0.2), frame);
  sill.position.set(0, -H / 2, 0.04);
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.035, H, 0.08), frame);

  for (const m of [l, r, top, sill, mullion]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(l, r, top, sill, mullion);

  // What is behind the glass. Flat and nearly black: a wall, or nothing.
  const beyond = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ color: 0x0e1113, fog: false }),
  );
  beyond.position.z = -0.1;
  group.add(beyond);

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    mat.glass(false),
  );
  glass.position.z = 0.01;
  group.add(glass);
  group.userData.beyond = beyond;

  const record = place(group, {
    kind: "wall",
    side: "east",
    along: 0.5,
    offset: 0.07,
    y: 1.45,
  });

  interaction.register(group, {
    hit: glass,
    verb: "inspect",
    name: "objWindow",
    onUse: () => {
      setFlag("lookedThroughWindow");
      hud.subtitle(t("objFindClue"), 3.5);
      return true;
    },
  });

  return record;
}

/* -------------------------------------------------------------------------- *
 * Furniture
 * -------------------------------------------------------------------------- */

function buildFurniture() {
  const rng = makeRng(1317);

  /* --- the bed he woke up on -------------------------------------------- *
   * Against the north wall, under the writing, with its long axis along the
   * wall - which is why `rotate` is 0 rather than the north wall's default.
   *
   * It is on the north wall and not the west for two reasons that are both
   * about the first ten seconds of the game: the wake-up camera looks out of it
   * ALONG the room rather than into a wall two feet away, and the writing on the
   * wall is directly above his head, so the first thing he can read is the
   * thing he needs. Everything else in the room was then laid out around it.
   */
  const bed = makeProp("bed");
  place(
    bed,
    // Rotated a quarter turn: the prop is modelled head-to-foot along its own
    // +z, and against the north wall that would drive it straight through the
    // concrete. Turning it puts its length along the wall, where a bed goes.
    { kind: "wall", side: "north", along: 0.45, offset: 0.52, rotate: Math.PI / 2 },
    { size: propSize("bed"), solid: true, id: "bed" },
  );

  // --- table, against the west wall, south end ---
  const table = makeProp("table");
  const tableRec = place(
    table,
    { kind: "wall", side: "west", along: 0.78, offset: 0.42 },
    { size: propSize("table"), solid: true, id: "table" },
  );

  // --- chair, tucked in ---
  const chair = makeProp("chair");
  place(
    chair,
    { kind: "wall", side: "west", along: 0.78, offset: 1.05, rotate: -Math.PI / 2 },
    { size: propSize("chair"), solid: true, id: "chair" },
  );

  // --- the clock, showing 03:17 ---
  const clock = makeProp("wallclock");
  if (clock) {
    clock.name = "wallclock";
    setClockTime(clock, 3, 17);
    const rec = place(clock, {
      kind: "wall",
      side: "north",
      along: 0.9,
      offset: 0.08,
      y: 1.85,
    });
    if (rec) {
      rec.id = "wallclock";
      interaction.register(clock, {
        verb: "turnDial",
        name: "objClock",
        onUse: () => {
          setFlag("readClock");

          if (clockSolved) {
            audio.play("clockTick");
            hud.subtitle(clockFaceText(), 1.6);
            return true;
          }

          const solved = stepClock(clock);
          audio.play("clockTick");
          hud.subtitle(clockFaceText(), 1.8);

          if (!solved) return true;

          clockSolved = true;
          setFlag("stage1Solved");
          audio.play("clockChime");
          audio.stinger("solved");
          /*
           * 04:00 is also the first digit of the code on the main door.
           *
           * The clock is not a clock puzzle with a time as its answer - it is
           * the first quarter of the answer to the lock, and the burn mark that
           * appears on the door frame the instant it is solved is what tells the
           * player that. See world/puzzles/keypad.js CODE.
           */
          API.solve(1);
          return true;
        },
      });
    }
  }

  // --- the strange cube, on the table ---
  const cube = makeProp("cube");
  if (cube && tableRec) {
    const rec = place(
      cube,
      { kind: "on", parent: tableRec, x: 0.22, z: -0.08 },
      { size: propSize("cube"), id: "cube" },
    );
    if (rec) {
      rec.item = interaction.register(cube, {
        verb: "takeItem",
        name: "objCube",
        carry: true,
        inspect: true,
        mass: 2.4,
        collider: rec.collider,
        onUse: () => false, // falls through to pick up
      });
    }
  }

  // --- lamp, on the table ---
  const lamp = makeProp("lamp");
  if (lamp) lamp.name = "lamp";
  if (lamp && tableRec) {
    place(
      lamp,
      { kind: "on", parent: tableRec, x: -0.34, z: 0 },
      { size: propSize("lamp"), id: "lamp" },
    );
    interaction.register(lamp, {
      verb: "pressSwitch",
      name: "objLamp",
      onUse: () => {
        const on = !getFlag("lampOn");
        setFlag("lampOn", on);
        setLampOn(lamp, on);
        audio.play(on ? "switchOn" : "switchOff");
        return true;
      },
    });
    setLampOn(lamp, getFlag("lampOn"));
  }

  // --- small carryables on the table ---
  if (tableRec) {
    const mug = makeProp("mug");
    if (mug) {
      const rec = place(
        mug,
        { kind: "on", parent: tableRec, x: 0.0, z: 0.16 },
        { size: propSize("mug"), id: "mug" },
      );
      if (rec) {
        rec.item = interaction.register(mug, {
          verb: "takeItem",
          name: "objMug",
          carry: true,
          inspect: true,
          mass: 0.4,
          collider: rec.collider,
          onUse: () => {
            /*
             * Picking the mug up is what finds the fuse in it.
             *
             * The mechanism puzzle hides one fuse "in the mug" by waiting on
             * this flag, and before this the flag had nothing to set it: the
             * mug was a carryable with no handler, so a third of stage three
             * was unreachable. Returning false falls through to the pick-up, so
             * the mug still behaves exactly as it always did.
             */
            setFlag("mugLooked");
            return false;
          },
        });
      }
    }

    const book = makeProp("book");
    if (book) {
      const rec = place(
        book,
        { kind: "on", parent: tableRec, x: -0.1, z: -0.14, rotate: rng() * 0.6 - 0.3 },
        { size: propSize("book"), id: "book" },
      );
      if (rec) {
        rec.item = interaction.register(book, {
          verb: "readIt",
          name: "objBook",
          carry: true,
          mass: 0.6,
          collider: rec.collider,
          onUse: () => {
            setFlag("readBook");
            hud.subtitle(t("bookLine"), 5);
            audio.play("paperRustle");
            return true;
          },
        });
      }
    }
  }

  // --- a crate in the far corner ---
  /*
   * Interactable, which it was not before.
   *
   * It was scenery - a thing to walk round - and the mechanism puzzle hides a
   * fuse in it, so it had to become something that opens. One flag, and the
   * fuse inside it appears; there is no lid animation because the crate is
   * modelled without one, and a line of subtitle does the work instead.
   */
  const crate = makeProp("crate");
  const crateRec = place(
    crate,
    { kind: "corner", corner: "ne", inset: 0.55, rotate: -0.22 },
    { size: propSize("crate"), solid: true, id: "crate" },
  );
  if (crate) {
    interaction.register(crate, {
      verb: "openDrawer",
      name: "objCrate",
      onUse: () => {
        const first = !getFlag("crateOpen");
        setFlag("crateOpen");
        audio.play("woodTap");
        if (first) {
          audio.play("paperRustle", { gain: 0.7 });
          hud.subtitle(t("crateOpened"), 3.4);
        }
        return true;
      },
    });
  }

  // --- the key, behind the crate where it has to be looked for ---
  const key = makeProp("key");
  if (key) {
    const rec = place(
      key,
      { kind: "corner", corner: "ne", inset: 1.0, rotate: 0.8 },
      { size: propSize("key"), id: "key" },
    );
    if (rec) {
      rec.item = interaction.register(key, {
        verb: "takeItem",
        name: "objKey",
        carry: true,
        mass: 0.05,
        collider: rec.collider,
        onUse: () => {
          setFlag("foundKey");
          return false;
        },
      });
    }
  }
}

/** Point the clock's hands at a time. */
export function setClockTime(clock, hours, minutes) {
  const hour = clock.getObjectByName("hourHand");
  const minute = clock.getObjectByName("minuteHand");
  if (minute) minute.rotation.z = -(minutes / 60) * Math.PI * 2;
  if (hour) hour.rotation.z = -((hours % 12) / 12 + minutes / 720) * Math.PI * 2;
}

/** Switch the desk lamp, including its real light. */
function setLampOn(lamp, on) {
  const bulb = lamp.getObjectByName("bulb");
  if (bulb?.material) {
    bulb.material.emissiveIntensity = on ? 3.2 : 0.0;
  }
  let light = lamp.getObjectByName("lampLight");
  if (!light && on) {
    light = new THREE.PointLight(0xffc98a, 6, 6, 2);
    light.name = "lampLight";
    light.castShadow = false; // a second shadow-casting light is not worth it
    light.position.copy(bulb?.position ?? new THREE.Vector3(0, 0.4, 0));
    lamp.add(light);
  }
  if (light) light.visible = on;
}

/* -------------------------------------------------------------------------- *
 * The marks on the room
 *
 * Three dried stains and a drag mark. They are the only storytelling in the
 * room that is not a puzzle, and they are the reason the room reads as a place
 * something happened in rather than as a level.
 *
 * Restraint is the whole brief here. The temptation is a room covered in blood,
 * and a room covered in blood is a haunted house attraction - it tells the
 * player the game is not serious. Three marks that are obviously old, in places
 * that imply a direction of travel, do far more: one by the bed, one halfway
 * across the floor, one at the foot of the main door, which together say
 * somebody was dragged out of here and nobody says it out loud.
 * -------------------------------------------------------------------------- */

function buildStains() {
  const stainMap = textures.stain();

  /** [x, z] as a fraction of the room, scale in metres, rotation. */
  const SPOTS = [
    // Beside the bed, where his hand would have hung off it.
    { ax: -0.08, az: -0.3, size: 0.55, turn: 0.4, opacity: 0.7 },
    // A long smear across the middle of the floor, toward the door.
    { ax: 0.02, az: 0.06, size: 1.1, turn: 1.2, opacity: 0.42, stretch: 2.6 },
    // At the threshold.
    { ax: 0.0, az: 0.4, size: 0.42, turn: -0.6, opacity: 0.55 },
  ];

  for (let i = 0; i < SPOTS.length; i++) {
    const spot = SPOTS[i];
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(spot.size * (spot.stretch ?? 1), spot.size),
      new THREE.MeshBasicMaterial({
        map: stainMap,
        transparent: true,
        opacity: spot.opacity,
        depthWrite: false,
        fog: true,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = spot.turn;
    // A millimetre off the floor. Coplanar would z-fight, and polygon offset on
    // an unlit transparent decal is more trouble than a millimetre of lift.
    mesh.position.y = 0.0012;
    mesh.name = `stain${i}`;
    const record = place(mesh, { kind: "free" }, { id: `stain${i}` });
    if (record) {
      // Stains are part of the floor, so unlike every other free-standing
      // object they DO follow the room - they are stored as fractions and
      // re-placed in `layout`.
      record.fraction = [spot.ax, spot.az];
    }
  }

  /* --- a handprint on the inside of the door --------------------------- *
   * At the height a hand reaches when someone is being pulled away from it.
   * The one mark in the room that is unmistakably a person.
   */
  const hand = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.26),
    new THREE.MeshBasicMaterial({
      map: stainMap,
      color: 0x8a3a2c,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  place(hand, { kind: "wall", side: "south", along: 0.56, offset: 0.1, y: 1.15 });
}

/* -------------------------------------------------------------------------- *
 * Layout
 * -------------------------------------------------------------------------- */

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/**
 * Re-place everything from the live room dimensions.
 *
 * Called every frame while the room is in motion, which is what makes the
 * furniture travel outward with the walls during an expansion instead of
 * being left stranded in the middle of the new space.
 */
export function layout(force = false) {
  if (!root) return;
  const dims = roomScale.dims;

  for (const rec of placed) {
    // A carried object is owned by the player, not by the room.
    if (rec.item?.held) continue;

    const a = rec.anchor;
    const o = rec.object;

    if (a.kind === "wall") {
      const inset = a.offset ?? 0;
      switch (a.side) {
        case "north":
          o.position.set((a.along - 0.5) * dims.w, a.y ?? 0, -dims.hd + inset);
          o.rotation.y = a.rotate ?? 0;
          break;
        case "south":
          o.position.set((a.along - 0.5) * dims.w, a.y ?? 0, dims.hd - inset);
          o.rotation.y = a.rotate ?? Math.PI;
          break;
        case "west":
          o.position.set(-dims.hw + inset, a.y ?? 0, (a.along - 0.5) * dims.d);
          o.rotation.y = a.rotate ?? Math.PI / 2;
          break;
        case "east":
          o.position.set(dims.hw - inset, a.y ?? 0, (a.along - 0.5) * dims.d);
          o.rotation.y = a.rotate ?? -Math.PI / 2;
          break;
        default:
          break;
      }
    } else if (a.kind === "corner") {
      const sx = a.corner.includes("e") ? 1 : -1;
      const sz = a.corner.includes("s") ? 1 : -1;
      o.position.set(
        sx * (dims.hw - a.inset),
        a.y ?? 0,
        sz * (dims.hd - a.inset),
      );
      o.rotation.y = a.rotate ?? 0;
    } else if (a.kind === "on") {
      const p = a.parent.object;
      const surface = a.parent.size?.h ?? 0.75;
      // Local offset is rotated into the parent's frame, so a cube on a
      // table stays where it was put when the table turns to face a new wall.
      const cos = Math.cos(p.rotation.y);
      const sin = Math.sin(p.rotation.y);
      o.position.set(
        p.position.x + a.x * cos + a.z * sin,
        p.position.y + surface,
        p.position.z - a.x * sin + a.z * cos,
      );
      o.rotation.y = p.rotation.y + (a.rotate ?? 0);
    } else if (rec.fraction) {
      // Painted on the floor rather than standing on it: stored as a fraction
      // of the room, so a stain stays in the same place on a floor that grows.
      o.position.x = rec.fraction[0] * dims.w;
      o.position.z = rec.fraction[1] * dims.d;
    } else {
      // Free-standing. Only moved if a wall would otherwise pass through it.
      const m = 0.3;
      o.position.x = clamp(o.position.x, -dims.hw + m, dims.hw - m);
      o.position.z = clamp(o.position.z, -dims.hd + m, dims.hd - m);
    }

    if (rec.box) {
      // The collider follows the visual, every frame it moves. Computing it
      // from the object means a prop that is animated or swapped keeps a
      // correct collider with no bookkeeping.
      _box.setFromObject(o);
      // Shrink very slightly: an exact box makes doorways and gaps feel
      // tighter than they look, which players read as sticky collision.
      _box.getSize(_size);
      _box.expandByVector(_size.multiplyScalar(-0.02));
      rec.box.copy(_box);
    }
  }
}

/* -------------------------------------------------------------------------- *
 * Frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!root) return;

  // Only re-place when something can have moved. At rest this is one branch.
  if (roomScale.isTransitioning()) layout();

  // The puzzles do their own throttling. Each one is a handful of distance
  // tests at four hertz, and the three that are event-driven cost nothing.
  puzzles.tick(dt);

  // Door rattle, from a failed attempt to open it.
  const door = root.getObjectByName("door");
  if (door?.userData.rattle > 0) {
    door.userData.rattle = Math.max(0, door.userData.rattle - dt * 2.4);
    const k = door.userData.rattle;
    door.userData.pivot.rotation.y = Math.sin(k * 60) * k * 0.035;
  }

  // The main door swinging open, once it has been unlocked and used. Driven
  // here rather than by a tween so it keeps moving across a pause.
  if (door?.userData.swing > 0) {
    door.userData.swing = Math.min(1, door.userData.swing + dt * 0.45);
    // Eased: a heavy door accelerates away from the frame and slows as it
    // reaches the end of its travel.
    const k = door.userData.swing;
    door.userData.pivot.rotation.y = -(k * k * (3 - 2 * k)) * 1.9;
  }
}

/**
 * Where the bed is, in world space.
 *
 * The wake-up cutscene puts the camera on it and the player's spawn next to it,
 * and both have to be derived rather than written down: the bed is anchored to
 * the north wall and travels outward every time the room grows.
 */
export function bedPosition() {
  const bed = placed.find((r) => r.id === "bed");
  if (!bed) return { x: 0, y: 0, z: -roomScale.dims.hd + 1 };
  return {
    x: bed.object.position.x,
    y: bed.object.position.y,
    z: bed.object.position.z,
  };
}

/** Open the main door, visibly. Called by the story, not by the door. */
export function openMainDoor() {
  const door = root?.getObjectByName("door");
  if (!door) return;
  door.userData.swing = 0.001;
  door.userData.rattle = 0;
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  const items = {};
  const touched = [];
  for (const rec of placed) {
    if (!rec.id || rec.anchor.kind !== "free") continue;
    items[rec.id] = [
      +rec.object.position.x.toFixed(3),
      +rec.object.position.y.toFixed(3),
      +rec.object.position.z.toFixed(3),
    ];
    if (rec.touched) touched.push(rec.id);
  }
  return {
    flags: Object.fromEntries(flags),
    items,
    touched,
    clockMinutes,
    clockSolved,
    puzzles: puzzles.serialise(),
  };
}

export function deserialise(data) {
  if (!data) return;
  flags.clear();
  for (const [k, v] of Object.entries(data.flags ?? {})) flags.set(k, v);

  for (const rec of placed) {
    const saved = data.items?.[rec.id];
    if (saved) rec.object.position.fromArray(saved);
    rec.touched = (data.touched ?? []).includes(rec.id);
  }

  clockMinutes = data.clockMinutes ?? CLOCK_START;
  clockSolved = !!data.clockSolved;
  const clock = root?.getObjectByName("wallclock");
  if (clock) setClockTime(clock, Math.floor(clockMinutes / 60), clockMinutes % 60);

  const lamp = root?.getObjectByName("lamp");
  if (lamp) setLampOn(lamp, getFlag("lampOn"));

  // The puzzles restore AFTER the flags and the item positions, because several
  // of them read a flag to decide what to show - the painting's angle, which
  // fuses are gone, whether the nail hole is visible.
  puzzles.deserialise(data.puzzles);

  layout(true);
  puzzles.onBeat();
}

export function reset() {
  flags.clear();
  clockMinutes = CLOCK_START;
  clockSolved = false;
  for (const rec of placed) {
    if (rec.item?.held) interaction.drop(false);
    rec.touched = false;
  }
  puzzles.reset();
  layout(true);
  puzzles.onBeat();
}

/** Re-show whatever the current story beat should be showing. */
export function onBeat(beat) {
  puzzles.onBeat(beat);
}
