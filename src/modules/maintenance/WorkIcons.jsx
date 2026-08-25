/**
 * The four maintenance jobs, drawn.
 *
 * These are words, not pictures. Drawings of the work kept coming out as
 * near-identical smudges once shrunk to icon size — two of the jobs are the
 * same man with the same tank pointed somewhere else, and two happen over the
 * same grass — whereas the words are what the office writes on the schedule
 * and what the Field Conductor says out loud:
 *
 *   pd        P&D
 *   manuring  BAJA
 *   weeding   RUMPUT, with the knife over it
 *   interrow  RUMPUT, with the spray head over it
 *
 * The two rumput jobs share the word on purpose. Both are done to the grass;
 * what separates them is the knife against the spray head, and that is the
 * only thing that differs in the picture.
 *
 * Every word is forced to an exact width with textLength, so a six-letter
 * word and a three-letter one both fill the frame and none of them depends on
 * the metrics of whatever font is loaded. Everything inherits currentColor.
 */

const svg = {
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
};
const line = { stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

/* The word itself. `w` is the width it is stretched to rather than a font
   size to guess at: RUMPUT has twice the letters of P&D and still has to sit
   in the same 24-wide box. */
function Word({ text, y, size, w = 21 }) {
  return (
    <text
      x="12"
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight="900"
      textLength={w}
      lengthAdjust="spacingAndGlyphs"
      fill="currentColor"
    >
      {text}
    </text>
  );
}

/* P & D — on its own, centred. */
export function PdIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      <Word text="P&D" y={12.5} size={11} w={18} />
    </svg>
  );
}

/* Manuring — BAJA. */
export function ManuringIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      <Word text="BAJA" y={12.5} size={10} w={20} />
    </svg>
  );
}

/* Weeding — RUMPUT under the knife that cuts it. */
export function WeedingIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the blade, laid across the top */}
      <path d="M2.6 8.4 14.8 5.9v2.9L2.8 9.8a.7.7 0 0 1-.2-1.4Z" />
      {/* the fist round the handle — three fingers across it */}
      <rect x="14.6" y="4.9" width="1.7" height="4.8" rx=".85" />
      <rect x="17" y="4.9" width="1.7" height="4.8" rx=".85" />
      <rect x="19.4" y="4.9" width="1.7" height="4.8" rx=".85" />
      <Word text="RUMPUT" y={16.8} size={7.6} w={21.5} />
    </svg>
  );
}

/* Inter-row — RUMPUT under the spray head that wets it. */
export function InterrowIcon({ className = 'w-7 h-7' }) {
  return (
    <svg {...svg} className={className}>
      {/* the head */}
      <rect x="10.9" y="1.2" width="2.2" height="1.8" rx="1.1" />
      <path d="M6.6 3h10.8a1 1 0 0 1 .9 1.5l-.8 1.6a1 1 0 0 1-.9.6H7.4a1 1 0 0 1-.9-.6l-.8-1.6A1 1 0 0 1 6.6 3Z" />
      {/* the spray coming off it */}
      <path {...line} strokeWidth="1.3" d="M8.4 8.1 7.7 9.8" />
      <path {...line} strokeWidth="1.3" d="M11.4 8.2 11.1 10" />
      <path {...line} strokeWidth="1.3" d="M14.1 8.2l.3 1.8" />
      <path {...line} strokeWidth="1.3" d="M16.8 8.1l.7 1.7" />
      <Word text="RUMPUT" y={17.4} size={7.6} w={21.5} />
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
