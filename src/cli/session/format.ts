import { isAbsolute, relative } from 'node:path';
import type { Diagnostic } from '../../dev/compiler.ts';
import type { FeedItem, FeedItemOf, FeedKind, LinkedDevice } from './state.ts';

// One description per feed item, shared by the Ink view (tones become theme
// colours) and the plain non-TTY output (tones are dropped).

export type Tone = 'success' | 'error' | 'warning' | 'accent' | 'muted' | 'normal';

interface DetailLine {
  text: string;
  tone?: Tone;
}

interface ItemView {
  time?: string;
  icon: string;
  tone: Tone;
  title: string;
  subject?: string;
  meta?: string;
  detail: DetailLine[];
}

export type ShortcutAction =
  | 'relaunch'
  | 'toggleLogs'
  | 'switchDevice'
  | 'clear'
  | 'devtools'
  | 'debugJS'
  | 'debugUI'
  | 'components'
  | 'record'
  | 'help'
  | 'quit';

interface Shortcut {
  key: string;
  label: string;
  action: ShortcutAction;
  help: string;
  hidden?: boolean;
}

export const SHORTCUTS: Shortcut[] = [
  {
    key: 'r',
    label: 'relaunch',
    action: 'relaunch',
    help: 'Rebuild the native app and relaunch it',
  },
  { key: 'l', label: 'logs', action: 'toggleLogs', help: 'Show or hide device logs' },
  { key: 'd', label: 'device', action: 'switchDevice', help: 'Run on another simulator or device' },
  { key: 'm', label: 'devtools', action: 'devtools', help: 'Open the devtools on the device' },
  {
    key: 'j',
    label: 'debugger',
    action: 'debugJS',
    help: 'Debug the JS thread in Chrome DevTools',
  },
  {
    key: 'k',
    label: 'components',
    action: 'components',
    help: "Open the Components panel: your app's binding graph, signal to binding to view",
  },
  {
    key: 's',
    label: 'record',
    action: 'record',
    help: "Save the app's recording: every batch it committed, for a golden test",
  },
  {
    key: 'u',
    label: 'debug UI',
    action: 'debugUI',
    help: 'Debug the UI-thread runtime in Chrome DevTools',
    hidden: true,
  },
  { key: 'c', label: 'clear', action: 'clear', help: 'Clear the screen' },
  { key: '?', label: 'help', action: 'help', help: 'Show or hide this help' },
  { key: 'q', label: 'quit', action: 'quit', help: 'Stop Kuito' },
];

const ACTIONS = new Map(SHORTCUTS.map((shortcut) => [shortcut.key, shortcut.action]));

export const shortcutAction = (key: string) => ACTIONS.get(key);

/** Visible slice of a list around `index` that fits `rows` (two rows kept for prompt and footer). */
export function pickerWindow({
  length,
  index,
  rows = 24,
}: {
  length: number;
  index: number;
  rows?: number;
}) {
  if (!length) return { start: 0, end: 0 };

  const size = Math.max(1, Math.min(length, rows - 2));
  const start = Math.min(Math.max(0, index - Math.floor(size / 2)), length - size);

  return { start, end: start + size };
}

export function formatMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;

  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatClock(at: number) {
  const date = new Date(at);

  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function shortPath(file: string, cwd: string) {
  const path = relative(cwd, file);

  return path.startsWith('..') || isAbsolute(path) ? file : path;
}

const muted = (text: string): DetailLine => ({ text, tone: 'muted' });
const RELAUNCH = muted('press r to rebuild and relaunch');

const OUTPUT_LINES = 12;
const ERROR_LINE = /error|fatal|exception|failed/i;

/**
 * The summary, then the lines that name the error; tools put the cause in
 * different places (xcodebuild near the end, Ruby/Java stacks at the top).
 */
function errorOutput(message: string): DetailLine[] {
  const [summary, ...rest] = message.split('\n');
  const lines = rest.filter((line) => line.trim());
  const named = lines.filter((line) => ERROR_LINE.test(line));
  const shown = (named.length ? named : lines).slice(0, OUTPUT_LINES);
  const hidden = lines.length - shown.length;

  return [
    { text: summary },
    ...shown.map(muted),
    ...(hidden > 0
      ? [muted(`… ${hidden} more lines · run with --verbose for the full output`)]
      : []),
  ];
}

function located({ file, line, column }: Diagnostic, cwd: string) {
  return file ? `${shortPath(file, cwd)}${line ? `:${line}:${column}` : ''}` : null;
}

// Which compiler rejected the edit, named for people rather than by plugin id.
const PLUGIN_NAMES: Partial<Record<string, string>> = {
  'kuito-transform': 'the Kuito compiler',
  'kuito-native-css': 'the CSS module compiler',
  'kuito-component-entry': 'the app entry',
};
const reportedBy = (plugin: string) =>
  muted(`reported by ${PLUGIN_NAMES[plugin] ?? `the ${plugin} plugin`}`);

/** Where the first compile error is, its frame, any others, and the compiler that reported it. */
function describeDiagnostics([first, ...others]: [Diagnostic, ...Diagnostic[]], cwd: string) {
  return {
    subject: located(first, cwd),
    detail: [
      { text: first.message },
      ...(first.frame ?? '').split('\n').filter(Boolean).map(muted),
      ...others.map((other) => ({
        text: [located(other, cwd), other.message].filter(Boolean).join(' '),
      })),
      ...(first.plugin ? [reportedBy(first.plugin)] : []),
    ],
  };
}

function describePatch(item: FeedItemOf<'patch'>, cwd: string, entry?: string): ItemView {
  const file = item.files[0] ?? entry;
  const subject = file === undefined ? undefined : shortPath(file, cwd);

  if (item.ok)
    return {
      icon: '✔',
      tone: 'success',
      title: 'patched',
      subject,
      meta:
        `rev ${item.revision} · ${formatMs(item.ms)}` +
        (item.delivered === 0 ? ' · no device connected' : ''),
      detail: [],
    };

  const [first = { message: 'Patch rejected' }, ...others] = item.diagnostics ?? [];
  const where = describeDiagnostics([first, ...others], cwd);

  return {
    icon: '✖',
    tone: 'error',
    title: 'rejected',
    subject: where.subject ?? subject,
    detail: [...where.detail, muted('previous version stays live')],
  };
}

function describeApplied(item: FeedItemOf<'applied'>, cwd: string, entry?: string): ItemView {
  const file = item.files[0] ?? entry;

  return {
    icon: '✔',
    tone: 'success',
    title: 'applied',
    subject: (file === undefined ? '' : `${shortPath(file, cwd)} → `) + item.device,
    meta: [
      `rev ${item.revision}`,
      item.latency === undefined ? null : `${formatMs(item.latency)} from save`,
      `eval ${formatMs(item.ms)}`,
    ]
      .filter(Boolean)
      .join(' · '),
    detail: [],
  };
}

/** A device's line under the feed: the last revision it acked, and how. */
export function describeDevice({ device, status, revision, latency, message }: LinkedDevice) {
  const acked = `rev ${revision ?? '?'} ${status}`;
  const views: Record<LinkedDevice['status'], { tone: Tone; state: string }> = {
    connected: { tone: 'muted', state: 'connected' },
    applied: {
      tone: 'success',
      state: latency === undefined ? acked : `${acked} · ${formatMs(latency)} from save`,
    },
    rejected: { tone: 'error', state: message ? `${acked} · ${message}` : acked },
  };

  return { icon: '●', title: device.name, ...views[status] };
}

function describeStep(
  { label, ok, ms, message, diagnostics }: FeedItemOf<'step'>,
  cwd: string,
): ItemView {
  const head: Omit<ItemView, 'detail'> = {
    icon: ok ? '✔' : '✖',
    tone: ok ? 'success' : 'error',
    title: label,
    meta: formatMs(ms),
  };

  const [first, ...others] = diagnostics ?? [];

  if (first) {
    const where = describeDiagnostics([first, ...others], cwd);

    return { ...head, ...(where.subject && { subject: where.subject }), detail: where.detail };
  }

  return { ...head, detail: message ? errorOutput(message) : [] };
}

function describeApp({ status, crash }: FeedItemOf<'app'>): ItemView {
  if (status !== 'crashed' || !crash)
    return { icon: '!', tone: 'warning', title: `app ${status}`, detail: [RELAUNCH] };

  const width = Math.max(0, ...crash.frames.map((frame) => frame.image.length));

  return {
    icon: '✖',
    tone: 'error',
    title: `${crash.process} crashed`,
    meta: [crash.exception, crash.signal].filter(Boolean).join(' · '),
    detail: [
      ...crash.messages.map((text) => ({ text })),
      ...crash.frames.map((frame) => muted(`${frame.image.padEnd(width)}  ${frame.symbol}`)),
      ...(crash.report ? [muted(`Full report: ${crash.report}`)] : []),
      RELAUNCH,
    ],
  };
}

const CONSOLE_LOOK: Partial<Record<string, { icon: string; tone: Tone }>> = {
  debug: { icon: '›', tone: 'muted' },
  warn: { icon: '▲', tone: 'warning' },
  error: { icon: '✖', tone: 'error' },
  fatal: { icon: '✖', tone: 'error' },
};

/** The first line leads; a located entry names the line that logged it. */
function describeConsole({ level, message, file, line }: FeedItemOf<'console'>): ItemView {
  const [title = '', ...rest] = message.split('\n');
  const look = CONSOLE_LOOK[level] ?? { icon: '›', tone: 'normal' };

  return {
    ...look,
    title,
    ...(file && { subject: line ? `${file}:${line}` : file }),
    detail: rest.map(muted),
  };
}

const count = (n: number, thread: string) => `${n} on the ${thread} thread`;

/** Each file's UI-thread code on one line, then each fallback where it is, with why. */
function describePlacement({ files }: FeedItemOf<'placement'>): ItemView {
  const entries = files.flatMap(({ entries: each }) => each);
  const fallbacks = entries.filter(({ reason }) => reason).length;
  const placed = entries.length - fallbacks;
  const detail = files.flatMap(({ file, entries: each }) => {
    const ui = each.filter(({ reason }) => !reason).map(({ site }) => site);

    return [
      ...(ui.length ? [{ text: `${file}  ui: ${ui.join(', ')}` }] : []),
      ...each.flatMap(({ site, line, column, reason }) =>
        reason
          ? [
              {
                text: `${file}:${line}:${column}  ${site} runs on the JS thread: it ${reason}`,
                tone: 'warning' as const,
              },
            ]
          : [],
      ),
    ];
  });

  return {
    icon: '◇',
    tone: fallbacks ? 'warning' : 'success',
    title: 'Placement',
    meta: [count(placed, 'UI'), ...(fallbacks ? [count(fallbacks, 'JS')] : [])].join(' · '),
    detail,
  };
}

type Describer<K extends FeedKind> = (
  item: FeedItemOf<K>,
  cwd: string,
  entry: string | undefined,
) => ItemView;

const DESCRIBERS: { [K in FeedKind]: Describer<K> } = {
  title: ({ device }) => ({
    icon: '◆',
    tone: 'accent',
    title: 'kuito dev',
    meta: [device.name, device.detail].filter(Boolean).join(' · '),
    detail: [],
  }),
  step: (item, cwd) => describeStep(item, cwd),
  live: ({ entry, device }, cwd) => ({
    icon: '●',
    tone: 'success',
    title: 'Live',
    subject: `${shortPath(entry, cwd)} → ${device?.name ?? 'Live Patch server'}`,
    detail: [],
  }),
  patch: (item, cwd, entry) => describePatch(item, cwd, entry),
  unchanged: ({ files }, cwd, entry) => {
    const file = files[0] ?? entry;

    return {
      icon: '·',
      tone: 'muted',
      title: 'unchanged',
      meta: [file === undefined ? null : shortPath(file, cwd), 'same output, no patch sent']
        .filter(Boolean)
        .join(' · '),
      detail: [],
    };
  },
  applied: (item, cwd, entry) => describeApplied(item, cwd, entry),
  refused: ({ device, code, message }) => ({
    icon: '✖',
    tone: 'error',
    title: `rejected on ${device}`,
    detail: [{ text: message }, muted(code), muted('previous version stays live')],
  }),
  app: (item) => describeApp(item),
  error: ({ source, message }) => ({
    icon: '✖',
    tone: 'error',
    title: `${source} error`,
    detail: [{ text: message }],
  }),
  note: ({ title, meta }) => ({
    icon: '·',
    tone: 'muted',
    title,
    ...(meta && { meta }),
    detail: [],
  }),
  log: ({ source, text }) => ({
    icon: source === 'device' ? '│' : '·',
    tone: 'muted',
    title: text,
    detail: [],
  }),
  console: (item) => describeConsole(item),
  placement: (item) => describePlacement(item),
};

function describeWith<K extends FeedKind>(item: FeedItemOf<K>, cwd: string, entry?: string) {
  const describe: Describer<K> = DESCRIBERS[item.kind];

  return describe(item, cwd, entry ?? ('entry' in item ? item.entry : undefined));
}

export function describeItem(item: FeedItem, { cwd, entry }: { cwd: string; entry?: string }) {
  const view = describeWith(item, cwd, entry);

  return item.at ? { time: formatClock(item.at), ...view } : view;
}

/** Step titles are padded so their durations form one column. */
export const STEP_COLUMN = 24;

export const columnTitle = (item: FeedItem, title: string) =>
  item.kind === 'step' ? title.padEnd(STEP_COLUMN) : title;

export function plainLines(item: FeedItem, options: { cwd: string; entry?: string }) {
  const { time, icon, title, subject, meta, detail } = describeItem(item, options);
  const head = [time, `${icon} ${columnTitle(item, title)}`, subject, meta]
    .filter(Boolean)
    .join('  ');

  return [head, ...detail.map((line) => `    ${line.text}`)];
}
