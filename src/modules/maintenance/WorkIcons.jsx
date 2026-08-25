/**
 * The four maintenance jobs, drawn.
 *
 * Each one is the job as it is actually done, and each is drawn as the ONE
 * thing that separates it from the other three:
 *
 *   pd        the letters P & D — the name everyone already uses for it
 *   weeding   grass, and the knife going through it
 *   manuring  a hand tipping fertiliser out onto the ground
 *   interrow  a spray head over grass, wetting the ground between the bags
 *
 * These are read as small as 17px on a phone held at arm's length, so they
 * are solid shapes and few of them: an earlier set drew a whole man carrying
 * a knapsack tank for two of the jobs, which at that size was a grey smudge
 * and identical between the two. One object each, filling the frame.
 *
 * Everything inherits currentColor, so one set works wherever it is dropped.
 */

const svg = {
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
};
// Strokes that are genuinely lines — a blade of grass, a jet of spray.
const line = { stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

/* P & D — the letters, not a picture.
   Spraying for pest and disease and spraying between the rows are the same
   man with the same tank pointed at a different target, so any drawing of
   the two is a pair of near-identical smudges at icon size. The abbreviation
   is what the office writes on the schedule and what the Field Conductor
   says out loud, and it cannot be confused with anything else. */
export function PdIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="10.5"
        fontWeight="900"
        letterSpacing="-.5"
        fill="currentColor"
      >
        P&amp;D
      </text>
    </svg>
  );
}

/* Weeding — the knife going through the grass.
   The blade crosses the blades of grass rather than hovering over them, and
   one cut blade is already falling, so the picture is the cutting and not a
   knife next to a lawn. */
export function WeedingIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the grass, standing up to where the blade is */}
      <path {...line} strokeWidth="1.9" d="M6.4 20.2v-7.6" />
      <path {...line} strokeWidth="1.9" d="M10.2 20.2v-8.2" />
      <path {...line} strokeWidth="1.9" d="M14 20.2v-7.7" />
      {/* the tops already off, tipping away above the cut */}
      <path {...line} strokeWidth="1.7" d="M7.9 8.6 6.6 5.2" />
      <path {...line} strokeWidth="1.7" d="M11.6 8.2v-3.6" />
      {/* the knife, drawn last so it lies across the stems it is cutting */}
      <path d="M2.9 12.4 15.1 9.9v3.1L3.1 13.9a.75.75 0 0 1-.2-1.5Z" />
      <rect x="14.9" y="9.5" width="5.6" height="3.9" rx="1.5" />
      {/* the ground */}
      <rect x="2.8" y="20.2" width="18.4" height="1.6" rx=".8" />
    </svg>
  );
}

/* Manuring — a hand tipping fertiliser out.
   The hand is cupped and tilted, the granules are already falling in a
   spread, and there is a small heap where they land: a hand on its own says
   nothing about what it is holding. */
export function ManuringIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the back of the hand, tipped so the fingers point down-left */}
      <rect x="9.6" y="5.2" width="9" height="5" rx="1.9" transform="rotate(26 14.1 7.7)" />
      {/* the thumb, up over the top edge */}
      <rect x="9.9" y="2.9" width="3.8" height="1.8" rx=".9" transform="rotate(26 11.8 3.8)" />
      {/* three fingers off the front of it — the gaps are what say "hand"
          rather than "scoop" at 17px */}
      <rect x="4.6" y="8.6" width="5" height="1.7" rx=".85" transform="rotate(26 7.1 9.45)" />
      <rect x="4.5" y="10.7" width="4.6" height="1.6" rx=".8" transform="rotate(26 6.8 11.5)" />
      <rect x="5.1" y="12.7" width="3.8" height="1.5" rx=".75" transform="rotate(26 7 13.45)" />
      {/* the fertiliser running off the fingertips */}
      <circle cx="6.4" cy="16" r=".85" />
      <circle cx="9.4" cy="16.9" r=".7" />
      <circle cx="7.7" cy="18.4" r=".7" />
      <circle cx="11.4" cy="18.6" r=".65" />
      {/* the heap it is landing in */}
      <path d="M4.9 21.7c.9-2 2.5-3 4.8-3s3.9 1 4.8 3Z" />
      <rect x="2.8" y="21.7" width="18.4" height="1.5" rx=".75" />
    </svg>
  );
}

/* Inter-row — the spray head over the grass between the bags.
   A wide head throwing a fan of spray straight down, and the grass under it
   taking the wetting. What makes this job itself is that the spray lands on
   the ground between the polybags, never on the seedlings, so no seedling
   appears in it at all. */
export function InterrowIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the neck and the head */}
      <rect x="10.9" y="1.6" width="2.2" height="2.6" rx="1.1" />
      <path d="M5.9 4.4h12.2a1 1 0 0 1 1 1.5l-1 1.9a1 1 0 0 1-.9.5H6.8a1 1 0 0 1-.9-.5l-1-1.9a1 1 0 0 1 1-1.5Z" />
      {/* the fan of spray coming out of it */}
      <path {...line} strokeWidth="1.4" d="M7.6 9.7 6.3 12.4" />
      <path {...line} strokeWidth="1.4" d="M10.4 9.8 9.8 12.7" />
      <path {...line} strokeWidth="1.4" d="M13.6 9.8l.6 2.9" />
      <path {...line} strokeWidth="1.4" d="M16.4 9.7l1.3 2.7" />
      {/* the grass in the gap, taking it */}
      <path {...line} strokeWidth="1.7" d="M7.7 20.3c-1-1.7-1.2-3.4-.5-5.1" />
      <path {...line} strokeWidth="1.7" d="M12 20.3v-5.6" />
      <path {...line} strokeWidth="1.7" d="M16.3 20.3c1-1.7 1.2-3.3.5-5" />
      {/* the ground between the bags */}
      <rect x="2.8" y="20.3" width="18.4" height="1.6" rx=".8" />
    </svg>
  );
}

/** By the work-type key the schedule and the records use. */
export const WORK_ICONS = {
  pd: PdIcon,
  manuring: ManuringIcon,
  weeding: WeedingIcon,
  interrow: InterrowIcon,
};

/** One icon by key, sized by the caller. Falls back to nothing rather than
    to a wrong picture, so an unknown job never says it is another one. */
export default function WorkIcon({ workKey, className }) {
  const Icon = WORK_ICONS[workKey];
  return Icon ? <Icon className={className} /> : null;
}
