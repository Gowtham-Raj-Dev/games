/**
 * A ceramic cartridge fuse. 50 mm long, the old industrial kind.
 *
 * Three of these are hidden in the room and the player has to find them, carry
 * them to the fuse box and seat them. So the brief for the model is unusually
 * specific: it has to be RECOGNISABLE AS A PAIR WITH THE SOCKET it goes into,
 * from across a dark room, at the size of a thumb.
 *
 * That means the silhouette is doing all the work and the silhouette is three
 * things: a white ceramic barrel, a brass cap at each end, and a coloured band
 * round the middle. The band is the important one - it is how the player knows
 * the three fuses are the same KIND of object as each other, and it is what the
 * socket's own painted ring matches.
 *
 * `variant` gives the band a colour so the three are individually
 * identifiable: the hint system can say "the red one is still missing" without
 * having to name a location.
 */

import { lod, cyl, torus, xf, mergeAll } from "../geom.js";

const LEN = 0.05;
const R = 0.0082;
const CAP = 0.0062;

/** Band colours, by variant. Chosen to stay distinguishable in a dark room. */
const BANDS = {
  red: 0x8e2f26,
  amber: 0xa07324,
  blue: 0x2b4e6e,
};

export function build(ctx) {
  const { THREE, mat, detail, variant } = ctx;
  const group = new THREE.Group();
  const segs = lod(detail, 6, 8, 12, 16);

  /* --- the ceramic body ------------------------------------------------- */
  const body = new THREE.Mesh(
    ctx.sg("fuse.body", () =>
      mergeAll([
        xf(cyl(detail, R, R, LEN - CAP * 2, segs), { rz: Math.PI / 2 }),
        // A slight waist, so the barrel is not a plain tube. Real ones are
        // moulded with a step where the cap crimps on.
        xf(cyl(detail, R * 0.94, R * 0.94, LEN * 0.4, segs), { rz: Math.PI / 2 }),
      ]),
    ),
    mat.ceramic(),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  /* --- brass end caps --------------------------------------------------- */
  const caps = new THREE.Mesh(
    ctx.sg("fuse.caps", () =>
      mergeAll([
        xf(cyl(detail, R * 1.06, R * 1.06, CAP * 2, segs), { x: -(LEN / 2 - CAP), rz: Math.PI / 2 }),
        xf(cyl(detail, R * 1.06, R * 1.06, CAP * 2, segs), { x: LEN / 2 - CAP, rz: Math.PI / 2 }),
      ]),
    ),
    mat.brass(),
  );
  caps.castShadow = true;
  caps.receiveShadow = true;
  group.add(caps);

  /* --- the band --------------------------------------------------------- *
   * Its own mesh with its own material, because the colour is the identity of
   * this instance and a shared material would make all three the same.
   */
  const band = new THREE.Mesh(
    ctx.sg("fuse.band", () =>
      xf(torus(detail, R * 1.02, R * 0.22, 6, segs), { rz: Math.PI / 2 }),
    ),
    new THREE.MeshStandardMaterial({
      color: BANDS[variant] ?? BANDS.red,
      roughness: 0.55,
      metalness: 0,
      // A faint emissive, so it is findable in a room lit by one bulb. This is
      // a gameplay decision wearing a material's clothes: without it, players
      // walk past a 50 mm object in a dark corner for ten minutes.
      emissive: BANDS[variant] ?? BANDS.red,
      emissiveIntensity: 0.22,
    }),
  );
  band.castShadow = false;
  group.add(band);

  return group;
}
