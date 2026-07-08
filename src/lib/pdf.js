import { jsPDF } from 'jspdf';

// Company letterhead — same identity block the Sales Web proforma invoice
// uses (admin-orders.js openProformaInvoice).
const CO_NAME = 'MEGA JUTAMAS SDN BHD';
const CO_BRAND = 'MJM Nursery';
const CO_ADDR = 'Lot 1180, Bangunan Bei, Krokop 2, Miri, Sarawak, Malaysia';

const INK = [17, 24, 39]; // #111827
const GREY = [85, 85, 85]; // #555
const LIGHT = [229, 231, 235]; // #e5e7eb row separators
const HEAD_BG = [244, 244, 245]; // #f4f4f5 table header

const fmtQty = (n) => Number(n || 0).toLocaleString('en-MY');

// Builds the Delivery Order PDF document, styled after the Sales Web
// proforma invoice letterhead. `al` is the matching shared_al_orders row
// (may be partial), `staff` is the signed-in staff display name,
// `sigDataUrl` is an optional PNG data-URL of the customer signature.
// Returns the jsPDF doc so callers can either save (print) it or upload
// it as a blob.
export function buildDOPdf(doRec, al = {}, staff = '—', sigDataUrl = null) {
  const doc = new jsPDF();
  const now = new Date();
  const dateFmt = doRec.delivery_date ? new Date(doRec.delivery_date).toLocaleDateString('en-MY') : '—';
  const customer = al.customer_name || doRec.remark || '—';

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
  doc.text('DELIVERY ORDER', 190, 19, { align: 'right' });
  doc.setFontSize(9.5);
  doc.text(doRec.do_number || '—', 190, 25.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text('Date: ' + dateFmt, 190, 30, { align: 'right' });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(20, 34.5, 190, 34.5);

  // ── Deliver To / Order details ──
  const labelStyle = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
  };
  labelStyle();
  doc.text('DELIVER TO', 20, 44);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(String(customer), 80), 20, 50);

  labelStyle();
  doc.text('ORDER DETAILS', 112, 44);
  const detail = [
    ['Order No.', al.order_number || doRec.al_number || '—'],
    ['AL Number', doRec.al_number || '—'],
    ['Product', al.product_name || '—'],
    ['Delivery Date', dateFmt],
  ];
  doc.setFontSize(9);
  detail.forEach(([l, v], i) => {
    const y = 50 + i * 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREY);
    doc.text(l, 112, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(String(v), 48)[0], 190, y, { align: 'right' });
  });

  // ── Items table ──
  let y = 80;
  doc.setFillColor(...HEAD_BG);
  doc.rect(20, y, 170, 8.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text('#', 23, y + 5.7);
  doc.text('Nursery / Plot', 30, y + 5.7);
  doc.text('Breed / Plant', 92, y + 5.7);
  doc.text('Qty', 187, y + 5.7, { align: 'right' });
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(20, y + 8.5, 190, y + 8.5);

  const items = [];
  for (let i = 1; i <= 5; i++) {
    const nursery = doRec[`plot_${i}`];
    const breed = doRec[`breed_${i}`];
    const qty = doRec[`qty_${i}`];
    if (nursery || breed || qty) items.push({ nursery: nursery || '—', breed: breed || '—', qty: qty || 0 });
  }
  if (!items.length) items.push({ nursery: '—', breed: '—', qty: doRec.total_qty || 0 });

  y += 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  items.forEach((it, i) => {
    doc.setTextColor(...GREY);
    doc.text(String(i + 1), 23, y);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(String(it.nursery), 58)[0], 30, y);
    doc.text(doc.splitTextToSize(String(it.breed), 85)[0], 92, y);
    doc.text(fmtQty(it.qty), 187, y, { align: 'right' });
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.2);
    doc.line(20, y + 3, 190, y + 3);
    y += 9;
  });

  // Total row
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  doc.line(20, y - 2, 190, y - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text('TOTAL QUANTITY', 92, y + 4);
  doc.text(fmtQty(doRec.total_qty), 187, y + 4, { align: 'right' });

  // Order balance context line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text(
    'Qty ordered: ' + (al.quantity_ordered != null ? fmtQty(al.quantity_ordered) : '—') +
      '   ·   Balance after this DO: ' + fmtQty(al.balance_quantity),
    190,
    y + 11,
    { align: 'right' }
  );

  // ── Customer acknowledgement ──
  y += 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text('CUSTOMER ACKNOWLEDGEMENT', 20, y);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(20, y + 2, 190, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text('I / We acknowledge receipt of the above items in good order and condition.', 20, y + 9);

  y += 15;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(20, y, 78, 30);
  doc.rect(112, y, 78, 30);

  if (sigDataUrl) {
    try {
      doc.addImage(sigDataUrl, 'PNG', 21, y + 1, 76, 28);
    } catch (e) {
      /* ignore bad signature image */
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('Customer Signature', 20, y + 35);
  doc.text('Issued By (' + CO_BRAND + ')', 112, y + 35);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(String(customer), 78)[0], 20, y + 40);
  doc.text(doc.splitTextToSize(String(staff || '—'), 78)[0], 112, y + 40);

  // ── Footer ──
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.3);
  doc.line(20, 280, 190, 280);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  doc.text('This Delivery Order is computer-generated by ' + CO_NAME + ' (' + CO_BRAND + ').', 20, 285);
  doc.setTextColor(150, 150, 150);
  doc.text(
    (doRec.do_number || 'DO') + ' · Generated ' + now.toISOString().slice(0, 19).replace('T', ' '),
    190,
    285,
    { align: 'right' }
  );

  return doc;
}

// Filename used both for the downloaded copy and the uploaded attachment.
export function doPdfFileName(doRec) {
  return (doRec.do_number || 'DO').replace(/[/\\]/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
}

// Generates and downloads the DO PDF (print flow).
export function printDO(doRec, al = {}, staff = '—', sigDataUrl = null) {
  buildDOPdf(doRec, al, staff, sigDataUrl).save(doPdfFileName(doRec));
}

// Generates the DO PDF as a Blob for uploading to storage (order attachment
// flow). Returns { blob, fileName }.
export function doPdfBlob(doRec, al = {}, staff = '—', sigDataUrl = null) {
  const doc = buildDOPdf(doRec, al, staff, sigDataUrl);
  return { blob: doc.output('blob'), fileName: doPdfFileName(doRec) };
}
