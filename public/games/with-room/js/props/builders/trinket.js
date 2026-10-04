/**
 * Her things.
 *
 * Three small objects the player has to find in a dark room and carry to the
 * bed: a wedding ring, a phone, and a scarf. One builder, three variants,
 * because they share the only thing that matters about them - they are
 * PERSONAL, and the room they are in is not.
 *
 * Every one of them is modelled to be identifiable by silhouette at the size
 * of a coin:
 *
 *   ring    a torus, and nothing else. The most recognisable shape in the game.
 *   phone   a rounded slab with a faint glowing screen. The glow is the whole
 *           object: it is what makes it findable, and the fact that it is still
 *           lit is the first evidence the player has that she was here recently.
 *   scarf   a loose coil of cloth. The one soft shape in a room made of
 *           concrete, iron and wood.
 *
 * The phone is the only object in WITHROOM that emits its own light, and that
 * is deliberate: when the player picks it up they are carrying the only thing
 * in the building that belongs to her, and it lights their hands.
 */

import { lod, box, cyl, sphere, torus, lathe, xf, mergeAll } from "../geom.js";

export function build(ctx) {
  const { THREE, mat, detail, variant, rng } = ctx;
  const group = new THREE.Group();
  const segs = lod(detail, 8, 10, 16, 24);

  switch (variant) {
    /* -------------------------------------------------------------------- *
     * The ring
     * -------------------------------------------------------------------- */
    case "ring": {
      const R = 0.0088;     // 17.5 mm inside diameter: a real woman's size
      const TUBE = 0.0016;

      const band = new THREE.Mesh(
        ctx.sg("trinket.ring.band", () =>
          // Lying flat, so it reads as a ring from directly above - which is
          // the angle it will be found at, on a floor.
          xf(torus(detail, R, TUBE, lod(detail, 5, 6, 8, 10), segs), { rx: Math.PI / 2 }),
        ),
        mat.brass(),
      );
      band.castShadow = true;
      band.receiveShadow = true;
      group.add(band);

      if (detail >= 2) {
        // A single small stone. Catches the bulb from one angle only, which is
        // how it gets noticed: the player sees a glint, not a ring.
        const stone = new THREE.Mesh(
          ctx.sg("trinket.ring.stone", () => sphere(detail, TUBE * 1.5, 6, 5)),
          mat.glass(false),
        );
        stone.position.set(0, TUBE * 1.6, -R);
        group.add(stone);
      }
      break;
    }

    /* -------------------------------------------------------------------- *
     * The phone
     * -------------------------------------------------------------------- */
    case "phone": {
      const W = 0.071;
      const H = 0.146;
      const D = 0.008;

      const shell = new THREE.Mesh(
        ctx.sg("trinket.phone.shell", () => box(detail, W, D, H, 0.0035)),
        mat.plastic(0x1a1c20),
      );
      shell.castShadow = true;
      shell.receiveShadow = true;
      group.add(shell);

      /*
       * The screen.
       *
       * Unlit and emissive, so it is the same brightness however dark the room
       * is - which is the point of a screen. It is also the only prop in the
       * game that carries a real PointLight, and it is a weak one: a phone lying
       * face up on a concrete floor lights about 40 cm of it, and that circle of
       * light is how the player finds it.
       */
      const screen = new THREE.Mesh(
        ctx.sg("trinket.phone.screen", () => box(detail, W * 0.9, 0.0008, H * 0.9, 0.002)),
        new THREE.MeshStandardMaterial({
          color: 0x05070c,
          emissive: 0x6f8fb8,
          emissiveIntensity: 1.5,
          roughness: 0.18,
          metalness: 0,
        }),
      );
      screen.position.y = D / 2 + 0.0004;
      screen.name = "phoneScreen";
      group.add(screen);

      const glow = new THREE.PointLight(0x7fa0c8, 0.55, 0.9, 2);
      glow.position.set(0, D / 2 + 0.03, 0);
      glow.castShadow = false;
      glow.name = "phoneGlow";
      group.add(glow);
      break;
    }

    /* -------------------------------------------------------------------- *
     * The scarf
     * -------------------------------------------------------------------- */
    case "scarf":
    default: {
      /*
       * A loose coil.
       *
       * Built as a tube along a curve rather than as a flat ribbon: a ribbon
       * needs two-sided rendering and reads as a strip of paper, while a
       * slightly flattened tube catches light down its length the way wool
       * does. The curve is seeded so the heap is the same every run - this is a
       * findable object and a player who learns where it is must find it there
       * again.
       */
      const r = ctx.rng ?? rng ?? Math.random;
      const points = [];
      const turns = 1.7;
      const steps = lod(detail, 7, 10, 16, 22);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = t * Math.PI * 2 * turns;
        const rad = 0.062 * (1 - t * 0.35);
        points.push(
          new THREE.Vector3(
            Math.cos(a) * rad + (r() - 0.5) * 0.008,
            0.012 + t * 0.022 + (r() - 0.5) * 0.004,
            Math.sin(a) * rad * 0.72 + (r() - 0.5) * 0.008,
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const coil = new THREE.Mesh(
        new THREE.TubeGeometry(curve, lod(detail, 10, 16, 26, 36), 0.016, lod(detail, 4, 5, 7, 9), false),
        mat.fabric(),
      );
      // Flattened: cloth, not rope.
      coil.scale.y = 0.55;
      coil.castShadow = true;
      coil.receiveShadow = true;
      group.add(coil);

      // One loose end, trailing away from the heap. It is what makes the object
      // read as dropped rather than as placed.
      const tail = new THREE.Mesh(
        ctx.sg("trinket.scarf.tail", () =>
          mergeAll([
            xf(box(detail, 0.03, 0.006, 0.07, 0.004), { z: 0.035 }),
            xf(box(detail, 0.028, 0.006, 0.055, 0.004), { z: 0.095, ry: 0.4 }),
          ]),
        ),
        mat.fabric(),
      );
      tail.position.set(0.04, 0.014, 0.03);
      tail.rotation.y = 0.5;
      tail.castShadow = true;
      group.add(tail);
      break;
    }
  }

  return group;
}
