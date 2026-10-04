/**
 * Authored 3D models, if there are any.
 *
 * WITHROOM generates everything else in code, but two things procedural
 * geometry cannot carry are a human face and a car. Proportion, hair and skin
 * can be built and the result still reads as a game character rather than as a
 * person; a 1959 sedan can be boxed out of primitives and it still reads as a
 * box. So the game looks for real models on disk and uses them when they are
 * there.
 *
 *   assets/characters/him.glb     the husband
 *   assets/characters/her.glb     the wife
 *   assets/characters/ghost.glb   the thing in the building
 *   assets/models/car.glb         the car in the opening
 *
 * IF THE FILES ARE MISSING THE GAME STILL RUNS. Every one is optional: the
 * procedural rig in human.js takes over for whichever character has no file,
 * and car.js builds its own car. They can be mixed freely - a real model for
 * the wife and a built one for the husband is a perfectly valid state.
 *
 *
 * WHY THERE IS A MANIFEST
 * -----------------------
 * The first version of this file tried to be clever: measure anything, scale it
 * to a height, turn it to face +Z, and hope. That works for Mixamo, where every
 * export is the same shape, and it falls apart on everything else. The four
 * files in this build are all from Sketchfab and all four needed something
 * different:
 *
 *   him     a static mesh standing in an A-pose, 8.8 units tall, no rig at all.
 *   her     a static mesh standing in a T-POSE, with hair and eyelash cards on
 *           the same alpha-blended material as her skin, which sorts into black
 *           shards over her face unless the material is cut rather than
 *           blended.
 *   ghost   a skinned mesh with 78 Source-engine bones, two animation clips,
 *           and UNLIT materials - so in a room lit by one bulb she rendered at
 *           full daylight brightness, a woman in a bright red dress, which is
 *           the least frightening thing the game could have put in front of
 *           the player.
 *   car     a 1959 DeSoto with a 4-metre BAKED SHADOW PLANE lying under it. The
 *           plane is four vertices and it is four times the size of the car, so
 *           every automatic measurement of that file is wrong by 4x and the car
 *           came out the height of a kerb.
 *
 * None of that is knowable from the file. So it is written down, once, in the
 * manifest below, and everything downstream gets a model that is the right
 * size, facing the right way, made of materials that belong in this game.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * What the game knows about each file.
 *
 *   file      where it is, relative to index.html.
 *   kind      "character" (measured by height, stands on the floor) or "prop"
 *             (measured by length, sits on its own origin).
 *   size      the real-world measurement to scale to, in metres. For a
 *             character that is standing height; for a prop, length along Z.
 *   facing    extra Y rotation, in radians, that turns the model to face +Z.
 *             Every model here already does, but Mixamo exports face -Z, so
 *             this is the one knob a future file is most likely to need.
 *   drop      node names to delete after loading. Baked shadow planes,
 *             backdrops, and the little showcase pedestals that Sketchfab
 *             models sometimes stand on.
 *   cut       true to turn alpha-BLENDED materials into alpha-TESTED ones.
 *             Correct for hair cards and eyelashes; wrong for glass.
 *   spectral  true to run the ghost treatment: drain the colour, make it
 *             translucent, and give it a cold halo. See `hauntMaterial`.
 *   lit       force unlit (MeshBasicMaterial) models to respond to light.
 *   tint      multiply the albedo by this, for a model whose colours are too
 *             cheerful for the scene it is standing in.
 */
const MANIFEST = {
  him: {
    file: "assets/characters/him.glb",
    kind: "character",
    size: 1.78,
    facing: 0,
    cut: true,
  },
  her: {
    file: "assets/characters/her.glb",
    kind: "character",
    size: 1.66,
    facing: 0,
    // Her hair, eyelashes, skin and clothes are one mesh sharing one
    // alpha-blended material. Blended, the hair cards sort against her face and
    // render as black shards across it; cut, they are clean.
    cut: true,
  },
  ghost: {
    file: "assets/characters/ghost.glb",
    kind: "character",
    size: 1.74,
    facing: 0,
    spectral: true,
    lit: true,
  },
  car: {
    file: "assets/models/car.glb",
    kind: "prop",
    /*
     * 5.93, and a real 1959 DeSoto is 5.69.
     *
     * Four per cent over, so the model's roof clears the BUILT cabin that sits
     * inside it. The two have to agree about where the roof is - the shell is
     * only convincing while nothing of the interior pokes out through it - and
     * scaling the car is a great deal less work than re-deriving every height
     * in the cabin, at a difference nobody can see on a car in the rain.
     */
    size: 5.93,
    facing: 0,
    // Plane001 is the baked shadow. It is a 397-unit square against a 282-unit
    // car, and leaving it in makes every measurement of this file wrong.
    drop: ["Plane001", "Plane001_Material_#58_0"],
  },
};

/** id -> record, or null if there is no file. */
const loaded = new Map();
let attempted = false;

/**
 * Bone names this file knows how to use.
 *
 * Two naming schemes, because the two riggers that matter disagree:
 *
 *   MIXAMO    mixamorigHead, mixamorigNeck, mixamorigSpine1 ...
 *   SOURCE    bip_head_05, bip_neck_04, bip_spine_1_03, upper_armL_023 ...
 *
 * Source names carry a numeric suffix that is an export index rather than part
 * of the name, so the matcher strips a trailing _NN before comparing. Both
 * schemes then reduce to the same handful of words.
 */
const BONES = {
  head: ["mixamorighead", "head", "biphead"],
  neck: ["mixamorigneck", "neck", "bipneck"],
  spine: ["mixamorigspine1", "mixamorigspine", "spine1", "spine", "bipspine1", "bipspine0", "bipspine"],
  hips: ["mixamorighips", "hips", "pelvis", "bippelvis", "root"],
  leftArm: ["mixamorigleftarm", "leftarm", "upperarm_l", "upperarml"],
  rightArm: ["mixamorigrightarm", "rightarm", "upperarm_r", "upperarmr"],
};

/** `bip_spine_1_03` -> `bipspine1`. Punctuation and the export index go. */
function boneKey(name) {
  return name
    .toLowerCase()
    .replace(/_\d+$/, "")
    .replace(/[:_\s.-]/g, "");
}

/* -------------------------------------------------------------------------- *
 * Loading
 * -------------------------------------------------------------------------- */

/**
 * Is there a file at this path?
 *
 * A `HEAD` request rather than letting the loader fail, so a missing model
 * costs one cheap round trip instead of a red 404 and a thrown promise.
 */
async function exists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Try to load every model. Call once, during boot.
 *
 * Never rejects. Anything with no file simply has no entry, and `has()` reports
 * false for it for the rest of the session.
 */
export async function preload(onProgress) {
  if (attempted) return;
  attempted = true;

  const loader = new GLTFLoader();
  const ids = Object.keys(MANIFEST);
  const missing = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const spec = MANIFEST[id];
    onProgress?.((i + 0.5) / ids.length, "stCast");

    if (!(await exists(spec.file))) {
      loaded.set(id, null);
      missing.push(id);
      continue;
    }

    try {
      const gltf = await loader.loadAsync(spec.file);
      const rec = prepare(id, gltf, spec);
      loaded.set(id, rec);
      console.info(
        `[models] ${id}: ${spec.file} - ${rec.note}`,
      );
    } catch (err) {
      // A corrupt or unsupported file is worth saying out loud: unlike a
      // missing one, somebody meant this to work.
      console.error(`[models] ${id}: ${spec.file} failed to load`, err);
      loaded.set(id, null);
    }
  }

  if (missing.length > 0) {
    // Said out loud, once, so the 404s above it are obviously expected.
    console.info(
      `[models] no file for: ${missing.join(", ")} - using the built-in ` +
        `versions. See assets/characters/README.txt.`,
    );
  }

  onProgress?.(1, "stCast");
}

/* -------------------------------------------------------------------------- *
 * Measuring
 * -------------------------------------------------------------------------- */

const _skinV = new THREE.Vector3();
const _skinM = new THREE.Matrix4();

/**
 * The box a model ACTUALLY occupies, skinning included.
 *
 * `Box3.setFromObject` takes a skinned mesh's bind-pose geometry box and
 * transforms it by the mesh's own world matrix - and for a skinned mesh that
 * matrix means nothing, because the vertices are placed by the bones. On the
 * ghost that produced a box two centimetres across, which the "scale to
 * height" step below then multiplied by eighty.
 *
 * So skinned meshes are measured by skinning them on the CPU. It is a few
 * thousand vertices, once, during loading, and it is the only measurement that
 * is actually true.
 */
function measure(root) {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);

  root.traverse((node) => {
    if (!node.isMesh) return;

    if (!node.isSkinnedMesh) {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const b = node.geometry.boundingBox.clone();
      b.applyMatrix4(node.matrixWorld);
      box.union(b);
      return;
    }

    const pos = node.geometry.attributes.position;
    const skinIndex = node.geometry.attributes.skinIndex;
    const skinWeight = node.geometry.attributes.skinWeight;
    if (!skinIndex || !skinWeight) {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
      return;
    }

    // Every eighth vertex is plenty to find the extremes of a human figure and
    // keeps a dense model from costing anything noticeable.
    const step = pos.count > 20000 ? 8 : 1;
    for (let i = 0; i < pos.count; i += step) {
      _skinV.fromBufferAttribute(pos, i);
      node.applyBoneTransform(i, _skinV);
      _skinV.applyMatrix4(node.matrixWorld);
      box.expandByPoint(_skinV);
    }
  });

  return box;
}

/* -------------------------------------------------------------------------- *
 * Materials
 * -------------------------------------------------------------------------- */

/**
 * Turn a loaded material into one that belongs in this game.
 *
 * Models are authored for a bright turntable with a studio environment behind
 * them. This game is lit by one bulb, one lantern and a pair of headlights, and
 * a material tuned for the turntable glows in it.
 */
function dress(mat, spec) {
  if (!mat) return mat;

  // An unlit model is a flat sticker in a dark scene: it ignores every light,
  // so it is equally bright in the lantern glow and in the pitch black behind
  // it, and the eye reads that as a decal rather than as a thing in the room.
  if (spec.lit && mat.isMeshBasicMaterial) {
    const std = new THREE.MeshStandardMaterial({
      map: mat.map ?? null,
      color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
      transparent: mat.transparent,
      opacity: mat.opacity,
      side: mat.side,
      alphaTest: mat.alphaTest,
      roughness: 0.82,
      metalness: 0,
    });
    std.name = mat.name;
    mat = std;
  }

  if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 0.5;

  /*
   * Alpha-tested hair and eyelashes arrive as fully BLENDED materials, which
   * sort badly against the face they are drawn over: the cards end up painted
   * as dark shards across her eyes and mouth. Cutting instead of blending is
   * both faster and correct for a hair card.
   *
   * The threshold is low on purpose. Half is the usual value and it is right
   * for a map whose alpha is a clean cutout, which this one is not: the wife's
   * skin, clothes, hair and lashes all share one material and one texture, and
   * its alpha drifts through the mid-range across the cloth. At 0.5 the cut
   * punched holes through her dungarees. At 0.2 it removes only what was
   * genuinely meant to be invisible.
   *
   * The material's own `side` is LEFT ALONE. Forcing DoubleSide here seemed
   * harmless and was not: her shirt is modelled underneath the dungarees, so
   * drawing back faces painted the inside of the dungarees over the shirt, and
   * the result read as torn clothing. A model's author already decided which
   * faces matter.
   */
  if (spec.cut && mat.transparent && !mat.alphaMap && mat.opacity >= 0.99) {
    mat.transparent = false;
    mat.alphaTest = 0.2;
    /*
     * AND IT MUST WRITE DEPTH AGAIN. This line is the whole fix.
     *
     * GLTFLoader turns depth writing OFF for every material whose glTF alpha
     * mode is BLEND, which is correct for blending and catastrophic once the
     * material has been turned back into an opaque one. The wife's entire body
     * - skin, clothes, hair, all one material - stopped writing depth, so she
     * was drawn early in the opaque pass and then painted over by everything
     * that came after: the ground, the fence, a tree. All that survived was
     * whatever happened to be above the horizon, which was her head.
     *
     * She spent several builds as a floating face three metres behind the
     * husband, and every theory about it was wrong - wrong scale, wrong
     * lighting, wrong pose, a broken bend - because a raycast could see her
     * perfectly and so could the bounding box. The geometry was never the
     * problem. She was there the whole time, being overwritten.
     */
    mat.depthWrite = true;
  }

  if (spec.tint && mat.color) mat.color.multiply(new THREE.Color(spec.tint));

  if (spec.spectral) haunt(mat);

  return mat;
}

/**
 * The ghost treatment.
 *
 * The model is a woman in a bright red floral dress, photographed in daylight
 * and exported unlit. On its own it is a perfectly nice character model and it
 * is not in any sense frightening - it looks like somebody wandered in from a
 * different game. Four changes turn it into an apparition, and all four are
 * about REMOVING information rather than adding effects:
 *
 *   The colour goes.      A memory is not in colour. Draining the albedo to a
 *                         cold near-grey is most of the work on its own: what
 *                         is left is the pattern of the dress as a texture
 *                         rather than as a red thing.
 *   It stops being solid. Translucency is the whole visual grammar of a ghost,
 *                         and the one thing the player will check for.
 *   It stops being lit    only by the room. A faint self-glow keeps her visible
 *                         when she is standing somewhere the lantern does not
 *                         reach, which is where she is usually standing.
 *   It stops casting.     A shadow is a claim that something is there.
 */
function haunt(mat) {
  /*
   * THE COLOUR HAS TO COME OUT OF THE TEXTURE, and the first attempt did not.
   *
   * Tinting `material.color` toward grey looks like the obvious way to drain a
   * model, and it cannot work: the albedo map is MULTIPLIED by that colour, so
   * a grey tint over a red dress gives a darker red dress. She stayed exactly
   * as red and merely got dimmer, which is worse - a bright red ghost is at
   * least a choice, and a dim red one looks like a lighting bug.
   *
   * Saturation lives in the pixels, so the pixels are where it has to be taken
   * out. The map is redrawn once, at load, through a canvas.
   */
  if (mat.map) mat.map = drain(mat.map);

  mat.transparent = true;
  mat.opacity = 0.76;
  mat.depthWrite = true;
  mat.side = THREE.DoubleSide;
  if (mat.emissive !== undefined) {
    // Enough self-light to stay visible standing somewhere the lantern does
    // not reach, which is where she is usually standing. Not enough to read as
    // a lamp.
    mat.emissive = new THREE.Color(0x2b3647);
    if (mat.map) mat.emissiveMap = mat.map;
    mat.emissiveIntensity = 0.3;
  }
  if (mat.roughness !== undefined) mat.roughness = 0.95;
  if (mat.metalness !== undefined) mat.metalness = 0;
  mat.fog = true;
}

/** Textures already drained, so two materials sharing one map share one copy. */
const drained = new WeakMap();

/**
 * A desaturated, slightly cold copy of a texture.
 *
 * Not a straight greyscale: a trace of the original survives, which is what
 * stops the result looking like a photograph with the colour knob at zero. What
 * is left of the dress still reads as a pattern on cloth. The blue channel is
 * held up a little above the other two, so what little colour remains is the
 * colour of moonlight rather than of the dress.
 */
function drain(tex) {
  const cached = drained.get(tex);
  if (cached) return cached;

  const img = tex.image;
  if (!img?.width) return tex;

  try {
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const frame = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = l * 0.78 + d[i] * 0.09;
      d[i + 1] = l * 0.82 + d[i + 1] * 0.09;
      d[i + 2] = l * 0.9 + d[i + 2] * 0.09;
    }
    ctx.putImageData(frame, 0, 0);

    const out = new THREE.CanvasTexture(cv);
    // A canvas texture flips by default and a glTF one does not; copying every
    // sampler setting across is the difference between a ghost and a ghost
    // wearing her own face upside down.
    out.flipY = tex.flipY;
    out.wrapS = tex.wrapS;
    out.wrapT = tex.wrapT;
    out.repeat.copy(tex.repeat);
    out.offset.copy(tex.offset);
    out.colorSpace = tex.colorSpace;
    out.anisotropy = tex.anisotropy;
    out.needsUpdate = true;
    drained.set(tex, out);
    return out;
  } catch {
    // A texture the canvas refuses to read (cross-origin, or no 2D context at
    // all). A coloured ghost is better than no ghost.
    return tex;
  }
}

/**
 * A cold halo, built as geometry rather than as a shader.
 *
 * A fresnel rim is the usual way to make something look spectral, and it means
 * patching the standard material's fragment shader, which breaks on a three.js
 * upgrade in a way nobody notices until the ghost turns black. A second copy of
 * the mesh, very slightly larger, drawn back-faces-only and added rather than
 * blended, gives the same cold edge for ten lines and no shader at all. It also
 * deforms with the original, because it shares its skeleton.
 */
function addHalo(mesh) {
  /*
   * The halo geometry is a copy pushed OUT ALONG ITS NORMALS, not the same
   * geometry on a scaled node.
   *
   * Scaling the node is the obvious way to do it and it does nothing here: a
   * skinned mesh's vertices are placed by its bones, so the node's own scale
   * never reaches them. The halo would sit exactly on the surface it is meant
   * to surround and the two would z-fight. Pushing the positions in the buffer
   * survives skinning, because the skin indices and weights are copied
   * untouched and the bones move the swollen vertex exactly as they would have
   * moved the original.
   */
  const geo = mesh.geometry.clone();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (nor) {
    // The model's own units, not metres: this geometry is scaled down by its
    // parent, so the push has to be measured against the geometry's own size.
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const push = geo.boundingSphere.radius * 0.009;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + nor.getX(i) * push,
        pos.getY(i) + nor.getY(i) * push,
        pos.getZ(i) + nor.getZ(i) * push,
      );
    }
    pos.needsUpdate = true;
  }

  const mat = new THREE.MeshBasicMaterial({
    color: 0x5f7d9c,
    transparent: true,
    opacity: 0.13,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });

  let halo;
  if (mesh.isSkinnedMesh) {
    halo = new THREE.SkinnedMesh(geo, mat);
    halo.bind(mesh.skeleton, mesh.bindMatrix);
  } else {
    halo = new THREE.Mesh(geo, mat);
  }
  halo.name = `${mesh.name}:halo`;
  halo.castShadow = false;
  halo.receiveShadow = false;
  halo.renderOrder = 2;
  halo.frustumCulled = false;
  mesh.parent.add(halo);
  halo.position.copy(mesh.position);
  halo.quaternion.copy(mesh.quaternion);
  halo.scale.copy(mesh.scale);
  return halo;
}

/* -------------------------------------------------------------------------- *
 * Preparing
 * -------------------------------------------------------------------------- */

/**
 * Normalise a freshly loaded model.
 *
 * The order of operations here is load-bearing and it was wrong for a long
 * time. Rotating a model that has already been centred moves it back off
 * centre, because the rotation happens about the model's own origin and not
 * about the centre it was just given. So: drop, dress, ROTATE, measure, scale,
 * measure again, and only then centre it.
 */
function prepare(id, gltf, spec) {
  const root = new THREE.Group();
  root.name = `model:${id}`;
  const scene = gltf.scene;
  root.add(scene);

  // --- delete what should not be there ------------------------------------
  if (spec.drop?.length) {
    const doomed = [];
    scene.traverse((n) => {
      if (spec.drop.includes(n.name)) doomed.push(n);
    });
    for (const n of doomed) n.parent?.remove(n);
  }

  // --- materials, shadows, bones ------------------------------------------
  const bones = {};
  const skinned = [];
  scene.traverse((node) => {
    if (node.isMesh || node.isSkinnedMesh) {
      node.castShadow = !spec.spectral;
      node.receiveShadow = !spec.spectral;
      // A skinned mesh culled on its bind-pose box disappears the moment an
      // animation moves it outside that box, which on this ghost is most of
      // the time.
      if (node.isSkinnedMesh) {
        node.frustumCulled = false;
        skinned.push(node);
      }
      if (Array.isArray(node.material)) {
        node.material = node.material.map((m) => dress(m, spec));
      } else {
        node.material = dress(node.material, spec);
      }
    }
    if (node.isBone) {
      const key = boneKey(node.name);
      for (const [slot, names] of Object.entries(BONES)) {
        if (bones[slot]) continue;
        if (names.some((n) => key.endsWith(n))) bones[slot] = node;
      }
    }
  });

  // --- face +Z -------------------------------------------------------------
  scene.rotation.y = spec.facing ?? 0;
  scene.updateMatrixWorld(true);

  // --- scale to the size this thing is meant to be -------------------------
  const box = measure(scene);
  const size = box.getSize(new THREE.Vector3());
  const have = spec.kind === "prop" ? Math.max(size.x, size.z) : size.y;
  const k = have > 1e-6 ? spec.size / have : 1;
  scene.scale.multiplyScalar(k);
  scene.updateMatrixWorld(true);

  // --- stand it on the floor, centred on its own footprint -----------------
  const b2 = measure(scene);
  const centre = b2.getCenter(new THREE.Vector3());
  scene.position.x -= centre.x;
  scene.position.z -= centre.z;
  scene.position.y -= b2.min.y;
  scene.updateMatrixWorld(true);

  // --- the halo, once the ghost is the right size --------------------------
  if (spec.spectral) for (const m of skinned.length ? skinned : meshesOf(scene)) addHalo(m);

  const final = measure(scene);
  const fsize = final.getSize(new THREE.Vector3());

  return {
    id,
    root,
    scene,
    bones,
    clips: gltf.animations ?? [],
    size: fsize,
    note:
      `${fsize.x.toFixed(2)} x ${fsize.y.toFixed(2)} x ${fsize.z.toFixed(2)} m, ` +
      `${gltf.animations?.length ?? 0} clip(s), ` +
      `bones: ${Object.keys(bones).join(",") || "none"}`,
  };
}

function meshesOf(root) {
  const out = [];
  root.traverse((n) => {
    if (n.isMesh) out.push(n);
  });
  return out;
}

/* -------------------------------------------------------------------------- *
 * Queries
 * -------------------------------------------------------------------------- */

/** Is there a model for this? */
export const has = (id) => !!loaded.get(id);

/** The loaded record, or null. */
export const get = (id) => loaded.get(id) ?? null;

/** What was found, for the debug handle and the boot log. */
export const report = () =>
  Object.fromEntries([...loaded.entries()].map(([k, v]) => [k, v ? v.note : "none"]));

/* -------------------------------------------------------------------------- *
 * Cloning
 * -------------------------------------------------------------------------- */

function parallelTraverse(a, b, fn) {
  fn(a, b);
  for (let i = 0; i < a.children.length; i++) {
    parallelTraverse(a.children[i], b.children[i], fn);
  }
}

/**
 * Clone a model, skeleton and all.
 *
 * `Object3D.clone` copies a SkinnedMesh's bones by reference, so two clones of
 * the ghost would share one skeleton and animate as a single puppet in two
 * places. This is the standard rebind - three.js ships it as `SkeletonUtils`,
 * which this build does not include, and it is twenty lines.
 */
function deepClone(source) {
  const srcOf = new Map();
  const cloneOf = new Map();
  const clone = source.clone(true);

  parallelTraverse(source, clone, (a, b) => {
    srcOf.set(b, a);
    cloneOf.set(a, b);
  });

  clone.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const src = srcOf.get(node);
    if (!src?.skeleton) return;
    const bones = src.skeleton.bones.map((bone) => cloneOf.get(bone) ?? bone);
    node.bindMatrix.copy(src.bindMatrix);
    node.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), node.bindMatrix);
  });

  return clone;
}

/**
 * A copy of a loaded model, ready to put in a scene.
 *
 * Every caller gets its own, so the lobby can hold the cast while the car scene
 * builds its own and neither steals the other's geometry. Geometry, textures
 * and animation clips are shared; only the node graph and the skeleton are
 * new, which is the cheap half.
 */
export function instance(id) {
  const rec = loaded.get(id);
  if (!rec) return null;

  const scene = deepClone(rec.scene);
  const root = new THREE.Group();
  root.name = `model:${id}`;
  root.add(scene);

  const bones = {};
  scene.traverse((node) => {
    if (!node.isBone) return;
    const key = boneKey(node.name);
    for (const [slot, names] of Object.entries(BONES)) {
      if (bones[slot]) continue;
      if (names.some((n) => key.endsWith(n))) bones[slot] = node;
    }
  });

  return { id, root, scene, bones, clips: rec.clips, size: rec.size.clone() };
}
