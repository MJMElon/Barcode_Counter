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
// Strokes that are genuinely lines — a jet of spray, a furrow in the soil.
const line = { stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

/* A tuft of grass, filled rather than stroked.
   Grass drawn as round-capped strokes reads as a row of matchsticks; a blade
   is wide at the root and comes to a point, and it is that taper the eye uses
   to call it grass. Shared so the two jobs that happen over grass are drawn
   over the same grass.

   Anchored by where it stands and how tall it is, not by a raw transform:
   the first attempt scaled it about the origin, which walked the tuft up and
   to the left until it grew through the spray it was supposed to be under. */
function GrassTuft({ cx = 12, base = 21, h = 9.9 }) {
  const s = h / 9.9; // the blades below are 9.9 tall and centred on x=12
  return (
    <g transform={`translate(${cx - 12 * s} ${base - 21.2 * s}) scale(${s})`}>
      <path d="M12 21.2c-2.7-2-4.4-5-5.1-9 3 1.7 4.7 4.7 5.1 9Z" />
      <path d="M12 21.2c2.7-2 4.4-5 5.1-9-3 1.7-4.7 4.7-5.1 9Z" />
      <path d="M12 21.2c-1.2-3.3-1.2-6.6 0-9.9 1.2 3.3 1.2 6.6 0 9.9Z" />
    </g>
  );
}

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

/* Weeding — a fist round a knife, cutting a tuft of grass.
   The hand matters: this job is a man bent over with a blade, not a machine,
   and a knife on its own floating over grass reads as a logo rather than as
   work. The blade runs into the tuft, not above it. */
export function WeedingIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the tuft being cut, standing on the ground at the left */}
      <GrassTuft cx={7.6} base={20.8} h={8.6} />
      {/* the blade, thin, running down into the tuft */}
      <path d="M8.2 15.3 15.6 7.9l1.6 1.6-7.4 7.4Z" />
      {/* the fist: three fingers laid ACROSS the handle rather than along it.
          Strung out down the handle they piled into one lumpy shape and the
          knife came out looking like a guitar neck. */}
      <rect x="14.8" y="7.6" width="4.6" height="1.7" rx=".85" transform="rotate(45 17.1 8.45)" />
      <rect x="16.2" y="6.2" width="4.6" height="1.7" rx=".85" transform="rotate(45 18.5 7.05)" />
      <rect x="17.6" y="4.8" width="4.6" height="1.7" rx=".85" transform="rotate(45 19.9 5.65)" />
      {/* the ground */}
      <rect x="2.4" y="20.8" width="19.2" height="1.6" rx=".8" />
    </svg>
  );
}

/* Manuring — a hand tipping fertiliser onto the ground.
   Drawn from the side with the fingers spread and the thumb over the top, so
   it is a hand letting go of something rather than a mitten or a scoop. The
   granules leave the fingertips and land in a heap on worked soil. */
export function ManuringIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the back of the hand, tipped forward */}
      <path d="M13.4 3.9a2.4 2.4 0 0 1 3.3-.8l3.1 1.8a2.4 2.4 0 0 1 .9 3.3l-2.3 4-7.3-4.2Z" />
      {/* the thumb, laid along the top edge */}
      <rect x="12.9" y="1.7" width="4.4" height="2" rx="1" transform="rotate(30 15.1 2.7)" />
      {/* four fingers off the front of the palm, splayed and pointing down.
          They overlap the palm rather than floating beside it — a gap there
          and the whole thing reads as a scoop. */}
      <rect x="9.4" y="8.2" width="2.1" height="5.4" rx="1.05" transform="rotate(30 10.45 10.9)" />
      <rect x="11.4" y="9.6" width="2.1" height="5" rx="1.05" transform="rotate(18 12.45 12.1)" />
      <rect x="13.6" y="10.2" width="2.1" height="4.4" rx="1.05" transform="rotate(6 14.65 12.4)" />
      <rect x="15.7" y="10.2" width="2" height="3.8" rx="1" transform="rotate(-6 16.7 12.1)" />
      {/* the fertiliser leaving the fingertips */}
      <circle cx="9.6" cy="16.4" r=".8" />
      <circle cx="12.8" cy="17.2" r=".65" />
      <circle cx="15.6" cy="16.6" r=".6" />
      <circle cx="11.2" cy="18.6" r=".55" />
      {/* the heap, on the ground */}
      <path d="M7.6 20.9c1-1.9 2.6-2.9 4.8-2.9s3.8 1 4.8 2.9Z" />
      <rect x="2.4" y="20.9" width="19.2" height="1.6" rx=".8" />
    </svg>
  );
}

/* Inter-row — a spray head over the grass between the polybags.
   The head is drawn dark and the grass green: it is the one job here done
   with a piece of kit rather than by hand, and two tones say that faster
   than any amount of outline. Nothing green is being sprayed ON — the wet
   goes to the ground between the bags, which is the whole difference from
   P & D. */
export function InterrowIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the head, its own dark tone rather than the icon's colour */}
      <g className="text-slate-800">
        <rect x="10.8" y="1.2" width="2.4" height="2.2" rx="1.1" fill="currentColor" />
        <path
          fill="currentColor"
          d="M6.2 3.4h11.6a1.1 1.1 0 0 1 1 1.6l-1 2a1.1 1.1 0 0 1-1 .6H7.2a1.1 1.1 0 0 1-1-.6l-1-2a1.1 1.1 0 0 1 1-1.6Z"
        />
      </g>
      {/* the spray leaving it, clear of the grass below */}
      <path {...line} strokeWidth="1.4" d="M7.9 8.9 7 11.1" />
      <path {...line} strokeWidth="1.4" d="M10.6 9 10.2 11.4" />
      <path {...line} strokeWidth="1.4" d="M13.4 9l.4 2.4" />
      <path {...line} strokeWidth="1.4" d="M16.1 8.9l.9 2.2" />
      {/* the grass it lands on, standing on the ground between the bags */}
      <GrassTuft cx={12} base={20.8} h={7.6} />
      <rect x="2.4" y="20.8" width="19.2" height="1.6" rx=".8" />
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
