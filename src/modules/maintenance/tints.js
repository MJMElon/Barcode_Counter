/**
 * A colour per job.
 *
 * The week is read at arm's length, in the sun, by someone deciding what to
 * do next — so each job carries a colour as well as an icon and a name. Three
 * cues beat one, and colour is the one that survives a glance.
 *
 * Kept here rather than beside the icons because the timeline, the cards and
 * the record list all need the same four, and three copies of a palette is
 * three chances for them to drift apart.
 *
 * `bar` and `ring` are spelled out separately even though one is the other
 * with bg- swapped for text-. Deriving it at runtime produced a class name
 * Tailwind never sees when it scans the source, so three of the four ring
 * colours were stripped from the build and those dials came out colourless.
 */
export const TINTS = {
  pd:       { bg: 'bg-violet-50',  fg: 'text-violet-700',  bar: 'bg-violet-500',
              ring: 'text-violet-500',  dark: 'text-violet-700' },
  manuring: { bg: 'bg-amber-50',   fg: 'text-amber-700',   bar: 'bg-amber-500',
              ring: 'text-amber-500',   dark: 'text-amber-700' },
  weeding:  { bg: 'bg-sky-50',     fg: 'text-sky-700',     bar: 'bg-sky-500',
              ring: 'text-sky-500',     dark: 'text-sky-700' },
  interrow: { bg: 'bg-emerald-50', fg: 'text-emerald-700', bar: 'bg-emerald-500',
              ring: 'text-emerald-500', dark: 'text-emerald-700' },
};

/** Never returns undefined: an unknown job gets a neutral rather than a crash. */
export const tintOf = (key) =>
  TINTS[key] || {
    bg: 'bg-slate-100', fg: 'text-slate-600', bar: 'bg-slate-400',
    ring: 'text-slate-400', dark: 'text-slate-600',
  };
