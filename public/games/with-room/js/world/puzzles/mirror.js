/**
 * STAGE 8 - THE MIRROR.
 *
 * There is a mirror on the west wall. In it, on the east wall, a brass key hangs
 * on a hook. Turn round and the east wall is bare.
 *
 * The key is taken by reaching for where the hook WOULD be - the mirrored
 * position - and that is the whole puzzle. It is the last one in the game and
 * the only one that asks the player to disbelieve the room rather than to
 * manipulate it, which is the right note to end an act on.
 *
 * HOW IT IS BUILT, because the obvious implementation is wrong twice over.
 *
 * It is not a real reflection. A planar reflection means rendering the whole
 * scene a second time from a mirrored camera into a render target, every frame,
 * in a game that is already paying for a shadow-casting point light - and it
 * would also reflect the room faithfully, which is precisely what must not
 * happen here. The mirror has to show something that is not there.
 *
 * So the "reflection" is a MODEL. Behind the glass, at the mirrored position, is
 * a copy of the hook and the key, lit by its own light, seen through a dark
 * semi-transparent pane. The eye reads a dim object inside a mirror as a
 * reflection without question, and because it is an ordinary object in the scene
 * graph it can be removed at the exact moment the player takes the real one.
 *
 * The second trap: making the real hook invisible and the interaction a blind
 * guess at a spot on a bare wall. That is not a puzzle, it is a pixel hunt. So
 * once the player has LOOKED at the mirror, a nail hole appears on the east wall
 * at the mirrored point - visible, findable, and still requiring them to
 * understand why it is there.
 */

import * as THREE from "three";

import { audio } from "../../audio/manager.js";
import { clamp01, damp } from "../../core/maths.js";
import { mat } from "../../engine/materials.js";
import * as textures from "../../engine/textures.js";
import { t } from "../../i18n/strings.js";
import * as hud from "../../ui/hud.js";
import * as roomScale from "../roomScale.js";

export const id = "mirror";

const STATE = 7;

/** Height of the hook, and how far along the east wall it is. */
const HOOK_Y = 1.52;
const HOOK_ALONG = 0.62;

let api = null;
let group = null;
let mirror = null;
let reflection = null;
let reflectedKey = null;
let nailHole = null;
let realKey = null;
let solved = false;
let taken = false;
let glassGlow = 0;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(outer) {
  api = outer;
  group = new THREE.Group();
  group.name = "puzzle:mirror";
  group.visible = false;
  api.root.add(group);

  buildMirror();
  buildReflection();
  buildHookSite();
}

/**
 * The mirror.
 *
 * A tall foxed pane in a heavy frame, leaning against the wall rather than hung
 * on it - a mirror standing on the floor is a far more unsettling object in an
 * empty room than one at eye level, because it shows the floor and the ceiling
 * and the whole of whoever is in front of it.
 */
function buildMirror() {
  mirror = new THREE.Group();
  mirror.name = "mirror";

  const W = 0.78;
  const H = 1.62;

  const frameMat = mat.wood();
  for (const [w, h, x, y] of [
    [W + 0.1, 0.07, 0, H / 2], [W + 0.1, 0.07, 0, -H / 2],
    [0.07, H, -W / 2, 0], [0.07, H, W / 2, 0],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameMat);
    bar.position.set(x, y + H / 2, 0);
    bar.castShadow = true;
    bar.receiveShadow = true;
    mirror.add(bar);
  }

  // The backing: flat black, so the "reflection" behind the glass is seen
  // against nothing rather than against the wall.
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat.void());
  backing.position.set(0, H / 2, -0.26);
  mirror.add(backing);

  /*
   * The glass.
   *
   * A dark, barely-transparent metal surface: `mirror` material for the
   * specular, with an opacity low enough that the modelled reflection behind it
   * shows through. Foxing - the mottled tarnish of old mirror silvering - is
   * painted in with the stain texture, which also conveniently obscures the
   * fact that nothing else in the room appears in it.
   */
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({
      color: 0x6c777d,
      roughness: 0.14,
      metalness: 1,
      transparent: true,
      opacity: 0.72,
      envMapIntensity: 1.1,
    }),
  );
  glass.position.set(0, H / 2, 0.01);
  glass.renderOrder = 3;
  mirror.add(glass);
  mirror.userData.glass = glass;

  const fox = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({
      map: textures.stain(),
      color: 0x7d8580,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  fox.position.set(0, H / 2, 0.015);
  fox.renderOrder = 4;
  mirror.add(fox);

  // Leaning back a little, as a mirror resting against a wall does.
  api.place(mirror, { kind: "wall", side: "west", along: 0.3, offset: 0.26, y: 0 });
  mirror.rotation.z = 0;
  group.add(mirror);

  api.register(mirror, {
    hit: glass,
    verb: "inspect",
    name: "objMirror",
    onUse: () => {
      const first = !api.getFlag("lookedInMirror");
      api.setFlag("lookedInMirror");
      audio.play("mirrorRing", { gain: 0.6 });
      glassGlow = 1;
      hud.subtitle(taken ? t("mirrorEmpty") : t("mirrorKey"), 4.5);
      if (first) {
        // The nail hole becomes visible from this moment. It is the one
        // concession the puzzle makes, and it is made the instant the player
        // does the thing the puzzle is about.
        onBeat();
        audio.play("whisperPass", { gain: 0.6 });
      }
      return true;
    },
  });
}

/**
 * What the mirror shows.
 *
 * Built in the mirror's own local space, BEHIND the glass, at the distance the
 * east wall would be if it were reflected - so as the room grows and the east
 * wall moves away, the reflection has to move with it. That is done in
 * `layout`, and it is the only part of this puzzle that is not static.
 */
function buildReflection() {
  reflection = new THREE.Group();
  mirror.add(reflection);

  // The hook: a small iron S bent out of rod.
  const hook = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.012), mat.iron());
  hook.add(plate);
  const curl = new THREE.Mesh(
    new THREE.TorusGeometry(0.018, 0.0045, 5, 10, Math.PI * 1.3),
    mat.iron(),
  );
  curl.rotation.x = Math.PI / 2;
  curl.position.set(0, -0.03, 0.02);
  hook.add(curl);
  reflection.add(hook);
  reflection.userData.hook = hook;

  // The key. The same prop as the one the player will end up holding, which is
  // what makes the reveal land: it is recognisably the same object.
  reflectedKey = api.makeProp("key");
  if (reflectedKey) {
    reflectedKey.position.set(0, -0.06, 0.03);
    reflectedKey.rotation.z = Math.PI / 2;
    reflection.add(reflectedKey);
  }

  /*
   * Its own light.
   *
   * Everything behind the glass is in front of a black backing plate, so the
   * room's bulb cannot reach it - without a light of its own the reflection is
   * a silhouette. One tiny point light, no shadows, 40 cm of range: it lights
   * the key and nothing else, and the pool of light it makes inside the mirror
   * is most of why the illusion works.
   */
  const lamp = new THREE.PointLight(0xffe2b4, 1.1, 0.6, 2);
  lamp.castShadow = false;
  lamp.position.set(0, -0.02, 0.1);
  reflection.add(lamp);
  reflection.userData.lamp = lamp;
}

/**
 * The real site, on the east wall.
 *
 * A nail hole and a rust stain, and an interactable over them. Hidden until the
 * mirror has been looked at.
 */
function buildHookSite() {
  nailHole = new THREE.Group();

  const hole = new THREE.Mesh(
    new THREE.PlaneGeometry(0.03, 0.03),
    new THREE.MeshBasicMaterial({ color: 0x07080a, transparent: true, opacity: 0.9 }),
  );
  nailHole.add(hole);

  const rust = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.2),
    new THREE.MeshBasicMaterial({
      map: textures.stain(),
      color: 0x6e4a32,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  rust.position.set(0, -0.06, -0.002);
  nailHole.add(rust);

  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.36),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.z = 0.01;
  nailHole.add(hit);

  api.place(nailHole, {
    kind: "wall",
    side: "east",
    along: HOOK_ALONG,
    offset: 0.02,
    y: HOOK_Y,
  });
  group.add(nailHole);

  api.register(nailHole, {
    hit,
    verb: "reachFor",
    name: "objNail",
    onUse: () => takeKey(),
  });
}

/**
 * Take the key out of the reflection.
 *
 * The one moment in WITHROOM where the player's hand goes somewhere the room
 * says is empty and comes back with something. Everything about the sound and
 * the sequencing here is in service of that: the mirror rings, the reflected
 * key vanishes, and a real one is in their hand.
 */
function takeKey() {
  if (taken) {
    hud.subtitle(t("nailEmpty"), 2.6);
    audio.play("woodTap", { gain: 0.5 });
    return true;
  }

  if (!api.getFlag("lookedInMirror")) {
    // They have found the nail hole without looking in the mirror. Not a
    // failure - it is observant - but there is nothing on it yet, and saying so
    // points them at the mirror without telling them why.
    hud.subtitle(t("nailNothing"), 3.4);
    audio.play("woodTap", { gain: 0.6 });
    return true;
  }

  taken = true;
  solved = true;
  api.setFlag("stage8Solved");
  api.setFlag("hasFinalKey");

  // Out of the mirror.
  if (reflectedKey) reflectedKey.visible = false;
  if (reflection.userData.lamp) reflection.userData.lamp.intensity = 0;
  glassGlow = 1;

  audio.play("mirrorRing");
  audio.play("pickup");
  audio.stinger("solved");
  hud.subtitle(t("keyTaken"), 5);

  // The real key, now in the world and carryable. Placed at the nail so that if
  // the player puts it down they can find it again - the final door needs it.
  if (!realKey) {
    const prop = api.makeProp("key");
    if (prop) {
      const record = api.place(prop, { kind: "free" }, { size: api.propSize("key"), id: "finalKey" });
      if (record) {
        record.item = api.register(prop, {
          verb: "takeItem",
          name: "objKeyBrass",
          carry: true,
          inspect: true,
          mass: 0.02,
          collider: record.collider,
        });
        realKey = record;
        group.add(prop);
      }
    }
  }
  if (realKey) {
    const dims = roomScale.dims;
    realKey.object.visible = true;
    realKey.object.position.set(dims.hw - 0.3, HOOK_Y - 0.1, (HOOK_ALONG - 0.5) * dims.d);
  }

  api.solve(8);
  return true;
}

/* -------------------------------------------------------------------------- *
 * Layout
 * -------------------------------------------------------------------------- */

export function layout() {
  if (!group || !mirror) return;
  const dims = roomScale.dims;

  /*
   * Where the reflection sits.
   *
   * The mirror is on the west wall facing east. The east wall is `dims.w` away
   * from it, so its reflection is the same distance BEHIND the glass. The depth
   * is therefore the full room width minus the mirror's own offset, and it has
   * to be recomputed whenever the room changes size or the illusion breaks the
   * moment the walls move.
   */
  const depth = dims.w - 0.3;
  reflection.position.set(
    // Along the wall: the reflection of a point on the east wall is at the same
    // z, which in the mirror's local space is an x offset.
    (HOOK_ALONG - 0.5) * dims.d - mirror.position.z,
    HOOK_Y,
    -depth,
  );

  // Scaled down with distance by perspective alone - but the model is a real
  // object at a real distance, so there is nothing to fake. This is the whole
  // reason it is built as a model rather than drawn as a sprite.
}

export function onBeat() {
  const state = roomScale.stateId();
  /*
   * The mirror is in the room from the beginning of act two.
   *
   * It is also used by the horror system long before it is a puzzle - the
   * apparition that is in the mirror and not in the room is one of the ambient
   * events - so it appears one stage before the stage that needs it, giving the
   * player time to stop finding it interesting.
   */
  const on = state >= STATE - 1;
  if (group) group.visible = on;
  if (reflection) reflection.visible = state >= STATE && !taken;
  if (nailHole) nailHole.visible = state >= STATE && !!api.getFlag("lookedInMirror");
  if (realKey) realKey.object.visible = taken;
  layout();
}

export function tick(dt) {
  if (!group || !group.visible) return;

  // The glass flares when it is looked into or taken from, then settles. It is
  // the only feedback a mirror can give.
  if (glassGlow > 0.001) {
    glassGlow = damp(glassGlow, 0, 1.6, dt);
    const glass = mirror.userData.glass;
    if (glass) glass.material.opacity = 0.72 - glassGlow * 0.18;
  }
}

/** Has the player got the key the final door needs? */
export const hasKey = () => taken;

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  return { solved, taken };
}

export function deserialise(data) {
  if (!data) return;
  solved = !!data.solved;
  taken = !!data.taken;
  if (taken) {
    if (reflectedKey) reflectedKey.visible = false;
    if (reflection?.userData.lamp) reflection.userData.lamp.intensity = 0;
  }
  onBeat();
}

export function reset() {
  solved = false;
  taken = false;
  glassGlow = 0;
  if (reflectedKey) reflectedKey.visible = true;
  if (reflection?.userData.lamp) reflection.userData.lamp.intensity = 1.1;
  if (realKey) realKey.object.visible = false;
  onBeat();
}
