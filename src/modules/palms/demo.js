// Demo data for checking the module end to end.
//
// The three stores have to agree with each other for a walkthrough to make
// sense: the plot statuses decide which plots the Culling Calculator lists,
// and the calculator decides which plots can raise a request. Seeding them
// together keeps the example coherent.

import { addDays, cullingScopePlots, saveDB, seedSample, todayStr } from './data.js';
import { cullingRate, resetSessionData } from './cullingData.js';
import { PURPOSE_CULLING, seedRequests } from './requests.js';

export function seedDemo() {
  const db = seedSample();
  // Save first: the calculator's scope is read back from storage.
  saveDB(db);

  const cull = resetSessionData();
  const scope = cullingScopePlots();
  const today = todayStr();

  // Pre-send a couple of requests so the "sent today" marker and the request
  // list both have something in them from the start.
  const picks = [];
  for (const nk of Object.keys(cull)) {
    for (const row of cull[nk]) {
      if (picks.length >= 2) break;
      if (!scope.has(row.plot)) continue;
      // Only a drone request can be raised, so seed the pre-sent ones there.
      const rate = cullingRate(row.balance, row.pokok, row.pokokAuditor, row.transplant);
      if (rate <= 0.1) picks.push({ plot: row.plot, nursery: nk });
    }
  }
  seedRequests(
    picks.map((p, i) => ({
      id: `demo-${p.plot}-${i}`,
      plot: p.plot,
      nursery: p.nursery,
      purpose: PURPOSE_CULLING,
      by: 'Contoh',
      at: i === 0 ? today : addDays(today, -1),
    }))
  );

  return db;
}
