/**
 * How old the figures on the screen are, in words.
 *
 * Used wherever a module is drawing its own cached copy rather than a fresh
 * read — Maintenance and the Culling Calculator both. "Loaded 2 hours ago"
 * is a fact a Field Conductor can act on; a raw timestamp is one they have
 * to do arithmetic on while standing in a plot.
 *
 * Deliberately coarse. Nobody needs to know it was 43 minutes; they need to
 * know whether it was this morning or last week.
 */
export function agoText(at, t) {
  const ms = Date.now() - (Number(at) || 0);
  if (!at || ms < 0) return t('ago.unknown');
  const mins = Math.floor(ms / 60000);
  if (mins < 2) return t('ago.justNow');
  if (mins < 60) return t('ago.minutes', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('ago.hours', { n: hours });
  const days = Math.floor(hours / 24);
  return t('ago.days', { n: days });
}
