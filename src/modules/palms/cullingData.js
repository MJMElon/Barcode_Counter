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

// Every plot is dealt one of five starting hands, cycling in order, so each
// of the calculator's action states is guaranteed to appear rather than
// depending on the luck of the draw:
//
//   0  rate under 10%, nothing keyed in    -> Mohon drone terbang
//   1  rate under 10%, FC amount keyed in  -> Pindah pokok inang + drone
//   2  rate over 10%, FC amount keyed in   -> Tunggu Site Auditor
//   3  rate over 10%, Auditor amount too   -> Sila bagitahu HQ (+ video)
//   4  rate over 10%, nothing keyed in     -> no action yet
function buildData() {
  const data = {};
  let n = 0;
  for (const key in NURSERIES) {
    const cfg = NURSERIES[key];
    data[key] = [];
    for (let i = 1; i <= cfg.count; i++) {
      const transplant = randInt(900, 1200);
      const hand = n % 5;
      const low = hand === 0 || hand === 1;
      // start the rate comfortably below or above the 10% line
      const startRate = low ? randInt(600, 950) / 10000 : randInt(1250, 1800) / 10000;
      const balance = Math.round(transplant * startRate);

      let pokok = null;
      let pokokAuditor = null;
      if (hand === 1) {
        // shave a little off — still under 10%
        pokok = Math.round(balance * 0.25);
      } else if (hand === 2) {
        // not enough to drop under 10%, so the Site Auditor is next
        pokok = Math.max(0, Math.round(balance - transplant * 0.115));
      } else if (hand === 3) {
        pokok = Math.max(0, Math.round(balance - transplant * 0.14));
        pokokAuditor = Math.max(0, Math.round(transplant * 0.02));
      }

      data[key].push({
        plot: cfg.prefix + i,
        transplant,
        balance,
        pokok, // Field Conductor entry
        pokokAuditor, // Auditor entry (2nd level)
        video: null, // recorded/uploaded video filename
      });
      n++;
    }
  }
  return data;
}

let sessionData = null;
export function getSessionData() {
  if (!sessionData) sessionData = buildData();
  return sessionData;
}

// Deal a fresh set — used by the demo-data button so the calculator matches
// the plot statuses being reseeded alongside it.
export function resetSessionData() {
  sessionData = buildData();
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
