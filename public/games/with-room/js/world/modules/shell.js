/**
 * The room shell, built from reusable modules.
 *
 * The brief is explicit that the room must not be one stretched box, and
 * there is a gameplay reason as well as an art one: a single scaled mesh
 * stretches its texture, so a 250 m wall would show four-metre-wide concrete
 * grain and read as a backdrop painting rather than a wall.
 *
 * So each wall is a bank of fixed-width SEGMENTS laid end to end. The
 * segments live in an InstancedMesh and are repositioned - never rebuilt -
 * when the room resizes. Growing the room writes more instance matrices into
 * a buffer that is already allocated; it never touches the GPU's geometry.
 *
 * One pool is allocated at the largest room state the game can reach, so the
 * cost of an expansion is a loop over matrices and nothing else. That is what
 * makes it possible to animate the dimensions every frame for seven seconds
 * without a single allocation.
 */

import * as THREE from "three";

import { ROOM_STATES, MAX_STATE } from "../../core/config.js";

/** Width of one wall segment, in metres, per room state band. */
const SEGMENT_WIDTH = [2, 2, 2.5, 3, 4, 5, 7, 10, 12.5];

/** Wall thickness. Thin enough to be a wall, thick enough to catch light. */
const WALL_THICKNESS = 0.14;
const TRIM_HEIGHT = 0.12;
const TRIM_DEPTH = 0.03;

/** Reused during layout so the per-frame path allocates nothing. */
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/**
 * Worst-case segment count, so the instance buffer is allocated once.
 *
 * Computed from the largest state rather than guessed: if someone adds a
 * bigger room state to config.js, this follows automatically instead of
 * silently clipping the far wall off.
 */
function maxSegments() {
  const widthFor = (i) =>
    SEGMENT_WIDTH[i] ?? SEGMENT_WIDTH[SEGMENT_WIDTH.length - 1];

  /*
   * Size the pool across every TRANSITION, not every state.
   *
   * The first version took the worst single state, which is wrong in one
   * specific and very visible way. `stateId()` moves to the TARGET at the
   * start of a transition, so the segment width is already the target's -
   * but the dimensions are still travelling down from the source. Shrinking
   * from state 8 to state 7 therefore laid out a 250 x 150 room using state
   * 7's 3 m segments: 268 segments needed against a pool of 142. The surplus
   * was silently dropped, the east wall lost half its length, and an 80 m
   * hole stood open in the room for the whole 4.2 s of the shrink.
   *
   * So: for every pair of states that can be adjacent, take the LARGER
   * dimensions and the TARGET's segment width.
   */
  let worst = 0;
  for (let i = 0; i <= MAX_STATE; i++) {
    for (const j of [i - 1, i, i + 1]) {
      if (j < 0 || j > MAX_STATE) continue;
      const a = ROOM_STATES[i];
      const b = ROOM_STATES[j];
      const w = Math.max(a.w, b.w);
      const d = Math.max(a.d, b.d);
      const sw = widthFor(j); // the target's, because stateId() is the target
      worst = Math.max(worst, Math.ceil(w / sw) * 2 + Math.ceil(d / sw) * 2 + 8);
    }
  }
  return worst;
}

export const segmentWidthFor = (stateId) =>
  SEGMENT_WIDTH[stateId] ?? SEGMENT_WIDTH[SEGMENT_WIDTH.length - 1];

/* -------------------------------------------------------------------------- *
 * Construction
 * -------------------------------------------------------------------------- */

/**
 * Build the shell once. Returns a group plus the handles `layout()` needs.
 *
 * Geometry here is all unit-sized and scaled by the instance matrix, which is
 * what lets one BoxGeometry serve every wall segment at every room state.
 */
export function build(materials) {
  const group = new THREE.Group();
  group.name = "shell";

  const count = maxSegments();

  // --- Floor ---------------------------------------------------------------
  // A unit plane, scaled. The texture repeat is what carries the scale, and
  // that is reset per room state by the material library.
  const floorGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const floor = new THREE.Mesh(floorGeo, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  // The floor never casts: it is the bottom of a sealed box, so any shadow it
  // casts is onto geometry the player cannot see, at full shadow-map cost.
  floor.castShadow = false;
  floor.name = "floor";
  group.add(floor);

  // --- Ceiling -------------------------------------------------------------
  const ceiling = new THREE.Mesh(floorGeo, materials.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.receiveShadow = true;
  ceiling.castShadow = false;
  ceiling.name = "ceiling";
  group.add(ceiling);

  // --- Wall segments -------------------------------------------------------
  const segGeo = new THREE.BoxGeometry(1, 1, 1);
  const walls = new THREE.InstancedMesh(segGeo, materials.wall, count);
  walls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  walls.receiveShadow = true;
  walls.castShadow = true;
  // The bounding sphere is recomputed in layout(); until then it is wrong,
  // and a wrong bounding sphere means the walls vanish when the camera turns.
  walls.frustumCulled = false;
  walls.name = "walls";
  group.add(walls);

  // --- Skirting ------------------------------------------------------------
  // Small, and the single cheapest thing that stops the floor/wall junction
  // reading as two planes intersecting.
  const trim = new THREE.InstancedMesh(segGeo, materials.trim, count);
  trim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trim.receiveShadow = true;
  trim.castShadow = false;
  trim.frustumCulled = false;
  trim.name = "trim";
  group.add(trim);

  return {
    group,
    floor,
    ceiling,
    walls,
    trim,
    geometries: [floorGeo, segGeo],
    capacity: count,
  };
}

/* -------------------------------------------------------------------------- *
 * Layout
 * -------------------------------------------------------------------------- */

/**
 * Place every module for the given dimensions.
 *
 * Called every frame while the room is in motion, so it must stay allocation
 * free. It is a tight loop over at most a few hundred matrices and costs
 * well under a millisecond even at city scale.
 */
export function layout(shell, dims, stateId) {
  const { w, d, h, hw, hd } = dims;

  shell.floor.scale.set(w, d, 1);
  shell.floor.position.set(0, 0, 0);

  shell.ceiling.scale.set(w, d, 1);
  shell.ceiling.position.set(0, h, 0);

  const segW = segmentWidthFor(stateId);
  let i = 0;

  /**
   * Lay one run of segments along an axis.
   *
   * The last segment of a run is scaled down to fit exactly rather than
   * overhanging, because an overhang pokes through the corner and catches
   * the light as a visible spike.
   */
  const run = (length, axis, sign) => {
    const n = Math.max(1, Math.ceil(length / segW));
    const exact = length / n;
    for (let k = 0; k < n && i < shell.capacity; k++, i++) {
      const centre = -length / 2 + exact * (k + 0.5);

      if (axis === "x") {
        // Wall running along X, facing +/-Z.
        _p.set(centre, h / 2, sign * (hd + WALL_THICKNESS / 2));
        _s.set(exact, h, WALL_THICKNESS);
        _e.set(0, 0, 0);
      } else {
        // Wall running along Z, facing +/-X.
        _p.set(sign * (hw + WALL_THICKNESS / 2), h / 2, centre);
        _s.set(WALL_THICKNESS, h, exact);
        _e.set(0, 0, 0);
      }

      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      shell.walls.setMatrixAt(i, _m);

      // Skirting sits just inside the wall face, at its foot.
      if (axis === "x") {
        _p.set(centre, TRIM_HEIGHT / 2, sign * (hd - TRIM_DEPTH / 2));
        _s.set(exact, TRIM_HEIGHT, TRIM_DEPTH);
      } else {
        _p.set(sign * (hw - TRIM_DEPTH / 2), TRIM_HEIGHT / 2, centre);
        _s.set(TRIM_DEPTH, TRIM_HEIGHT, exact);
      }
      _m.compose(_p, _q, _s);
      shell.trim.setMatrixAt(i, _m);
    }
  };

  run(w, "x", -1); // north
  run(w, "x", 1); // south
  run(d, "z", -1); // west
  run(d, "z", 1); // east

  // Anything beyond the live count is pushed to zero scale rather than left
  // where it was. Setting `count` alone is not enough for the trim mesh,
  // which can legitimately have a different live count in future layouts.
  for (let k = i; k < shell.capacity; k++) {
    _m.makeScale(0, 0, 0);
    shell.walls.setMatrixAt(k, _m);
    shell.trim.setMatrixAt(k, _m);
  }

  // If the pool is ever exhausted the room has a hole in it, and a hole is
  // the one thing this game cannot have. Say so loudly rather than drawing
  // three walls and hoping nobody turns round.
  if (i >= shell.capacity) {
    console.error(
      `[shell] segment pool exhausted at ${i}/${shell.capacity} - the room is not closed`,
    );
  }

  shell.walls.count = i;
  shell.trim.count = i;
  shell.walls.instanceMatrix.needsUpdate = true;
  shell.trim.instanceMatrix.needsUpdate = true;
}

/**
 * Swap in the materials for a new room state.
 *
 * Separate from `layout` because materials change once per state while the
 * layout changes every frame of a transition.
 */
export function setMaterials(shell, materials) {
  shell.floor.material = materials.floor;
  shell.ceiling.material = materials.ceiling;
  shell.walls.material = materials.wall;
  shell.trim.material = materials.trim;
}

export function dispose(shell) {
  for (const g of shell.geometries) g.dispose();
  shell.walls.dispose();
  shell.trim.dispose();
}
