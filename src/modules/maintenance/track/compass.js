/**
 * Which way the phone is facing.
 *
 * Two things make this fiddly, and both are the platforms' doing:
 *
 *  1. iOS 13 and later will not give a heading at all until the page asks, and
 *     the asking has to happen inside a real tap. That is why start() must be
 *     called straight out of the compass button's click handler and not from
 *     an effect — a request a frame later is refused, silently, and the button
 *     looks broken.
 *
 *  2. The number means different things. iOS hands over webkitCompassHeading,
 *     which is already degrees clockwise from true north. Everyone else gives
 *     `alpha` from deviceorientationabsolute, which counts the other way, so it
 *     has to be taken off 360. An `alpha` from the plain `deviceorientation`
 *     event is relative to wherever the phone happened to be when it started
 *     and is not a compass at all — it is used only when there is nothing else,
 *     and the caller is told the reading is rough.
 *
 * No imports, so it stays testable in plain node.
 */

export const HEADING_UNSUPPORTED = 'HEADING_UNSUPPORTED';
export const HEADING_DENIED = 'HEADING_DENIED';

/** True if this phone can be asked at all. */
export function headingSupported() {
  return typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined';
}

/**
 * Read the heading out of one orientation event.
 * Returns { deg, absolute } or null when the event carries nothing usable.
 */
export function headingOf(e) {
  if (!e) return null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    return { deg: e.webkitCompassHeading, absolute: true };
  }
  if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
    // alpha counts anticlockwise from north; a compass counts clockwise.
    return { deg: (360 - e.alpha) % 360, absolute: !!e.absolute };
  }
  return null;
}

/**
 * Smooth the needle.
 *
 * A raw compass on a phone jitters several degrees a second, and a map that
 * jitters with it is unreadable. Averaged as a direction rather than as a
 * number — 359° and 1° average to 0°, not to 180°, and doing it the naive way
 * makes the map spin all the way round every time somebody faces north.
 */
export function smoothHeading(prev, next, weight = 0.25) {
  if (prev == null) return next;
  let delta = ((next - prev + 540) % 360) - 180;   // the short way round
  return (prev + delta * weight + 360) % 360;
}

/**
 * Start listening. Returns a promise for a stop function.
 *
 * MUST be called from inside a click handler on iOS. Rejects with
 * HEADING_DENIED if the person says no, HEADING_UNSUPPORTED if the phone has
 * no compass to ask.
 */
export async function startHeading(onHeading) {
  if (!headingSupported()) throw new Error(HEADING_UNSUPPORTED);

  const DOE = window.DeviceOrientationEvent;
  if (typeof DOE.requestPermission === 'function') {
    let answer;
    try {
      answer = await DOE.requestPermission();
    } catch (e) {
      // Thrown when it was not called from a gesture. Same outcome either way.
      throw new Error(HEADING_DENIED);
    }
    if (answer !== 'granted') throw new Error(HEADING_DENIED);
  }

  let smoothed = null;
  const handle = (e) => {
    const h = headingOf(e);
    if (!h) return;
    smoothed = smoothHeading(smoothed, h.deg);
    onHeading(smoothed, h.absolute);
  };

  /* Both events. deviceorientationabsolute is the one that is a compass;
     plain deviceorientation is the fallback for phones that do not fire it,
     and its `absolute` flag tells the caller which they got. */
  const hasAbsolute = 'ondeviceorientationabsolute' in window;
  const name = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(name, handle, true);

  return () => window.removeEventListener(name, handle, true);
}
