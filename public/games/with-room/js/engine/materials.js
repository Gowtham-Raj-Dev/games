/**
 * The material library.
 *
 * One place that owns every MeshStandardMaterial in the game, so that:
 *   - props share materials and therefore share draw calls;
 *   - a tier change can re-point every surface at smaller maps at once;
 *   - teardown between room states knows exactly what is shared and must not
 *     be disposed (see `SHARED` in textures.js).
 *
 * The room shell is the exception. Its tiling has to change when the room
 * resizes - a floor texture that reads correctly at 4 m is a smear at 250 m -
 * so the shell gets cloned textures it is allowed to mutate. Cloning a
 * CanvasTexture shares the underlying bitmap and only duplicates the wrap and
 * repeat state, so this is cheap: no second canvas is generated.
 */

import * as THREE from "three";

import * as tex from "./textures.js";
import { segmentWidthFor } from "../world/modules/shell.js";

/** name -> material. Built lazily, shared forever. */
const lib = new Map();

/** Materials the shell owns and may mutate. Rebuilt on a room state change. */
const shellMaterials = [];

let environment = null;

/**
 * Hand the library the scene's environment map.
 *
 * Without an environment map every MeshStandardMaterial in a dark room falls
 * back to pure black in its specular response, and the result reads as matte
 * plastic however the roughness is set. This single line is most of the
 * difference between "realistic" and "a 3D demo".
 */
export function setEnvironment(envMap) {
  environment = envMap;
  for (const m of lib.values()) {
    m.envMap = envMap;
    m.needsUpdate = true;
  }
  for (const m of shellMaterials) {
    m.envMap = envMap;
    m.needsUpdate = true;
  }
}

function make(name, build) {
  let m = lib.get(name);
  if (!m) {
    m = build();
    m.envMap = environment;
    lib.set(name, m);
  }
  return m;
}

/** Strip nulls so a tier without normal maps does not set `normalMap: null`. */
function maps(set) {
  const out = {};
  if (set.map) out.map = set.map;
  if (set.roughnessMap) out.roughnessMap = set.roughnessMap;
  if (set.normalMap) {
    out.normalMap = set.normalMap;
    out.normalScale = new THREE.Vector2(1, 1);
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Shell materials
 *
 * These are rebuilt whenever the room changes size, because their textures
 * tile against world dimensions rather than against the mesh.
 * -------------------------------------------------------------------------- */

/**
 * Build a shell material whose maps tile once per `tileSize` metres.
 *
 * `w` and `h` are the dimensions of the surface in metres. Deriving the repeat
 * from them rather than from the mesh's UVs means the floor of a 250 m room
 * and the floor of a 4 m room use the same geometry and the same bitmap and
 * still both look like a floor.
 */
function tiled(set, w, h, tileSize, extra = {}) {
  const out = {};
  for (const key of ["map", "roughnessMap", "normalMap"]) {
    const src = set[key];
    if (!src) continue;
    const clone = src.clone();
    clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(w / tileSize, h / tileSize);
    clone.needsUpdate = true;
    out[key] = clone;
  }
  if (out.normalMap) out.normalScale = new THREE.Vector2(1, 1);

  const m = new THREE.MeshStandardMaterial({ ...out, ...extra });
  m.envMap = environment;
  shellMaterials.push(m);
  return m;
}

/**
 * Materials for one room state. Call on every state change; the previous set
 * is disposed first, because these are the only materials in the game that
 * are genuinely per-state.
 */
export function buildShell({ id, w, d, h, tile, chapter }) {
  disposeShell();

  /*
   * The walls tile against ONE SEGMENT, not against the whole room.
   *
   * Every wall segment is a unit BoxGeometry scaled to size, so its UVs run
   * 0..1 across each face regardless of how wide the segment is. Setting the
   * repeat from the room's width therefore crammed that many repeats into
   * every single segment - the concrete grain came out horizontally squashed
   * by exactly the segment count, and got visibly worse at every expansion.
   */
  const segW = segmentWidthFor(id ?? 0);

  // Chapter 1 is a bare concrete cell. Later chapters are a finished
  // building, so the walls gain paint and the floor gains boards.
  const bare = chapter <= 1;

  return {
    floor: bare
      ? tiled(tex.concrete(), w, d, tile * 2, { color: 0x5e6160, roughness: 0.95, metalness: 0 })
      : tiled(tex.wood(6), w, d, tile * 2.5, { color: 0x6b4a2f, roughness: 0.6, metalness: 0 }),

    wall: bare
      ? tiled(tex.concrete(), segW, h, tile * 2.4, {
          color: 0x6a6c6b,
          roughness: 0.94,
          metalness: 0,
        })
      : tiled(tex.plaster(), segW, h, tile * 3, {
          color: 0x8d8a84,
          roughness: 0.9,
          metalness: 0,
        }),

    ceiling: tiled(tex.concrete(), w, d, tile * 3, {
      color: 0x4e5150,
      roughness: 0.97,
      metalness: 0,
    }),

    // Skirting and trim: a darker painted band where wall meets floor. Small,
    // but its absence is why bare boxes read as untextured geometry.
    trim: tiled(tex.plaster(), segW, 0.14, 1.2, {
      color: 0x3b3a37,
      roughness: 0.74,
      metalness: 0,
    }),
  };
}

function disposeShell() {
  for (const m of shellMaterials) {
    for (const key of ["map", "roughnessMap", "normalMap"]) {
      // Only the clone is disposed. The source bitmap is in textures.js's
      // SHARED set and stays alive for the next room state.
      m[key]?.dispose();
    }
    m.dispose();
  }
  shellMaterials.length = 0;
}

/* -------------------------------------------------------------------------- *
 * Prop materials
 *
 * Shared across every prop in the game. A prop builder asks for one of these
 * by name; it must never construct its own, or the draw-call count climbs
 * with the furniture count.
 * -------------------------------------------------------------------------- */

export const mat = {
  /** Dark stained hardwood: table top, chair, door. */
  wood: () =>
    make("wood", () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.wood(3)),
        color: 0x5d3f28,
        roughness: 0.58,
        metalness: 0,
      }),
    ),

  /** Lighter pine, for crates and the backs of things. */
  woodPale: () =>
    make("woodPale", () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.wood(3)),
        color: 0x8a6a46,
        roughness: 0.72,
        metalness: 0,
      }),
    ),

  /** Brushed steel: hinges, handles, frames. */
  steel: () =>
    make("steel", () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.metal()),
        color: 0x8a8d92,
        roughness: 0.38,
        metalness: 0.92,
      }),
    ),

  /** Aged brass: the clock bezel, the key. */
  brass: () =>
    make("brass", () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.metal()),
        color: 0xb08d4e,
        roughness: 0.44,
        metalness: 0.88,
      }),
    ),

  /** Blackened iron: the door's strap hinges and the heavier fittings. */
  iron: () =>
    make("iron", () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.metal()),
        color: 0x4a4a4d,
        roughness: 0.62,
        metalness: 0.8,
      }),
    ),

  /**
   * Window and clock glass.
   *
   * Always the cheap branch now. Transmission was reserved for the top tiers
   * on the theory that they could afford it - but in Three r160 a single
   * transmissive material makes the renderer draw the ENTIRE opaque scene a
   * second time into a backbuffer and build a full mipmap chain from it,
   * every frame. Two panes the size of a postcard were doubling the scene
   * cost. Behind a near-black backing plate the difference is invisible, so
   * the parameter is kept only so a later surface that genuinely needs
   * refraction can opt in deliberately.
   */
  glass: (physical = false) =>
    make(physical ? "glassPhysical" : "glass", () =>
      physical
        ? new THREE.MeshPhysicalMaterial({
            color: 0xdfe6e8,
            roughness: 0.04,
            metalness: 0,
            transmission: 0.94,
            thickness: 0.012,
            ior: 1.52,
            transparent: true,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xbfcace,
            roughness: 0.08,
            metalness: 0.1,
            transparent: true,
            opacity: 0.26,
          }),
    ),

  fabric: () =>
    make("fabric", () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.fabric()),
        color: 0x4a4238,
        roughness: 0.96,
        metalness: 0,
      }),
    ),

  /**
   * Skin, for the first-person hand viewmodel.
   *
   * Deliberately desaturated. A skin tone picked as a swatch comes out pink
   * and plastic once this room's warm bulb is on it, because the light is
   * already adding the red; a warm mid grey-tan under the same lamp reads as
   * flesh. The first attempt here was 0xc98f72 and looked like a shop-window
   * mannequin from the moment it was in frame.
   *
   * No maps. The hand sits 0.35 m from the near plane, where a generated
   * 512 px noise map resolves as grime rather than as pores - the geometry
   * carries the detail instead, which is also why this is the one material
   * in the library with nothing from textures.js in it.
   */
  skin: () =>
    make("skin", () =>
      /*
       * Darker than a skin swatch looks on its own. The room is lit by one
       * bulb through ACES, and a mid-tone skin picked against a white
       * background came out brighter than the concrete - the hand read as
       * a pale prop floating in front of the camera rather than part of
       * the scene.
       */
      new THREE.MeshStandardMaterial({
        color: 0x7a5745,
        roughness: 0.78,
        metalness: 0,
      }),
    ),

  /**
   * Rolled canvas sleeve, for the forearm.
   *
   * Shares the fabric texture set rather than owning one: the weave is the
   * same cloth at a different colour, and at this distance the only thing
   * that has to be right is that the arm is obviously not bare to the elbow.
   * Dull grey-green so it never competes with the skin for attention.
   */
  sleeve: () =>
    make("sleeve", () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.fabric()),
        color: 0x59604e,
        roughness: 0.93,
        metalness: 0,
      }),
    ),

  /** Glazed ceramic: the cup, the sink, the vase. */
  ceramic: () =>
    make("ceramic", () =>
      new THREE.MeshStandardMaterial({
        color: 0xd8d2c6,
        roughness: 0.16,
        metalness: 0,
      }),
    ),

  paper: () =>
    make("paper", () =>
      new THREE.MeshStandardMaterial({
        color: 0xcfc6ae,
        roughness: 0.92,
        metalness: 0,
      }),
    ),

  /**
   * The printed clock dial.
   *
   * Separate from `paper` rather than a variant of it because the dial is one
   * non-tiling bitmap mapped to one disc, where paper is a flat stock used all
   * over the room. Sharing a material between them would mean either every
   * sheet of paper carries the clock art or the dial loses it.
   *
   * Slightly glossier than paper: a clock face is printed card behind glass,
   * and the faint sheen is what stops it reading as a texture decal.
   */
  clockFace: () =>
    make("clockFace", () =>
      new THREE.MeshStandardMaterial({
        map: tex.clockFace(),
        roughness: 0.74,
        metalness: 0,
      }),
    ),

  /** Hard matte plastic: switches, the lamp shade. */
  plastic: (color = 0x2a2c30) =>
    make(`plastic:${color}`, () =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0 }),
    ),

  /**
   * The strange cube.
   *
   * Deliberately the only object in the first room that is not a believable
   * domestic material: near-black, very smooth, faintly emissive at the seams.
   * The player should be able to tell it does not belong before being told.
   */
  anomaly: () =>
    make("anomaly", () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x0a0c0e,
        roughness: 0.12,
        metalness: 0.35,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        emissive: 0x0d3a30,
        emissiveIntensity: 0.35,
      }),
    ),

  /** Unlit emissive, for anything that is its own light source. */
  emissive: (color = 0xffd9a0, intensity = 2.4) =>
    make(`emissive:${color}:${intensity}`, () =>
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 1,
        metalness: 0,
      }),
    ),

  /**
   * Flat black, used for the inside of apertures.
   *
   * A doorway with nothing behind it shows the skybox or the clear colour and
   * instantly breaks the illusion of a sealed room. A black cap behind it
   * reads as darkness instead.
   */
  void: () =>
    make("void", () =>
      new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
    ),

  /* ======================================================================== *
   * WITHROOM - people
   *
   * The character materials. `mat.skin()` above stays what it is - the
   * first-person hand, 35 cm from the near plane, where a texture resolves as
   * grime. A FACE is a different problem: it is seen at a metre or two in a
   * close-up, it is the thing the player is looking at, and it needs every map
   * it can get.
   * ======================================================================== */

  /**
   * Face and hands.
   *
   * MeshPhysicalMaterial, for one parameter: `clearcoat`. Skin is a rough
   * diffuse layer under a very thin, very smooth oil film, and that film is
   * the entire difference between flesh and painted clay. A Standard material
   * can have one or the other - rough enough to read as skin, or glossy enough
   * to catch a highlight - and the usual compromise lands on wax.
   *
   * `sheenColour` is pushed red, which is the cheapest approximation of
   * subsurface scattering available: light grazing the edge of a nose or an
   * ear comes back warm because it has been through blood on the way.
   */
  face: (tone = 0.5, colour = 0x9c7256) =>
    make(`face:${tone.toFixed(2)}:${colour}`, () =>
      new THREE.MeshPhysicalMaterial({
        ...maps(tex.skin(tone)),
        color: colour,
        roughness: 0.58,
        metalness: 0,
        clearcoat: 0.1,
        clearcoatRoughness: 0.5,
        /*
         * Sheen at a quarter of the first pass.
         *
         * Sheen is a grazing-angle term, so it fires hardest on exactly the
         * forms that are most curved - hands, a nose, an ear - and at 0.5 with
         * a red sheen colour those parts came back glowing orange while the
         * flat of the cheek stayed matte. A fifth of that still reads as blood
         * under skin at the edges and no longer reads as a sunburn.
         */
        sheen: 0.22,
        sheenRoughness: 0.9,
        sheenColor: new THREE.Color(0x7a3326),
        envMapIntensity: 0.45,
      }),
    ),

  /**
   * The eye.
   *
   * Low roughness and a real environment reflection, because a dry eye is the
   * single most lifeless thing a face can have - the catchlight is what makes
   * someone look alive, and a catchlight is a reflection.
   */
  eye: (colour = "brown") =>
    make(`eye:${colour}`, () =>
      new THREE.MeshStandardMaterial({
        map: tex.iris(colour),
        roughness: 0.08,
        metalness: 0,
        envMapIntensity: 1.5,
      }),
    ),

  /** Lips. Slightly redder, slightly glossier, slightly softer than skin. */
  /** Lips. Only a little redder than skin - a strong lip colour reads as makeup
   * on him and as a doll on her. */
  lip: (colour = 0x8d4f44) =>
    make(`lip:${colour}`, () =>
      new THREE.MeshPhysicalMaterial({
        color: colour,
        roughness: 0.38,
        metalness: 0,
        clearcoat: 0.3,
        clearcoatRoughness: 0.3,
      }),
    ),

  /** The inside of a mouth. Dark, wet, and never actually examined. */
  mouth: () =>
    make("mouth", () =>
      new THREE.MeshStandardMaterial({ color: 0x1b0d0c, roughness: 0.45, metalness: 0 }),
    ),

  /**
   * Hair.
   *
   * `flatShading` off and a high roughness floor: the strand map carries the
   * banding, and anything glossier than this reads as wet rather than as hair.
   * Double-sided because the long shells are open surfaces seen from both
   * faces as the head turns.
   */
  hair: (shade = "dark", colour = 0x1d1714) =>
    make(`hair:${shade}:${colour}`, () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.hair(shade)),
        color: colour,
        roughness: 0.74,
        metalness: 0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.6,
      }),
    ),

  /**
   * Hair for a TUBE, with the strand map turned a quarter turn.
   *
   * TubeGeometry lays u ALONG the path and v around the circumference, which is
   * the opposite of every other surface in the game. The strand texture draws
   * its hairs down the u axis, so on a tube they came out as rings - and the
   * long hair rendered as a stack of black pipes with ribs on them, which is
   * exactly how it looked.
   *
   * Rotating the maps by 90 degrees about their centre puts the strands back
   * along the fall of the hair. The textures are cloned first, because they are
   * shared with the skull caps, which need them the other way round.
   */
  hairFall: (shade = "dark", colour = 0x1d1714) =>
    make(`hairFall:${shade}:${colour}`, () => {
      const set = tex.hair(shade);
      const turned = {};
      for (const key of ["map", "roughnessMap", "normalMap"]) {
        if (!set[key]) continue;
        const clone = set[key].clone();
        clone.center.set(0.5, 0.5);
        clone.rotation = Math.PI / 2;
        // Repeated hard along the fall so the strands are fine rather than
        // stretched over the whole length of a sheet.
        clone.repeat.set(1, 3);
        clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
        clone.needsUpdate = true;
        turned[key] = clone;
      }
      if (turned.normalMap) turned.normalScale = new THREE.Vector2(1, 1);
      return new THREE.MeshStandardMaterial({
        ...turned,
        color: colour,
        roughness: 0.68,
        metalness: 0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.7,
      });
    }),

  /**
   * Clothing.
   *
   * One generator, a colour per garment. Keyed by colour and roughness so two
   * garments of the same cloth share one material and therefore one draw call,
   * which matters because a dressed character is otherwise a dozen of them.
   */
  cloth: (colour = 0x2b2f34, roughness = 0.92) =>
    make(`cloth:${colour}:${roughness}`, () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.fabric()),
        color: colour,
        roughness,
        metalness: 0,
        envMapIntensity: 0.35,
      }),
    ),

  /* ======================================================================== *
   * WITHROOM - the world outside the room
   * ======================================================================== */

  /** Wet tarmac, for the road in the car scene. */
  asphalt: () =>
    make("asphalt", () =>
      new THREE.MeshStandardMaterial({
        ...maps(tex.asphalt()),
        color: 0x2a2c30,
        roughness: 1,
        metalness: 0,
        envMapIntensity: 0.4,
      }),
    ),

  /**
   * Smoke, fog and the wraith's body.
   *
   * Additive would be wrong: this is DARK smoke, and additive blending can
   * only ever brighten. Normal blending with a near-black colour and a soft
   * alpha mask means the puffs occlude what is behind them, which is what makes
   * the mass on the road read as solid enough to be frightening.
   *
   * `depthWrite: false` is mandatory on a stack of overlapping transparent
   * billboards - with it on, each puff clips the ones behind it and the mass
   * becomes a pile of visible discs.
   */
  smoke: (colour = 0x0a0b0d, opacity = 0.72) =>
    make(`smoke:${colour}:${opacity}`, () =>
      new THREE.MeshBasicMaterial({
        map: tex.smokePuff(),
        color: colour,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    ),

  /** A headlight beam or a glow: unlit, additive, never occludes. */
  beam: (colour = 0xfff0d4, opacity = 0.18) =>
    make(`beam:${colour}:${opacity}`, () =>
      new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    ),

  /** Car body paint: a dark metallic with a clearcoat over it. */
  carPaint: (colour = 0x23282d) =>
    make(`carPaint:${colour}`, () =>
      new THREE.MeshPhysicalMaterial({
        color: colour,
        roughness: 0.34,
        metalness: 0.55,
        clearcoat: 0.8,
        clearcoatRoughness: 0.18,
        envMapIntensity: 0.9,
      }),
    ),

  /** A mirror. Not a real reflection - see world/puzzles/mirror.js for why. */
  mirror: () =>
    make("mirror", () =>
      new THREE.MeshStandardMaterial({
        color: 0x8e9ba2,
        roughness: 0.06,
        metalness: 1,
        envMapIntensity: 1.2,
      }),
    ),
};

/** Release everything. Called only when the whole game is torn down. */
export function disposeAll() {
  disposeShell();
  for (const m of lib.values()) m.dispose();
  lib.clear();
}
