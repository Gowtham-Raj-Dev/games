/**
 * The wall clock. 300 mm across, hung on the wall.
 *
 * ORIGIN IS NOT THE USUAL ONE. Everything else in this folder sits on the
 * floor with its origin under it; this hangs, so its origin is the point on
 * the wall it is screwed to, with the whole clock in front of it (z >= 0) and
 * the dial facing +z. The layout code pushes it against a wall and turns it;
 * nothing has to know how thick it is.
 *
 * The hands are the reason this prop exists at all - a puzzle sets them to a
 * time - so they are separate named children with their pivots at the dial
 * centre. Rotating `hourHand.rotation.z` by -angle sweeps clockwise as seen
 * from in front, which is what "clockwise" means to the player.
 */

import { lod, cyl, torus, disc, xf, mergeAll } from "../geom.js";

const CASE_R = 0.132;
const BEZEL_R = 0.138;
const CASE_D = 0.042;

/** Where the hands start. 3:17 - late enough to feel specific, and readable. */
const DEFAULT_HOUR = 3;
const DEFAULT_MINUTE = 17;

/** Hand geometry: a pointer with a short counterweight tail behind the pivot. */
function handGeometry(THREE, detail, length, width) {
  const tail = 0.012;
  if (detail === 0) {
    const g = new THREE.BoxGeometry(width * 2, length + tail, 0.0028);
    g.translate(0, (length - tail) / 2, 0);
    return g;
  }

  // Tapered, because a parallel-sided bar reads as a strip of plastic and the
  // taper is what makes the tip findable against a busy dial.
  const s = new THREE.Shape();
  s.moveTo(-width, -tail);
  s.lineTo(width, -tail);
  s.lineTo(width * 0.5, length * 0.78);
  s.lineTo(0, length);
  s.lineTo(-width * 0.5, length * 0.78);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0028, bevelEnabled: false });
  g.translate(0, 0, -0.0014);
  return g;
}

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const radial = lod(detail, 12, 20, 36, 48);
  const tubular = lod(detail, 10, 18, 32, 44);

  /* ---------------------------------------------------------------------- *
   * Case and bezel
   * ---------------------------------------------------------------------- */

  const caseMesh = new THREE.Mesh(
    ctx.sg("clock.case", () =>
      xf(cyl(detail, CASE_R, CASE_R, CASE_D, radial), { z: CASE_D / 2, rx: Math.PI / 2 }),
    ),
    mat.wood(),
  );
  caseMesh.castShadow = true;
  caseMesh.receiveShadow = true;
  group.add(caseMesh);

  const brass = new THREE.Mesh(
    ctx.sg("clock.brass", () => {
      const parts = [];
      // Band around the case, open-ended because both its ends are covered -
      // one by the wall, one by the bezel.
      parts.push(
        xf(cyl(detail, BEZEL_R, BEZEL_R, 0.052, radial, true), { z: 0.026, rx: Math.PI / 2 }),
      );
      // The bezel proper: a torus already sits in the xy plane facing +z, so
      // it needs no rotation at all - the one piece of this clock that lands
      // in the right orientation for free.
      parts.push(xf(torus(detail, BEZEL_R, 0.0115, lod(detail, 5, 6, 10, 14), tubular), { z: 0.052 }));
      // Cap over the hand pivots.
      parts.push(xf(cyl(detail, 0.009, 0.009, 0.008, lod(detail, 6, 8, 12, 16)), { z: 0.0475, rx: Math.PI / 2 }));
      return mergeAll(parts);
    }),
    mat.brass(),
  );
  // The case behind it already casts the clock's whole silhouette; a second
  // caster coincident with it only doubles the cost and the peter-panning.
  brass.castShadow = false;
  brass.receiveShadow = true;
  group.add(brass);

  /* ---------------------------------------------------------------------- *
   * Dial, hands, glass - back to front
   * ---------------------------------------------------------------------- */

  const dial = new THREE.Mesh(disc(detail, 0.126, radial), mat.clockFace());
  dial.position.z = 0.0425;
  dial.castShadow = false;
  dial.receiveShadow = true;
  group.add(dial);

  const hourHand = new THREE.Mesh(
    ctx.sg("clock.hourHand", () => handGeometry(THREE, detail, 0.072, 0.0065)),
    mat.iron(),
  );
  hourHand.name = "hourHand";
  hourHand.position.z = 0.0445;

  const minuteHand = new THREE.Mesh(
    ctx.sg("clock.minuteHand", () => handGeometry(THREE, detail, 0.108, 0.005)),
    mat.iron(),
  );
  minuteHand.name = "minuteHand";
  minuteHand.position.z = 0.0465;

  // Negative because +z rotation is anticlockwise and a clock is not.
  const hourFraction = (DEFAULT_HOUR % 12) / 12 + DEFAULT_MINUTE / 720;
  hourHand.rotation.z = -hourFraction * Math.PI * 2;
  minuteHand.rotation.z = -(DEFAULT_MINUTE / 60) * Math.PI * 2;

  for (const hand of [hourHand, minuteHand]) {
    // Three millimetres thick, behind glass, inside a 300 mm disc that is
    // already casting: there is nothing a shadow from these can add.
    hand.castShadow = false;
    hand.receiveShadow = false;
    group.add(hand);
  }

  const glass = new THREE.Mesh(disc(detail, 0.131, radial), mat.glass(false));
  glass.position.z = 0.0535;
  glass.castShadow = false;
  glass.receiveShadow = false;
  // Drawn after the opaque dial behind it, which transparent sorting needs.
  glass.renderOrder = 1;
  group.add(glass);

  return group;
}
