// What an interaction cost the main thread, in counts rather than time
// (docs/performance.md#cost-counters): deterministic, so a budget fails like a
// correctness bug and never flakes. The renderer tests count the same names,
// and those only a device's views see besides (label redraws, input waits).
import { AssertionError } from 'node:assert';

/** The counters the headless host keeps, each since it started. */
export interface Counts {
  /** Records of the batches applied, the UI thread's prop writes included. */
  recordsApplied: number;
  propWrites: number;
  /** Prop writes of the value the view already had. */
  wastedPropWrites: number;
  /** Layouts that computed at least one node. */
  layoutPasses: number;
  /** Layout passes after which no box changed. */
  wastedLayoutPasses: number;
  /** Nodes the engine computed rather than took from its cache. */
  nodesLaidOut: number;
  /** Boxes the renderer took from a pass. */
  nodesFramed: number;
  /** Boxes taken unchanged. */
  wastedFrames: number;
  /** Leaves measured: each one a miss of the engine's measure cache. */
  measureCalls: number;
  /** Measures that answered what the leaf measured before it was marked dirty. */
  wastedMeasures: number;
  /** Calls into the UI-thread kernel: operations received, events, frames. */
  uiEntries: number;
  /** Events the UI-thread kernel had no handler for. */
  wastedUiEntries: number;
  /** Views made with a native view: a flattened node has none. */
  viewsCreated: number;
}

export type CostCounter = keyof Counts;

/** The most of each counter an interaction may cost; a counter left out is not limited. */
export type CostBudget = Partial<Counts>;

/** What an interaction cost: each counter's growth while it ran. */
export interface Cost extends Readonly<Counts> {
  /** Throws, naming every counter over `budget`, when the cost exceeds it. */
  toStayWithin(budget: CostBudget): void;
}

export const noCounts = (): Counts => ({
  recordsApplied: 0,
  propWrites: 0,
  wastedPropWrites: 0,
  layoutPasses: 0,
  wastedLayoutPasses: 0,
  nodesLaidOut: 0,
  nodesFramed: 0,
  wastedFrames: 0,
  measureCalls: 0,
  wastedMeasures: 0,
  uiEntries: 0,
  wastedUiEntries: 0,
  viewsCreated: 0,
});

const COUNTERS = Object.keys(noCounts()).filter((name): name is CostCounter => name in noCounts());

const isCounter = (name: string): name is CostCounter => COUNTERS.some((each) => each === name);

/** What each counter grew by from `before` to `after`. */
export function costBetween(before: Counts, after: Counts): Cost {
  const counts = noCounts();

  for (const name of COUNTERS) counts[name] = after[name] - before[name];

  return {
    ...counts,
    toStayWithin(budget) {
      const over = Object.entries(budget).flatMap(([name, most]) => {
        if (!isCounter(name))
          throw new Error(
            `${name} is not a counter the headless host keeps: it keeps ${COUNTERS.join(', ')}. ` +
              'Label redraws and input waits are counted by the renderer tests.',
          );

        return most !== undefined && counts[name] > most
          ? [`${name} ${counts[name]}, budget ${most}`]
          : [];
      });

      if (over.length)
        throw new AssertionError({
          message: `Over budget: ${over.join('; ')}`,
          actual: counts,
          expected: budget,
          operator: 'toStayWithin',
        });
    },
  };
}
