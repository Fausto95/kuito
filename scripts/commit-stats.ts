// What the shells' `KuitoCommit` log lines say (KuitoCommitStats, launched
// with commit logging): one line per batch applied on the UI thread, and a
// `KuitoCommitFrames` gauge of the frame handoff, the motion mirror and the
// JSON crossing the runtimes' boundaries (native/shared/WireWork.h).

export interface Commit {
  records: number;
  /** `__kuitoHostCommit` calls that carried the batch. */
  calls: number;
  ms: number;
  parses: number;
}

export interface CommitSummary {
  batches: number;
  records: number;
  /** Host calls per job: the most any job made, and the mean. */
  maxCalls: number;
  meanCalls: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  /** Every batch's time together: the first screen, for a run that only launches. */
  totalMs: number;
  /** The largest batch: the first render. */
  firstRenderMs: number;
  firstRenderRecords: number;
  parses: number;
}

const LINE = /KuitoCommit records=(\d+) calls=(\d+) ms=([\d.]+) parses=(\d+)/;

/** The commits a device log holds, in order. */
export function parseCommits(log: string): Commit[] {
  return log.split('\n').flatMap((line) => {
    const match = LINE.exec(line);

    return match
      ? [{ records: +match[1], calls: +match[2], ms: +match[3], parses: +match[4] }]
      : [];
  });
}

/** The value at `percent` of `sorted`, nearest rank. */
function percentile(sorted: number[], percent: number): number {
  return sorted[Math.max(0, Math.ceil((sorted.length * percent) / 100) - 1)];
}

export function summarize(commits: Commit[]): CommitSummary {
  if (!commits.length)
    throw new Error('No KuitoCommit lines: was the app launched with commit logging?');

  const ms = commits.map((commit) => commit.ms).sort((a, b) => a - b);
  const largest = commits.reduce((best, commit) => (commit.records > best.records ? commit : best));
  const sum = (pick: (commit: Commit) => number) =>
    commits.reduce((total, commit) => total + pick(commit), 0);

  return {
    batches: commits.length,
    records: sum((commit) => commit.records),
    maxCalls: Math.max(...commits.map((commit) => commit.calls)),
    meanCalls: sum((commit) => commit.calls) / commits.length,
    p50Ms: percentile(ms, 50),
    p95Ms: percentile(ms, 95),
    maxMs: ms[ms.length - 1],
    totalMs: sum((commit) => commit.ms),
    firstRenderMs: largest.ms,
    firstRenderRecords: largest.records,
    parses: sum((commit) => commit.parses),
  };
}

/** A `KuitoCommitFrames` line: at most one a second while frames run. */
export interface FrameGauge {
  /** Batches the frame handoff holds after a drain. */
  pending: number;
  /** Motion values the mirror holds. */
  mirror: number;
  /** Since launch: frames the UI runtime ran, JSON parses, and the JSON's length. */
  frames: number;
  jsonParses: number;
  bytesStringified: number;
}

export interface FrameBounds {
  samples: number;
  maxPending: number;
  maxMirror: number;
  lastMirror: number;
  /** Between the first gauge and the last; 0 when no frame ran between them. */
  jsonParsesPerFrame: number;
  bytesStringifiedPerFrame: number;
}

const FRAME_LINE =
  /KuitoCommitFrames pending=(\d+) mirror=(\d+) frames=(\d+) json=(\d+) stringified=(\d+)/;

/** The frame gauges a device log holds, in order. */
export function parseFrames(log: string): FrameGauge[] {
  return log.split('\n').flatMap((line) => {
    const match = FRAME_LINE.exec(line);

    return match
      ? [
          {
            pending: +match[1],
            mirror: +match[2],
            frames: +match[3],
            jsonParses: +match[4],
            bytesStringified: +match[5],
          },
        ]
      : [];
  });
}

/** The most each gauge reached over a run; null for a run without frames. */
export function frameBounds(gauges: FrameGauge[]): FrameBounds | null {
  if (!gauges.length) return null;

  const first = gauges[0];
  const last = gauges[gauges.length - 1];
  const frames = last.frames - first.frames;
  const perFrame = (grown: number) => (frames > 0 ? grown / frames : 0);

  return {
    samples: gauges.length,
    maxPending: Math.max(...gauges.map((gauge) => gauge.pending)),
    maxMirror: Math.max(...gauges.map((gauge) => gauge.mirror)),
    lastMirror: last.mirror,
    jsonParsesPerFrame: perFrame(last.jsonParses - first.jsonParses),
    bytesStringifiedPerFrame: perFrame(last.bytesStringified - first.bytesStringified),
  };
}
