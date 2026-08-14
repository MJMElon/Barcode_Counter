// Culling Calculator — trial data & formulas.
// Ported from the NurseryFCmobile standalone app; numbers are preset RANDOM
// values for the trial (no backend yet). Data lives for the whole browser
// session so entered amounts survive navigating back to the dashboard.

export const NURSERIES = {
  BNN: { prefix: 'B', count: 14, label: '' },
  UNN1: { prefix: 'U', count: 18, label: 'Nurseri Ulu 1' },
  UNN2: { prefix: 'N', count: 20, label: 'Nurseri Ulu 2' },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// transplant: 900–1200 ; today balance set so the starting culling rate
// (pokok = 0) lands between 6% and 15%.
function buildData() {
  const data = {};
  for (const key in NURSERIES) {
    const cfg = NURSERIES[key];
    data[key] = [];
    for (let i = 1; i <= cfg.count; i++) {
      const transplant = randInt(900, 1200);
      const targetRate = randInt(600, 1500) / 10000; // 0.0600 – 0.1500
      const balance = Math.round(transplant * targetRate);
      data[key].push({
        plot: cfg.prefix + i,
        transplant,
        balance,
        pokok: null, // Field Conductor entry
        pokokAuditor: null, // Auditor entry (2nd level)
        video: null, // recorded/uploaded video filename
      });
    }
  }
  return data;
}

let sessionData = null;
export function getSessionData() {
  if (!sessionData) sessionData = buildData();
  return sessionData;
}

// rate = (Today balance − Pokok Inang FC − Pokok Inang Auditor) / Transplant
// (amounts treated as 0 before they are filled in)
export function cullingRate(balance, pokok, pokokAuditor, transplant) {
  const p = pokok || 0;
  const pa = pokokAuditor || 0;
  if (!transplant) return 0;
  return (balance - p - pa) / transplant;
}

export function fmtPct(fraction) {
  return (fraction * 100).toFixed(2) + '%';
}

export function fmtNum(n) {
  return n.toLocaleString('en-US');
}

// video evidence is needed when the Auditor amount is submitted but the rate
// is still above 10%
export function videoNeeded(row) {
  return (
    row.pokokAuditor !== null &&
    cullingRate(row.balance, row.pokok, row.pokokAuditor, row.transplant) > 0.1
  );
}

// Sasaran = how many pokok inang must be picked so the balance drops to
// transplant × 0.1 (culling rate ≤ 10%)
export function targetPokok(row) {
  return Math.max(0, Math.ceil(row.balance - row.transplant * 0.1));
}
