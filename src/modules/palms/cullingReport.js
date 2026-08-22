import { jsPDF } from 'jspdf';
import { prettyD } from './data.js';

// The Culling Incentive report — the paper trail behind the speed incentive.
//
// Two tables, because two questions get asked of it. The first is the period's
// work: every plot that ran culling through to transplanting, whether it beat
// the target or not. The second is the payout: only the runs that earned. A
// payout list nobody can check against the runs that missed is a list nobody
// can argue with, so the misses stay on the page — just not on the same table.
//
// Both dates sit on every row for the same reason: a run that started in July
// and finished in August has to be visibly an August run.
//
// The plot column names the plot, not the area within it. A split plot's areas
// are how PALMS logs the work, not how the nursery talks about it: "U8 earned
// the incentive" is the sentence, and which of its areas did is a detail for
// the screen the figures came from. A plot with two earning areas therefore
// appears twice, each with its own dates — two runs, honestly two rows.
//
// Set in Times, and the letterhead matches the Delivery Order (src/lib/pdf.js)
// so the two read as documents from the same company.

const CO_NAME = 'MEGA JUTAMAS SDN BHD';
const CO_BRAND = 'MJM Nursery';

const FONT = 'times';
const INK = [17, 24, 39];
const GREY = [85, 85, 85];
const LIGHT = [229, 231, 235];
const HEAD_BG = [244, 244, 245];
const GREEN = [4, 120, 87];
const RED = [190, 18, 60];

const LEFT = 20;
const RIGHT = 190;
const PAGE_BOTTOM = 262; // last y a row may start on before a new page

// Every column is centred under its own heading, so a short list of three
// plots reads as a deliberate block rather than as text pushed to the left of
// a page-wide table. The column centres are fixed, which is what keeps the
// tables lined up with each other however many rows each one has.
const COLS_ALL = [
  { key: 'no', head: 'No.', x: 27 },
  { key: 'plot', head: 'Plot', x: 49 },
  { key: 'start', head: 'Started', x: 81 },
  { key: 'end', head: 'Finished', x: 115 },
  { key: 'days', head: 'Days', x: 139 },
  { key: 'result', head: 'Result', x: 168 },
];
const COLS_EARNED = [
  { key: 'no', head: 'No.', x: 27 },
  { key: 'plot', head: 'Plot', x: 52 },
  { key: 'start', head: 'Started', x: 92 },
  { key: 'end', head: 'Finished', x: 137 },
  { key: 'days', head: 'Days', x: 175 },
];

function tableHead(doc, cols, y) {
  doc.setFillColor(...HEAD_BG);
  doc.rect(LEFT, y, RIGHT - LEFT, 8.5, 'F');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  cols.forEach((c) => doc.text(c.head, c.x, y + 5.7, { align: 'center' }));
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(LEFT, y + 8.5, RIGHT, y + 8.5);
  return y + 14.5;
}

// A tick and a cross drawn as lines rather than typed as characters. The
// standard PDF fonts are WinAnsi-encoded and have no U+2713 or U+2717, so a
// typed tick reaches the page as a wrong glyph or an empty box. Drawing them
// costs four line segments and renders the same in every reader.
function mark(doc, ok, x, y) {
  doc.setLineWidth(0.9);
  doc.setLineCap('round');
  if (ok) {
    doc.setDrawColor(...GREEN);
    doc.lines([[1.5, 1.7], [3, -4.2]], x - 2.2, y - 1.6);
  } else {
    doc.setDrawColor(...RED);
    doc.lines([[4, 4]], x - 2, y - 3.4);
    doc.lines([[-4, 4]], x + 2, y - 3.4);
  }
  doc.setLineCap('butt');
}

function sectionTitle(doc, text, y) {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(text, LEFT, y);
  return y + 6;
}

// One table. `withResult` is what separates the month's work from the payout:
// on the payout list every row earned, so a column saying so is noise.
function drawTable(doc, rows, y, { withResult, empty }) {
  const cols = withResult ? COLS_ALL : COLS_EARNED;
  y = tableHead(doc, cols, y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(10);

  if (!rows.length) {
    doc.setTextColor(...GREY);
    doc.setFont(FONT, 'italic');
    doc.text(empty, (LEFT + RIGHT) / 2, y, { align: 'center' });
    return y + 9;
  }

  rows.forEach((r, i) => {
    if (y > PAGE_BOTTOM) {
      doc.addPage();
      y = tableHead(doc, cols, 20);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(10);
    }
    const at = (key) => cols.find((c) => c.key === key).x;

    doc.setTextColor(...INK);
    doc.setFont(FONT, 'normal');
    doc.text(String(i + 1), at('no'), y, { align: 'center' });
    doc.text(r.plot || r.label, at('plot'), y, { align: 'center' });
    doc.text(prettyD(r.start), at('start'), y, { align: 'center' });
    doc.text(prettyD(r.end), at('end'), y, { align: 'center' });

    doc.setFont(FONT, 'bold');
    doc.setTextColor(...(r.withinTarget ? GREEN : RED));
    doc.text(String(r.days), at('days'), y, { align: 'center' });

    // Earned or not — a tick or a cross, nothing to read.
    if (withResult) mark(doc, r.qualified, at('result'), y);

    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.2);
    doc.line(LEFT, y + 2.5, RIGHT, y + 2.5);
    y += 7.5;
  });

  return y;
}

/**
 * @param runs   rows from incentiveRuns(), fastest first
 * @param scope  { nursery, month, targetDays, printedOn, by }
 */
export function buildCullingReport(runs, scope) {
  const doc = new jsPDF();
  const earned = runs.filter((r) => r.qualified);

  // ── Letterhead ──
  doc.setTextColor(...INK);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(16);
  doc.text(CO_NAME, LEFT, 19);
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.text(CO_BRAND, LEFT, 25);

  doc.setFont(FONT, 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text('CULLING INCENTIVE', RIGHT, 19, { align: 'right' });
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GREY);
  doc.text('Printed: ' + prettyD(scope.printedOn), RIGHT, 25.5, { align: 'right' });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(LEFT, 30.5, RIGHT, 30.5);

  // ── What this report covers ──
  const facts = [
    ['Nursery', scope.nursery],
    ['Period', scope.month],
    ['Target', `within ${scope.targetDays} days`],
  ];
  let y = 40;
  facts.forEach(([k, v]) => {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(k.toUpperCase(), LEFT, y);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(String(v), 60, y);
    y += 6;
  });

  // ── 1. The month's culling ──
  y += 6;
  y = sectionTitle(doc, `Culling workdone in ${scope.month}`, y);
  y = drawTable(doc, runs, y, {
    withResult: true,
    empty: 'No plot finished culling in this period.',
  });

  // ── 2. The payout ──
  y += 10;
  if (y > PAGE_BOTTOM - 20) {
    doc.addPage();
    y = 24;
  }
  y = sectionTitle(doc, 'Plots Eligible for the Incentive', y);
  y = drawTable(doc, earned, y, {
    withResult: false,
    empty: 'No run earned the incentive in this period.',
  });

  // ── Who prepared it ──
  // Label, then a gap, then the name on its own line: room for a signature
  // between the two is what makes this a document somebody signs off.
  y += 14;
  if (y > PAGE_BOTTOM) {
    doc.addPage();
    y = 24;
  }
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text('PREPARED BY', LEFT, y);

  doc.setFont(FONT, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(scope.by || '—', LEFT, y + 12);

  return doc;
}

export function cullingReportFileName(scope) {
  const bits = ['culling-incentive', scope.nursery, scope.month]
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${bits}.pdf`;
}
