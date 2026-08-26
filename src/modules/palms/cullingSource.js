/**
 * Where the Culling Calculator's numbers come from. Nothing is wired up yet.
 *
 * The whole calculation was taken out to be rebuilt, and this is the one place
 * it goes back in. The screen reads only from here — the plot list, the two
 * figures behind a plot, and the rate — so wiring the calculator up means
 * filling in these four functions and touching nothing else.
 *
 * Until they return something the screen runs, lists nothing, and says so.
 * That is deliberate: an empty list is honest, and a zero would not be.
 *
 * What was removed, in case any of it is worth having back (git has it all,
 * up to commit f79a4c5):
 *
 *   cullingScope.js    which plots to list, taken from the delivery orders
 *   cullingFigures.js  the ledger reads behind Transplant and Baki
 *   cullingCycles.js   splitting a plot into intakes by transplanting month,
 *                      the batches inside one, and the selling window
 *   cullingData.js     cullingRate, hasFigures, figuresBroken
 */

/**
 * Which plots the calculator lists.
 *
 * @returns {Promise<Array<{ plot: string, nursery: string }>>}
 *   `plot` as the office spells it — "U4", "B3". `nursery` is the key the
 *   portal uses: BNN, UNN1, UNN2.
 */
export async function loadPlots() {
  return [];
}

/**
 * The figures behind one plot.
 *
 * @param   {string} plot
 * @returns {{ transplant: number, balance: number } | null}
 *   null means "cannot say", which the screen shows as a dash. It is not the
 *   same as zero, and the difference matters: a plot with no figures must not
 *   read as a plot with none left.
 */
export function figuresFor(plot) {  // eslint-disable-line no-unused-vars
  return null;
}

/**
 * Whether a plot's figures can carry a rate at all.
 *
 * Kept separate from figuresFor so a plot can be listed with its figures
 * shown and still be refused a percentage — a balance the ledger cannot
 * explain should be visible, not silently rated.
 */
export function hasFigures(row) {  // eslint-disable-line no-unused-vars
  return false;
}

/**
 * The culling rate.
 *
 * @param   {{ balance: number, transplant: number, inang: number }} figures
 *   `inang` is what the Field Conductor has counted on the keypad so far.
 * @returns {number} a fraction — 0.1 is ten percent. NaN when there is no
 *   rate to be had, which the screen shows as a dash rather than as 0%.
 */
export function rateFor({ balance, transplant, inang }) {  // eslint-disable-line no-unused-vars
  return NaN;
}
