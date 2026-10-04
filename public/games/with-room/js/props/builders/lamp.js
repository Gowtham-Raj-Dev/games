/**
 * The desk lamp. About 0.44 m tall, reaching 0.14 m forward.
 *
 * This is the only prop in the cell that is also a light fixture, so it has to
 * survive being looked at from directly underneath with its own lamp on. Two
 * consequences drive the construction:
 *
 *   The shade has a real inside. A cone drawn with front faces only is a hole
 *   when seen from below, and the player WILL look up into it the first time
 *   the bulb comes on. It is built as two lathes - the outer skin, and the
 *   same profile reversed so its normals face in - which gives a surface that
 *   lights from within for the cost of a second thin cone.
 *
 *   The bulb is a named child, not a light. Lights are expensive and the
 *   lighting rig owns the budget for them; this prop only promises that
 *   `lamp.getObjectByName("bulb")` is a small emissive sphere sitting in the
 *   shade's mouth, so the rig can parent a PointLight to it and switch it.
 */

import { lod, cyl, sphere, lathe, ring, rod, xf, mergeAll } from "../geom.js";

/* The arm, as three points. Written out because the articulation is the
 * silhouette: a straight stem would read as a bollard. */
const SHOULDER = [0, 0.058, 0.018];
const ELBOW = [0, 0.255, -0.045];
const WRIST = [0, 0.352, 0.078];

/** Head tilt. Negative so the beam falls forward, onto whatever is on the desk. */
const HEAD_TILT = -0.55;

const SHADE_MOUTH = 0.075;
const SHADE_TOP = 0.03;
const SHADE_H = 0.085;

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const radial = lod(detail, 10, 16, 28, 40);
  const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);

  /* ---------------------------------------------------------------------- *
   * Base
   *
   * Cast iron and deliberately over-heavy in profile: the mass has to look
   * like it could hold up an arm reaching 140 mm off-axis, or the lamp reads
   * as if it should have fallen over.
   * ---------------------------------------------------------------------- */

  const base = new THREE.Mesh(
    ctx.sg("lamp.base", () => {
      if (detail === 0) {
        return xf(cyl(detail, 0.03, 0.08, 0.055, radial), { y: 0.0275 });
      }
      return lathe(detail, "lampBase", [
        [0, 0],
        [0.078, 0],
        [0.082, 0.006],
        [0.080, 0.018],
        [0.062, 0.026],
        [0.034, 0.030],
        [0.024, 0.038],
        [0.020, 0.052],
        [0.019, 0.060],
        [0, 0.060],
      ], radial);
    }),
    mat.iron(),
  );
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  /* ---------------------------------------------------------------------- *
   * Arm
   * ---------------------------------------------------------------------- */

  const arm = new THREE.Mesh(
    ctx.sg("lamp.arm", () => {
      const segs = lod(detail, 5, 6, 10, 14);
      const parts = [
        rod(detail, V(SHOULDER), V(ELBOW), 0.009, segs),
        rod(detail, V(ELBOW), V(WRIST), 0.009, segs),
      ];
      // Knuckles. Without them the two rods meet in a visible notch at the
      // elbow, which is the first thing the eye finds on a thin silhouette.
      if (detail >= 1) {
        const k = sphere(detail, 0.0155, lod(detail, 6, 8, 12, 16), lod(detail, 4, 6, 8, 10));
        for (const p of [SHOULDER, ELBOW, WRIST]) {
          parts.push(xf(k, { x: p[0], y: p[1], z: p[2] }));
        }
      }
      return mergeAll(parts);
    }),
    mat.steel(),
  );
  arm.castShadow = true;
  arm.receiveShadow = true;
  group.add(arm);

  /* ---------------------------------------------------------------------- *
   * Head: shade and bulb
   *
   * Its own group so the tilt is one number, and so the lighting rig can read
   * the beam direction off the group's matrix instead of recomputing it.
   * ---------------------------------------------------------------------- */

  const head = new THREE.Group();
  head.name = "head";
  head.position.set(WRIST[0], WRIST[1], WRIST[2]);
  head.rotation.x = HEAD_TILT;
  group.add(head);

  const shade = new THREE.Mesh(
    ctx.sg("lamp.shade", () => {
      const parts = [
        // Outer skin, mouth at y = 0 so the head's origin is the beam origin.
        lathe(detail, "shadeOut", [[SHADE_MOUTH, 0], [SHADE_TOP, SHADE_H]], radial),
        // The same cone, 4 mm in and listed top-to-bottom. The reversed point
        // order is what turns the normals inward.
        lathe(detail, "shadeIn", [[SHADE_TOP - 0.003, SHADE_H], [SHADE_MOUTH - 0.004, 0]], radial),
      ];
      if (detail >= 1) {
        // Rims closing the two skins. 4 mm of edge, but it is the edge the
        // player looks straight at when the lamp is on.
        parts.push(xf(ring(detail, SHADE_MOUTH - 0.004, SHADE_MOUTH, radial), { rx: Math.PI / 2 }));
        parts.push(
          xf(ring(detail, SHADE_TOP - 0.003, SHADE_TOP, radial), { y: SHADE_H, rx: -Math.PI / 2 }),
        );
      }
      return mergeAll(parts);
    }),
    mat.plastic(0x2b2f33),
  );
  shade.castShadow = true;
  shade.receiveShadow = true;
  head.add(shade);

  const bulb = new THREE.Mesh(
    sphere(detail, 0.021, lod(detail, 6, 8, 12, 16), lod(detail, 4, 6, 8, 12)),
    mat.emissive(0xffd9a0, 2.4),
  );
  bulb.name = "bulb";
  bulb.position.y = 0.032;
  // It is the light source. Casting from the emitter gives a black disc in the
  // middle of its own pool of light.
  bulb.castShadow = false;
  bulb.receiveShadow = false;
  head.add(bulb);

  /* ---------------------------------------------------------------------- *
   * Switch
   * ---------------------------------------------------------------------- */

  if (detail >= 2) {
    const sw = new THREE.Mesh(cyl(detail, 0.007, 0.007, 0.014, 10), mat.brass());
    sw.position.set(0, 0.03, 0.055);
    sw.castShadow = false;
    sw.receiveShadow = true;
    group.add(sw);
  }

  return group;
}
