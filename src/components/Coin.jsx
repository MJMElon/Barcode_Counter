/**
 * The MJM coin.
 *
 * An M on one face, a palm seedling on the other, turning on its axis with
 * real thickness at the halfway point rather than flipping like a card.
 *
 * Drawn in CSS and SVG on purpose. A video or a sprite sheet would be the
 * quicker thing to reach for and would cost hundreds of kilobytes over a
 * nursery connection, would not scale, and would carry a background that has
 * to be matched to whatever it is dropped onto. This is a few hundred bytes,
 * sharp at any size, transparent behind, and it never waits on the network.
 *
 * Everything scales from ONE number, the diameter — the rim, the bevel on the
 * mark, the thickness, the badge and its type. A 28px coin is the same coin,
 * not a squashed one.
 *
 *   <Coin />                       80px, turning once every 40 seconds
 *   <Coin size={160} count={53} />  with the count on it
 *   <Coin size={28} spin={false} /> still, for a list
 *   <Coin every={6} />              turning more often, for a demo
 */

/* The thickness, and how many discs are stacked to make it. Face on they hide
   behind the front; edge on their stacked rims ARE the coin's side, which is
   what makes it read as a coin turning rather than a picture flipping. One
   disc per pixel or so, otherwise the side shows as stripes. */
const THICKNESS = 0.1;   // of the diameter
const SLICES = 21;

/* Seconds from one turn to the next. The turn itself is the first tenth of
   it (see mjm-coin-spin in index.css); the rest of the cycle it sits still,
   which is what keeps it worth looking at when it does move. */
const EVERY = 40;

export default function Coin({ size = 80, count = null, spin = true, every = EVERY, className = '' }) {
  const t = Math.max(6, size * THICKNESS);
  const half = (t / 2 + 0.2).toFixed(2);
  const step = t / (SLICES - 1);

  return (
    <span className={`relative inline-block align-middle ${className}`} style={{ width: size, height: size }}>
      <span className="block" style={{ perspective: size * 4.5 }}>
        <span
          className="relative block mjm-coin"
          style={{
            width: size,
            height: size,
            transformStyle: 'preserve-3d',
            /* Linear, because the arc and the winding-down are in the
               keyframes themselves — an easing curve on top of them would
               fight the shape rather than help it. */
            animation: spin ? `mjm-coin-spin ${every}s linear infinite` : 'none',
            // How high it goes, from the one number everything else comes from.
            '--hop': `${(size * 0.3).toFixed(1)}px`,
            transform: spin ? undefined : 'rotateY(-18deg)',
          }}
        >
          {/* the body */}
          {Array.from({ length: SLICES }, (_, i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full"
              style={{
                transform: `translateZ(${(t / 2 - step * i).toFixed(2)}px)`,
                background:
                  'linear-gradient(90deg,#6d4a12 0%,#a8761c 22%,#e8b53c 48%,#f6d477 55%,#c9901f 78%,#6b4711 100%)',
              }}
            />
          ))}

          <Face size={size} z={`translateZ(${half}px)`}>
            <span
              style={{
                fontWeight: 900,
                color: '#7d2f1c',
                fontSize: size * 0.46,
                lineHeight: 1,
                userSelect: 'none',
                textShadow: `0 ${-size * 0.006}px 0 rgba(255,238,180,.85),
                             0 ${size * 0.008}px 0 rgba(78,25,12,.6),
                             0 ${size * 0.022}px ${size * 0.028}px rgba(78,35,10,.35)`,
              }}
            >
              M
            </span>
          </Face>

          <Face size={size} z={`rotateY(180deg) translateZ(${half}px)`}>
            <PalmDrop size={size} />
          </Face>
        </span>
      </span>

      {/* The count. OUTSIDE the spinning element on purpose: a badge is a
          label on the coin, not part of it, so it holds still while the coin
          turns — a number rotating away from the reader is unreadable half
          the time. */}
      {count != null && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-rose-600 text-white font-black tabular-nums"
          style={{
            top: '-2%',
            right: '-6%',
            minWidth: size * 0.3,
            height: size * 0.3,
            padding: `0 ${size * 0.06}px`,
            border: `${size * 0.022}px solid #fff`,
            fontSize: size * 0.155,
            lineHeight: 1,
            boxShadow: '0 2px 8px rgba(0,0,0,.35)',
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}

/* One struck face. backface-visibility keeps the far side from showing
   through the near one mirrored. */
function Face({ size, z, children }) {
  return (
    <span
      className="absolute inset-0 rounded-full flex items-center justify-center overflow-hidden"
      style={{
        transform: z,
        backfaceVisibility: 'hidden',
        border: `${size * 0.035}px solid #7d5518`,
        background:
          'radial-gradient(circle at 32% 26%, #ffeaa3 0%, #fbd25e 26%, #f3b93a 54%, #dc9a22 78%, #c07d15 100%)',
      }}
    >
      {children}
      {/* the sheen that makes it read as metal rather than a yellow circle */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 28% 20%, rgba(255,255,255,.55) 0%, rgba(255,255,255,0) 46%),' +
            'radial-gradient(ellipse at 74% 84%, rgba(120,70,0,.30) 0%, rgba(120,70,0,0) 48%)',
        }}
      />
    </span>
  );
}

/* The MJM mark: four serrated fronds off one crown with a drop of oil hanging
   under them.

   One frond is drawn once and placed four times — rotated for the lower pair,
   mirrored for the right — so the two halves cannot drift apart the way they
   would if each were drawn by hand. A coin is struck from a die, and a die is
   symmetrical.

   The drop carries its highlight as a hole rather than a paler mark: one path,
   fill-rule evenodd, so the crescent is the coin's own gold showing through.
   That is how a real strike would do it, and it survives being made small —
   a lighter fill would just muddy at 28px. */
/* One frond, drawn lying flat and pointing LEFT from its own origin: a spine
   with five pairs of leaflets off it, shortening toward the tip. A feather,
   in other words, which is what a palm frond is.

   Two earlier attempts drew it as a filled outline with a serrated edge, and
   both came out as a jagged bar — a frond's character is in the GAPS between
   its leaflets, and an outline has no gaps in it. Strokes have nothing else.

   Drawn flat and rotated into place, so every number here is a distance along
   the leaf and an angle off it, rather than coordinates nobody can check. */
const FROND =
  'M0 0 L-44 0' +
  ' M-8 0 L-14.9 -5.8 M-8 0 L-14.9 5.8' +
  ' M-15 0 L-21.5 -5.5 M-15 0 L-21.5 5.5' +
  ' M-22 0 L-28.1 -5.1 M-22 0 L-28.1 5.1' +
  ' M-29 0 L-34.4 -4.5 M-29 0 L-34.4 4.5' +
  ' M-36 0 L-40.2 -3.5 M-36 0 L-40.2 3.5';
/* The drop, and its highlight as a hole in it. */
const DROP =
  'M50 60 C54 70 62 77 62 83 A12 12 0 1 1 38 83 C38 77 46 70 50 60 Z' +
  'M44 84 C46 89 54 89 56 84 C55 91 45 91 44 84 Z';

function PalmDrop({ size }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{
        width: '84%',
        height: '84%',
        overflow: 'visible',
        filter: `drop-shadow(0 ${size * 0.008}px 0 rgba(78,25,12,.45))
                 drop-shadow(0 ${-size * 0.005}px 0 rgba(255,238,180,.7))`,
      }}
    >
      <g fill="#7d2f1c">
        {/* Four placements of the one frond: up and out on each side, and
            level and out beneath it. The right pair is the left pair
            mirrored, so the two halves cannot drift apart. */}
        <g transform="translate(50 56)" fill="none" stroke="#7d2f1c"
           strokeWidth="3.2" strokeLinecap="round">
          <path d={FROND} transform="rotate(52)" />
          <path d={FROND} transform="rotate(2)" />
          <g transform="scale(-1 1)">
            <path d={FROND} transform="rotate(52)" />
            <path d={FROND} transform="rotate(2)" />
          </g>
        </g>
        <path d={DROP} fillRule="evenodd" />
      </g>
    </svg>
  );
}
