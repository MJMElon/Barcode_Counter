import { jsPDF } from 'jspdf';
import { prettyD } from './data.js';

// The Culling Duration report — the paper trail behind the speed incentive.
//
// Every completed run is listed, not just the ones that earned it: a payout
// list nobody can check against the runs that missed is a list nobody can
// argue with, and the near misses are exactly what a supervisor is asked
// about. Both dates sit on every row for the same reason — a run that started
// in July and finished in August has to be visibly an August run.
//
// Letterhead matches the Delivery Order (src/lib/pdf.js) so the two read as
// documents from the same company.

const CO_NAME = 'MEGA JUTAMAS SDN BHD';
const CO_BRAND = 'MJM Nursery';
const CO_ADDR = 'Lot 1180, Bangunan Bei, Krokop 2, Miri, Sarawak, Malaysia';

const INK = [17, 24, 39];
const GREY = [85, 85, 85];
const LIGHT = [229, 231, 235];
const HEAD_BG = [244, 244, 245];
const GREEN = [4, 120, 87];
const RED = [190, 18, 60];

const PAGE_BOTTOM = 276; // last y a row may start on before a new page

function tableHead(doc, y) {
  doc.setFillColor(...HEAD_BG);
  doc.rect(20, y, 170, 8.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text('#', 23, y + 5.7);
  doc.text('Plot', 30, y + 5.7);
  doc.text('Started', 66, y + 5.7);
  doc.text('Finished', 100, y + 5.7);
  doc.text('Days', 140, y + 5.7, { align: 'right' });
  doc.text('Result', 150, y + 5.7);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(20, y + 8.5, 190, y + 8.5);
  return y + 14.5;
}

/**
 * @param runs   rows from incentiveRuns(), fastest first
 * @param scope  { nursery, month, targetDays, minAreaPct, runLabel, by }
 */
export function buildCullingReport(runs, scope) {
  const doc = new jsPDF();
  const earned = runs.filter((r) => r.qualified);

  // ── Letterhead ──
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(CO_NAME, 20, 19);
  doc.setFontSize(10.5);
  doc.setTextColor(51, 51, 51);
  doc.text(CO_BRAND, 20, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text(CO_ADDR, 20, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...INK);
  doc.text('CULLING DURATION', 190, 19, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text(scope.runLabel, 190, 25.5, { align: 'right' });
  doc.text('Printed: ' + prettyD(scope.printedOn), 190, 30, { align: 'right' });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(20, 34.5, 190, 34.5);

  // ── What this report covers ──
  const facts = [
    ['Nursery', scope.nursery],
    ['Period', scope.month],
    ['Target', `${scope.targetDays} days or fewer`],
    ['Smallest area counted', `${scope.minAreaPct}% of its plot`],
  ];
  let y = 44;
  facts.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(k.toUpperCase(), 20, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(String(v), 70, y);
    y += 6;
  });

  // ── Headline ──
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text(`${earned.length} of ${runs.length} runs earned the incentive`, 20, y);
  y += 8;

  // ── Every run, fastest first ──
  y = tableHead(doc, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  runs.forEach((r, i) => {
    if (y > PAGE_BOTTOM) {
      doc.addPage();
      y = tableHead(doc, 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    }
    doc.setTextColor(...INK);
    doc.text(String(i + 1), 23, y);
    doc.text(r.label, 30, y);
    doc.text(prettyD(r.start), 66, y);
    doc.text(prettyD(r.end), 100, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(r.withinTarget ? GREEN : RED));
    doc.text(String(r.days), 140, y, { align: 'right' });

    // An area that finished in time but is too small to count says so, rather
    // than silently reading as a miss.
    const verdict = r.qualified
      ? 'Earns'
      : !r.entitled && r.withinTarget
        ? `Area too small (${r.pct}%)`
        : '—';
    doc.setTextColor(...(r.qualified ? GREEN : GREY));
    doc.setFont('helvetica', r.qualified ? 'bold' : 'normal');
    doc.text(verdict, 150, y);

    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.2);
    doc.line(20, y + 2.5, 190, y + 2.5);
    y += 7.5;
  });

  if (!runs.length) {
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'italic');
    doc.text('No run finished in this period.', 23, y);
    y += 7.5;
  }

  // ── Footnote: the two rules a reader will want to check ──
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  const note =
    `A run earns the incentive when it finishes within ${scope.targetDays} days. Areas of a split plot are ` +
    `judged on their own, but an area under ${scope.minAreaPct}% of its plot does not qualify. A run belongs to ` +
    'the month it finished in, so one starting in July and finishing in August is an August run.';
  doc.text(doc.splitTextToSize(note, 170), 20, y);

  y += 14;
  doc.setFontSize(8);
  doc.text(`Prepared by ${scope.by || '—'}`, 20, y);

  return doc;
}

export function cullingReportFileName(scope) {
  const bits = ['culling-duration', scope.nursery, scope.month]
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${bits}.pdf`;
}
