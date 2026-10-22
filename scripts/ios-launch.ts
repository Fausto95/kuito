import type { LaunchTimeline } from './frame-stats.ts';

interface LogEvent {
  time: number;
  signpost?: { name: string; type: string; detail: string };
}

/** `2026-10-18 17:06:01.597889+0200`, in ms since the epoch with microseconds kept. */
function parseTime(timestamp: string) {
  const match = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)\.(\d+)([+-]\d\d)(\d\d)$/.exec(timestamp);

  if (!match) throw Error(`Unexpected log timestamp ${timestamp}`);

  const [, day, time, fraction = '0', hours, minutes] = match;

  return Date.parse(`${day}T${time}${hours}:${minutes}`) + Number(`0.${fraction}`) * 1000;
}

function parseEvents(text: string): LogEvent[] {
  return text.split('\n').flatMap((line) => {
    if (!line.startsWith('{')) return [];

    const event: unknown = JSON.parse(line);

    if (typeof event !== 'object' || event === null) return [];

    const field = (name: string) => {
      const value: unknown = Reflect.get(event, name);

      return typeof value === 'string' ? value : '';
    };
    const time = parseTime(field('timestamp'));

    if (field('eventType') !== 'signpostEvent' || field('subsystem') !== 'dev.kuito.shell')
      return [{ time }];

    return [
      {
        time,
        signpost: {
          name: field('signpostName'),
          type: field('signpostType'),
          detail: field('eventMessage'),
        },
      },
    ];
  });
}

/**
 * The iOS counterpart of `launchTimeline`, from `log stream --signpost --style
 * ndjson` filtered to the app's process: KuitoTrace.swift marks the same
 * `Kuito evaluate` and `Kuito commit <mutations>` intervals as Android. The
 * process's first log event stands for its start.
 */
export function iosLaunchTimeline(text: string): LaunchTimeline {
  const events = parseEvents(text);
  const open = new Map<string, { start: number; detail: string }[]>();
  let content = { rows: -1, end: 0 };
  let evaluates = 0;
  let evaluateMs = 0;
  const modules: string[] = [];

  for (const { time, signpost } of events) {
    if (!signpost) continue;

    const stack = open.get(signpost.name) ?? [];

    open.set(signpost.name, stack);

    if (signpost.type === 'begin') {
      stack.push({ start: time, detail: signpost.detail });
      continue;
    }

    const interval = stack.pop();

    if (!interval) continue;

    if (signpost.name === 'Kuito commit' && Number(interval.detail) > content.rows)
      content = { rows: Number(interval.detail), end: time };

    // A script's interval has no detail; a module it loaded names its URL.
    if (signpost.name === 'Kuito evaluate' && interval.detail) modules.push(interval.detail);
    else if (signpost.name === 'Kuito evaluate') {
      evaluates++;
      evaluateMs += time - interval.start;
    }
  }

  const started = events[0]?.time;

  if (started === undefined || content.rows < 0)
    throw Error('The log has no Kuito commit from the app; did it render?');

  return {
    contentMs: round(content.end - started),
    evaluates,
    evaluateMs: round(evaluateMs),
    modules,
  };
}

function round(ms: number) {
  return Math.round(ms * 1000) / 1000;
}
