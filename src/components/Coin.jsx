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
            animation: spin
              ? `mjm-coin-spin ${every}s cubic-bezier(.3,.7,.25,1) infinite`
              : 'none',
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
            <Seedling size={size} />
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

/* A polybag and seven fronds off one crown, each rising then drooping at the
   tip the way a palm's do. Symmetrical about the centre, because a coin is
   struck and struck things are. */
function Seedling({ size }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{
        width: '76%',
        height: '76%',
        overflow: 'visible',
        filter: `drop-shadow(0 ${size * 0.008}px 0 rgba(78,25,12,.45))
                 drop-shadow(0 ${-size * 0.005}px 0 rgba(255,238,180,.7))`,
      }}
    >
      <g fill="none" stroke="#7d2f1c" strokeLinecap="round" strokeLinejoin="round">
        <path d="M41 72 L59 72 L56 92 L44 92 Z" fill="#7d2f1c" stroke="none" />
        <path d="M50 74 L50 58" strokeWidth="5.5" />
        <path d="M50 58 C50 44 50 30 50 18" strokeWidth="5.5" />
        <path d="M50 58 C43 45 36 33 29 24" strokeWidth="5" />
        <path d="M50 58 C57 45 64 33 71 24" strokeWidth="5" />
        <path d="M50 58 C38 51 26 43 16 38" strokeWidth="4.6" />
        <path d="M50 58 C62 51 74 43 84 38" strokeWidth="4.6" />
        <path d="M50 58 C37 57 24 56 12 59" strokeWidth="4.2" />
        <path d="M50 58 C63 57 76 56 88 59" strokeWidth="4.2" />
      </g>
    </svg>
  );
}
