/**
 * Where the phone is, when a job is recorded.
 *
 * One question, asked once, with an answer small enough to store beside the
 * record: latitude, longitude, and how sure the phone is about them. Not a
 * track — nothing here watches a person around a nursery all morning. It is a
 * stamp on a record, taken at the moment the record is written, and only when
 * the GPS switch is on for that person.
 *
 * No imports, so it stays testable in plain node.
 */

/** The three ways this can fail, told apart because the fixes differ. */
export const GEO_UNSUPPORTED = 'GEO_UNSUPPORTED';  // no location device at all
export const GEO_DENIED      = 'GEO_DENIED';       // the browser was told no
export const GEO_UNAVAILABLE = 'GEO_UNAVAILABLE';  // asked, no fix, or timed out

/**
 * A single position fix.
 *
 * Six decimal places is about a tenth of a metre — far finer than any phone
 * actually knows, and enough that the number stops growing. `accuracy` is the
 * phone's own radius in metres, kept because a fix good to 5 m and a fix good
 * to 500 m look identical once they are two numbers on a screen.
 */
export function capturePosition({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const geo = typeof navigator !== 'undefined' && navigator.geolocation;
    if (!geo) return reject(new Error(GEO_UNSUPPORTED));
    geo.getCurrentPosition(
      (pos) => {
        const c = pos.coords || {};
        resolve({
          lat: Number(Number(c.latitude).toFixed(6)),
          lng: Number(Number(c.longitude).toFixed(6)),
          accuracy: c.accuracy == null ? null : Math.round(Number(c.accuracy)),
        });
      },
      (err) => reject(new Error(err && err.code === 1 ? GEO_DENIED : GEO_UNAVAILABLE)),
      // High accuracy, because a plot is 30 m across and the network's guess
      // at a position is a kilometre. A fix from the last half minute is close
      // enough to reuse; older than that and it is asked again.
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

/** Six decimals, as text — what goes on screen and into the record. */
export function formatPosition(gps) {
  if (!gps || gps.lat == null || gps.lng == null) return '';
  return `${Number(gps.lat).toFixed(6)}, ${Number(gps.lng).toFixed(6)}`;
}

/** Opens the spot in whatever map the phone uses. */
export function mapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`;
}
