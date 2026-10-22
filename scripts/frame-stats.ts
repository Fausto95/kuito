/** Frame statistics from `dumpsys gfxinfo <package>`, in milliseconds. */
export interface FrameStats {
  frames: number;
  janky: number;
  jankPercent: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface SectionTotal {
  count: number;
  totalMs: number;
  maxMs: number;
}

function field(text: string, pattern: RegExp, name: string) {
  const match = text.match(pattern);

  if (!match?.[1]) throw Error(`gfxinfo has no "${name}" line; is the app running and drawing?`);

  return Number(match[1]);
}

/** The summary gfxinfo keeps since its last reset; framestats only keeps 120 frames. */
export function parseGfxinfo(text: string): FrameStats {
  const percentile = (n: number) =>
    field(text, new RegExp(`^${n}th percentile: (\\d+)ms`, 'm'), `${n}th percentile`);

  return {
    frames: field(text, /^Total frames rendered: (\d+)/m, 'Total frames rendered'),
    janky: field(text, /^Janky frames: (\d+)/m, 'Janky frames'),
    jankPercent: field(text, /^Janky frames: \d+ \(([\d.]+)%\)/m, 'Janky frames'),
    p50: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
  };
}

const markLine =
  /^\s*\S+-(\d+)\s+\(\s*(\d+)\).*?\s([\d.]+): tracing_mark_write: ([BE])\|(\d+)(?:\|(.*))?$/;

/**
 * Time per section name on the process's main thread (tid == pid) from
 * atrace text. Trailing frame numbers are dropped so every
 * `Choreographer#doFrame N` adds to one row.
 */
export function traceSections(text: string, pid: number): Map<string, SectionTotal> {
  const open: { name: string; start: number }[] = [];
  const totals = new Map<string, SectionTotal>();

  for (const line of text.split('\n')) {
    const match = markLine.exec(line);

    if (!match || Number(match[1]) !== pid || Number(match[5]) !== pid) continue;

    const time = Number(match[3]) * 1000;

    if (match[4] === 'B') {
      open.push({ name: sectionName(match[6] ?? ''), start: time });
      continue;
    }

    const section = open.pop();

    if (!section) continue;

    const ms = time - section.start;
    const total = totals.get(section.name) ?? { count: 0, totalMs: 0, maxMs: 0 };

    totals.set(section.name, {
      count: total.count + 1,
      totalMs: round(total.totalMs + ms),
      maxMs: round(Math.max(total.maxMs, ms)),
    });
  }

  return totals;
}

/** `Choreographer#doFrame 123` and `… - resynced to 125 in 20ms` are one row each. */
function sectionName(raw: string) {
  return raw.replace(/ - resynced to \d+ in [\d.]+ms$/, ' (resynced)').replace(/\s+\d+$/, '');
}

/** The main thread's own time per frame, in ms; waiting for RenderThread is not its work. */
export interface UiFrames {
  frames: number;
  /** Frames whose own time exceeds a 60 Hz frame. */
  slowPercent: number;
  p50: number;
  p90: number;
  maxMs: number;
  totalMs: number;
}

export function uiFrames(text: string, pid: number): UiFrames {
  const open: { name: string; start: number }[] = [];
  const own: number[] = [];
  let waited = 0;

  for (const line of text.split('\n')) {
    const match = markLine.exec(line);

    if (!match || Number(match[1]) !== pid || Number(match[5]) !== pid) continue;

    const time = Number(match[3]) * 1000;

    if (match[4] === 'B') {
      open.push({ name: match[6] ?? '', start: time });
      continue;
    }

    const section = open.pop();

    if (!section) continue;

    if (section.name === 'postAndWait') waited += time - section.start;

    if (open.length > 0) continue;

    if (section.name.startsWith('Choreographer#doFrame'))
      own.push(round(time - section.start - waited));

    waited = 0;
  }

  const sorted = [...own].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
  const slow = own.filter((ms) => ms > 1000 / 60).length;

  return {
    frames: own.length,
    slowPercent: own.length ? round((slow / own.length) * 100) : 0,
    p50: rank(50),
    p90: rank(90),
    maxMs: sorted.at(-1) ?? 0,
    totalMs: round(own.reduce((sum, ms) => sum + ms, 0)),
  };
}

/** A cold start, in ms: when the content landed and what evaluating scripts cost. */
export interface LaunchTimeline {
  /** From the process's first traced event to the end of its largest `Kuito commit`. */
  contentMs: number;
  evaluates: number;
  /** `Kuito evaluate` on the Hermes thread, wall time: preemption counts. */
  evaluateMs: number;
  /**
   * The modules a script loaded while it ran, by URL, in order: nested
   * `Kuito evaluate <url>` sections, part of their script's evaluateMs.
   */
  modules: string[];
}

const eventLine = /^\s*.+?-(\d+)\s+\(\s*(\d+)\)\s.*?\s([\d.]+): /;

/**
 * The largest commit is the content: on Reel, the catalog's rows. A commit
 * the size of the first screen lands earlier; the catalog is what users wait for.
 */
export function launchTimeline(text: string, pid: number): LaunchTimeline {
  const open = new Map<number, { name: string; start: number }[]>();
  let started: number | undefined;
  let content = { rows: -1, end: 0 };
  let evaluates = 0;
  let evaluateMs = 0;
  const modules: string[] = [];

  for (const line of text.split('\n')) {
    const event = eventLine.exec(line);

    if (!event || Number(event[2]) !== pid) continue;

    started ??= Number(event[3]) * 1000;

    const match = markLine.exec(line);

    if (!match || Number(match[5]) !== pid) continue;

    const thread = Number(match[1]);
    const time = Number(match[3]) * 1000;
    const stack = open.get(thread) ?? [];

    open.set(thread, stack);

    if (match[4] === 'B') {
      stack.push({ name: match[6] ?? '', start: time });
      continue;
    }

    const section = stack.pop();
    const rows = /^Kuito commit (\d+)$/.exec(section?.name ?? '')?.[1];

    if (rows && Number(rows) > content.rows) content = { rows: Number(rows), end: time };

    if (section?.name === 'Kuito evaluate') {
      evaluates++;
      evaluateMs += time - section.start;
    } else if (section?.name.startsWith('Kuito evaluate ')) {
      modules.push(section.name.slice('Kuito evaluate '.length));
    }
  }

  if (started === undefined || content.rows < 0)
    throw Error(`The trace has no Kuito commit from pid ${pid}; did the app render?`);

  return {
    contentMs: round(content.end - started),
    evaluates,
    evaluateMs: round(evaluateMs),
    modules,
  };
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function round(ms: number) {
  return Math.round(ms * 1000) / 1000;
}
