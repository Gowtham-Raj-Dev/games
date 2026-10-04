/**
 * Developer overlay.
 *
 * Off by default and opened with F8, or by adding `?debug` to the URL. It is
 * shipped rather than stripped from the build: the cost is a few hundred
 * bytes, and being able to tell a player to press F8 and read out the frame
 * time is worth considerably more than that.
 *
 * It exists mostly so the room transitions can be exercised without playing
 * through the puzzles - the vertical slice calls for a game-over triggered by
 * repeated debug shrinks, and this is how.
 */

import { stats } from "../core/loop.js";
import { get as getPlatform } from "../core/platform.js";
import { MAX_STATE } from "../core/config.js";

let node = null;
let visible = false;
let api = null;
let accum = 0;

export function init(systems) {
  api = systems;
  node = document.getElementById("debug");
  if (!node) return;

  if (new URLSearchParams(location.search).has("debug")) show(true);

  window.addEventListener("keydown", (e) => {
    if (e.code === "F8") {
      e.preventDefault();
      show(!visible);
      return;
    }
    if (!visible || !api) return;

    // Bracket keys step the room, so an expansion and a shrink can both be
    // watched back to back without touching a puzzle.
    switch (e.code) {
      case "BracketRight":
        api.roomScale.expand();
        break;
      case "BracketLeft":
        api.roomScale.shrink();
        break;
      case "Backslash":
        api.stability.set(Math.max(0, api.stability.get() - 15));
        break;
      case "Quote":
        api.stability.set(Math.min(100, api.stability.get() + 15));
        break;
      case "Digit0":
        api.roomScale.setStateImmediate(0);
        break;
      case "Digit9":
        api.roomScale.setStateImmediate(MAX_STATE);
        break;
      default:
        break;
    }
  });
}

export function show(on) {
  visible = on;
  if (node) node.hidden = !on;
}

export function tick(dt) {
  if (!visible || !node || !api) return;

  // Four times a second. A debug overlay that rewrites its own DOM every
  // frame measures itself more than it measures the game.
  accum += dt;
  if (accum < 0.25) return;
  accum = 0;

  const p = getPlatform();
  const r = api.renderer.info() ?? {};
  const d = api.roomScale.dims;
  const pos = api.controller.player.position;

  node.textContent = [
    `${Math.round(stats.fps)} fps   ${stats.frameMs.toFixed(1)} ms   steps ${stats.steps}`,
    `tier ${p.tier}   scale ${(r.scale ?? 1).toFixed(2)}   ${p.touch ? "touch" : "mouse"}`,
    `draws ${r.calls ?? 0}   tris ${(r.triangles ?? 0).toLocaleString()}`,
    `geo ${r.geometries ?? 0}   tex ${r.textures ?? 0}`,
    "",
    `state ${api.roomScale.stateId()} (${api.roomScale.state().name})  ${api.roomScale.phase()}`,
    `dims  ${d.w.toFixed(2)} x ${d.d.toFixed(2)} x ${d.h.toFixed(2)}`,
    `stab  ${api.stability.get().toFixed(0)}%  ${api.stability.getBand().key}`,
    `pos   ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`,
    "",
    "] expand   [ shrink   \\ -15   ' +15   0/9 jump   F8 close",
  ].join("\n");
}
