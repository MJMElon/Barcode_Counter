/**
 * The four maintenance jobs, drawn.
 *
 * Emoji were standing in for these and read as decoration; a Field Conductor
 * picking a job on a phone should recognise the work at a glance, without
 * reading. Each one is the job as it is actually done:
 *
 *   weeding   a hand pulling a weed, roots and all, out of the ground
 *   manuring  a sack of fertiliser
 *   pd        a knapsack sprayer aimed at the seedling — the plants themselves
 *   interrow  a knapsack sprayer aimed at the grass BETWEEN the polybags
 *
 * P & D and inter-row are deliberately the same man with the same tank; the
 * only difference is what the lance points at, because in the field that is
 * the only difference.
 *
 * Solid shapes rather than thin outlines: these are read at 28px on a phone
 * held at arm's length, where a 1.5px stroke turns to mush. Everything
 * inherits currentColor, so one set works wherever it is dropped.
 */

const svg = {
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
};
// Strokes that are genuinely lines — a lance, a stem, a leg.
const line = { stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

/* Weeding — a fist closed round a weed, pulled up with its roots.
   The fist is three finger bars and a thumb rather than one silhouette: at
   28px a solid mitten reads as a hammer, and the gaps are what say "hand". */
export function WeedingIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the weed, splayed the way a pulled one is */}
      <path {...line} strokeWidth="1.8"
        d="M9.6 7.9C8.3 6.2 7.7 4.3 7.9 2.3M11.5 7.9c.4-2 1.6-3.6 3.4-4.6M10.5 7.8c0-1.8-.5-3.4-1.6-4.7" />
      {/* the fingers, wrapped round the stems */}
      <rect x="7.1" y="8.2" width="7.1" height="1.9" rx=".95" />
      <rect x="6.6" y="10.6" width="7.6" height="1.9" rx=".95" />
      <rect x="7.1" y="13" width="6.7" height="1.9" rx=".95" />
      {/* the thumb, across the front of them */}
      <rect x="5" y="10.9" width="2.9" height="3.3" rx="1.45" />
      {/* the roots, still hanging out of the fist */}
      <path {...line} strokeWidth="1.5"
        d="M10.6 15.1v2.9M10.6 16.7c-1 .5-1.8 1.1-2.4 2M10.6 16.7c1 .5 1.9 1.2 2.5 2.1" />
      {/* the crumbs of soil dropping off them */}
      <circle cx="7.4" cy="16.6" r=".75" />
      <circle cx="9" cy="18.8" r=".6" />
      {/* the ground it came out of */}
      <path d="M2.6 21c0-1 4.2-1.9 9.4-1.9s9.4.8 9.4 1.9-4.2 1.9-9.4 1.9S2.6 22 2.6 21Z" />
    </svg>
  );
}

/* Manuring — a sack of fertiliser, tied at the neck, sprout on the front. */
export function ManuringIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the gathered top */}
      <path {...line} strokeWidth="1.6"
        d="M7.2 6.1c.5-1.7 2-2.8 3.5-2.5 1.1-1.4 3.1-1.3 4.1.2 1.6-.3 2.9.8 3.1 2.3" />
      {/* the band, solid so the sack reads as tied */}
      <rect x="6" y="6.1" width="12" height="2.4" rx=".8" />
      {/* the body */}
      <path {...line} strokeWidth="1.6"
        d="M7.1 8.5c0 2.5-2.1 4.3-2.1 7.8 0 3.1 1.7 4.8 3.8 4.8h6.4c2.1 0 3.8-1.7 3.8-4.8 0-3.5-2.1-5.3-2.1-7.8" />
      {/* what is in it */}
      <path d="M12 11.6c1 .8 1 2.3 0 3.1-1-.8-1-2.3 0-3.1Z" />
      <rect x="10.4" y="15.8" width="3.2" height="1.1" rx=".55" />
      <rect x="9.2" y="18" width="5.6" height="1.1" rx=".55" />
    </svg>
  );
}

/* The man with the knapsack sprayer, facing right. Shared by both spraying
   jobs so they are recognisably the same work with a different target. */
function Sprayer({ lance, spray }) {
  return (
    <>
      {/* hat, head */}
      <rect x="3.5" y="4.5" width="6.4" height="1" rx=".5" />
      <path d="M5.2 4.5V3.9a1.5 1.5 0 0 1 3 0v.6Z" />
      <circle cx="6.7" cy="7" r="1.6" />
      {/* torso */}
      <path d="M5.4 8.7h2.9a1.2 1.2 0 0 1 1.2 1.2v3.4a1.2 1.2 0 0 1-1.2 1.2H5.4a1.2 1.2 0 0 1-1.2-1.2V9.9a1.2 1.2 0 0 1 1.2-1.2Z" />
      {/* the tank on his back, and the strap over the shoulder */}
      <rect x="9.6" y="7.6" width="3.4" height="5.4" rx="1.3" />
      <rect x="10.9" y="6.4" width="1" height="1.4" rx=".5" />
      <path {...line} strokeWidth="1.3" d="M8.6 8.9c.5-.7 1.2-1.1 2-1.2" />
      {/* legs, striding */}
      <path {...line} strokeWidth="1.9" d="M5.7 14.5 4 20.4M7.9 14.5l1.9 5.9" />
      {/* the arm that holds the lance */}
      <path {...line} strokeWidth="1.5" d="M5 10.2 3.4 12" />
      {lance}
      {spray}
    </>
  );
}

/* P & D — the lance is raised, aimed at the seedling's leaves. */
export function PdIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      <Sprayer
        lance={<path {...line} strokeWidth="1.5" d="M3.4 12 15 9.4" />}
        spray={
          <>
            <circle cx="16.9" cy="9.6" r=".55" />
            <circle cx="17.6" cy="11" r=".45" />
            <circle cx="16.4" cy="11.4" r=".4" />
          </>
        }
      />
      {/* the seedling being sprayed */}
      <path {...line} strokeWidth="1.6" d="M18.6 20.2v-4.6" />
      <path d="M18.6 16.3c-.4-1.8-1.7-2.8-3.4-2.8.1 1.8 1.5 2.8 3.4 2.8Z" />
      <path d="M18.6 16.6c.4-1.9 1.8-3 3.6-3-.1 1.9-1.7 3-3.6 3Z" />
      <rect x="14.9" y="20.2" width="7.4" height="1.2" rx=".6" />
    </svg>
  );
}

/* Inter-row — the lance is level, aimed at the grass BETWEEN the polybags.
   The bags are set back so the grass in the gap is what the eye lands on:
   that gap is the whole difference between this job and P & D. */
export function InterrowIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      <Sprayer
        lance={<path {...line} strokeWidth="1.5" d="M3.4 12 12.8 16" />}
        spray={
          <>
            <circle cx="14.4" cy="16.8" r=".55" />
            <circle cx="14.8" cy="18.3" r=".45" />
            <circle cx="15.9" cy="17.5" r=".4" />
          </>
        }
      />
      {/* the two polybags, quieter than the grass between them */}
      <path d="M13.1 20.1l.6-3.3h2.4l.6 3.3Z" opacity=".6" />
      <path d="M20.2 20.1l.6-3.3h2.4l.6 3.3Z" opacity=".6" />
      {/* the grass in the gap — taller, solid, and where the spray lands */}
      <path {...line} strokeWidth="1.5"
        d="M18.4 20.1c-1-1-1.4-2.1-1.3-3.4M18.4 20.1v-3.6M18.4 20.1c1-.9 1.4-2 1.4-3.2" />
      {/* the ground */}
      <rect x="12.6" y="20.1" width="10.8" height="1" rx=".5" />
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
