// Demo data for checking the module end to end.
//
// The three stores have to agree with each other for a walkthrough to make
// sense: the plot statuses decide which plots the Culling Calculator lists,
// and the calculator decides which plots can raise a request. Seeding them
// together keeps the example coherent.

import { freshDB, saveDB, seedSample } from './data.js';
import { resetSessionData } from './cullingData.js';
import { seedRequests } from './requests.js';

export function seedDemo() {
  const db = seedSample();
  // Save first: the calculator's scope is read back from storage.
  saveDB(db);

  resetSessionData();

  // No requests are seeded. "Sent today" has to mean the Field Conductor
  // actually sent it, so the queue is cleared instead — which also drops
  // anything raised against an earlier, now-replaced set of plot figures.
  seedRequests([]);

  return db;
}

// "Clear all data" should mean all of it — the plot statuses, the calculator's
// figures and anything queued for the Site Auditor or HQ.
export function clearAll() {
  const db = freshDB();
  saveDB(db);
  resetSessionData();
  seedRequests([]);
  return db;
}
