/**
 * How long this run has taken.
 *
 * One number, counted in the frame loop, shown on the HUD as HH:MM:SS and
 * saved with everything else - so a player who stops after act one and comes
 * back tomorrow sees a total for the whole run rather than for the session.
 *
 * It counts WALL TIME INSIDE THE GAME, which is a specific choice:
 *
 *   it runs   while playing, and through every cutscene - the drive and the
 *             flashback are part of how long you were in there.
 *   it stops  on the title screen, on the pause menu, while the tab is hidden,
 *             and after the ending. Time spent with the game paused is not time
 *             spent in the room, and a timer that keeps counting while somebody
 *             answers the door is a timer nobody trusts.
 *
 * That is why this ticks from the frame loop rather than from a start
 * timestamp: the loop is already stopped in exactly the cases where the clock
 * should stop, so there is nothing to special-case.
 */

let seconds = 0;
let running = false;
/** `performance.now()` at the previous tick, or 0 when not counting. */
let stamp = 0;

/**
 * The longest gap between two ticks that is counted as play.
 *
 * A BACKSTOP, not the mechanism: pausing is handled properly by `stop()` and
 * `start()`, which main.js calls from the loop's own pause and resume events.
 * This only catches a gap nobody announced - a breakpoint, a long GC, a frame
 * that took a second on a machine with no GPU.
 *
 * Two seconds rather than a quarter of one, because the quarter-second version
 * refused to count AT ALL under software rendering, where a frame legitimately
 * takes most of a second: the clock sat at zero through an entire test run.
 */
const MAX_GAP = 2;

export const get = () => seconds;
export const isRunning = () => running;

export function start() {
  running = true;
  stamp = 0;
}

export function stop() {
  running = false;
  stamp = 0;
}

export function reset() {
  seconds = 0;
  running = false;
  stamp = 0;
}

/**
 * Called from the frame loop.
 *
 * It measures REAL time rather than using the frame's delta, and that matters:
 * the loop's delta is clamped to the simulation's maximum step, so on a machine
 * rendering at ten frames a second the clock would run at a sixth of real speed
 * and report twenty minutes for a two-hour session. The clamp is right for
 * physics and wrong for a wall clock, so this keeps its own stamp.
 */
export function tick() {
  if (!running) {
    stamp = 0;
    return;
  }
  const now = performance.now();
  if (stamp > 0) {
    const gap = (now - stamp) / 1000;
    if (gap > 0 && gap < MAX_GAP) seconds += gap;
  }
  stamp = now;
}

/**
 * HH:MM:SS.
 *
 * Always three fields, always two digits each. A clock that switches between
 * MM:SS and HH:MM:SS halfway through a run changes width on screen, and a
 * readout that moves is a readout the eye has to re-find every time it looks.
 */
export function format(value = seconds) {
  const total = Math.max(0, Math.floor(value));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** A spoken-language version, for the ending card. */
export function spell(value = seconds) {
  const total = Math.max(0, Math.floor(value));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export const serialise = () => ({ seconds: +seconds.toFixed(1) });

export function deserialise(data) {
  seconds = Number(data?.seconds) || 0;
  running = false;
}
