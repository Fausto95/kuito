// Crash summaries share one shape across platforms.
// Apple .ips crash reports: a one-line JSON header followed by a JSON body.

interface CrashFrame {
  image: string;
  symbol: string;
}

export interface Crash {
  pid: number | undefined;
  process: string;
  exception: string | undefined;
  signal: string | undefined;
  messages: string[];
  frames: CrashFrame[];
  report?: string;
}

/** The parts of an .ips body this summary reads. */
interface IpsBody {
  pid?: number;
  procName?: string;
  exception?: { type?: string; signal?: string };
  asi?: Record<string, string[]>;
  faultingThread?: number;
  threads?: {
    triggered?: boolean;
    frames?: { imageIndex: number; imageOffset: number; symbol?: string }[];
  }[];
  usedImages?: { name?: string }[];
}

interface LogcatLine {
  pid: number;
  tag: string;
  message: string;
}

const FRAME_LIMIT = 8;
const UNNAMED_PROCESS = 'The app';

/** `simctl launch` prints `<bundle id>: <pid>`. */
export function parseLaunchPid(stdout: string): number | null {
  const match = /:\s*(\d+)\s*$/.exec(stdout.trim());

  return match ? Number(match[1]) : null;
}

export function summarizeCrashReport(text: string): Crash {
  let body: IpsBody;

  try {
    body = JSON.parse(text.slice(text.indexOf('\n') + 1));
  } catch {
    throw new Error('Not an Apple crash report (.ips)');
  }

  const thread =
    (body.faultingThread === undefined ? undefined : body.threads?.[body.faultingThread]) ??
    body.threads?.find((t) => t.triggered);
  const images = body.usedImages ?? [];

  return {
    pid: body.pid,
    process: body.procName ?? UNNAMED_PROCESS,
    exception: body.exception?.type,
    signal: body.exception?.signal,
    messages: Object.values(body.asi ?? {}).flat(),
    frames: (thread?.frames ?? []).slice(0, FRAME_LIMIT).map((frame) => ({
      image: images[frame.imageIndex]?.name ?? '???',
      symbol: frame.symbol ?? `+${frame.imageOffset}`,
    })),
  };
}

// `logcat -v threadtime`: date time pid tid level tag: message
const LOGCAT_LINE = /^\S+\s+\S+\s+(\d+)\s+\d+\s+[VDIWEF]\s+(.*?)\s*: (.*)$/;

function parseLogcat(text: string): LogcatLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => LOGCAT_LINE.exec(line))
    .filter((match) => match !== null)
    .map(([, pid, tag, message]) => ({ pid: Number(pid), tag, message }));
}

function javaCrash(lines: LogcatLine[], pid: number, fallbackProcess: string): Crash | null {
  const own = lines
    .filter((line) => line.pid === pid && line.tag === 'AndroidRuntime')
    .map((line) => line.message);
  const start = own.findLastIndex((message) => message.startsWith('FATAL EXCEPTION'));

  if (start < 0) return null;

  const block = own.slice(start + 1);
  const named = /^Process: (.+?), PID:/.exec(block[0] ?? '');
  const [header = '', ...rest] = named ? block.slice(1) : block;
  const [exception, ...detail] = header.split(': ');
  const frames: CrashFrame[] = [];

  for (const message of rest) {
    const frame = /^\s*at (.+)\((.*)\)$/.exec(message);

    if (!frame) break;
    if (frames.length < FRAME_LIMIT) frames.push({ image: frame[2], symbol: frame[1] });
  }

  return {
    pid,
    process: named?.[1] ?? fallbackProcess,
    exception,
    signal: undefined,
    messages: [
      ...(detail.length ? [detail.join(': ')] : []),
      ...block.filter((message) => message.startsWith('Caused by: ')),
    ],
    frames,
  };
}

// debuggerd writes the tombstone from its own pid; its header names the crashed pid.
function nativeCrash(lines: LogcatLine[], pid: number, fallbackProcess: string): Crash | null {
  const header = lines.find(
    (line) => line.tag === 'DEBUG' && line.message.startsWith(`pid: ${pid},`),
  );

  if (!header) {
    const fatal = lines.find(
      (line) => line.pid === pid && /^Fatal signal \d+ \(\w+\)/.test(line.message),
    );

    if (!fatal) return null;

    const [, number, name] = /^Fatal signal (\d+) \((\w+)\)/.exec(fatal.message) ?? [];

    return {
      pid,
      process: fallbackProcess,
      exception: name,
      signal: `signal ${number}`,
      messages: [],
      frames: [],
    };
  }

  const block = lines
    .filter((line) => line.tag === 'DEBUG' && line.pid === header.pid)
    .map((line) => line.message);
  const [, number, name] =
    /^signal (\d+) \((\w+)\)/.exec(block.find((message) => message.startsWith('signal ')) ?? '') ??
    [];
  const frames = block
    .flatMap((message) => {
      const frame = /^\s*#\d+ pc ([0-9a-f]+)\s+(\S+)(.*)$/.exec(message);

      if (!frame) return [];

      const symbol = frame[3].replace(/\s*\(BuildId: [0-9a-f]+\)\s*$/, '').trim();

      return [
        {
          image: frame[2].slice(frame[2].lastIndexOf('/') + 1),
          symbol: symbol.startsWith('(') ? symbol.slice(1, -1) : `pc ${frame[1]}`,
        },
      ];
    })
    .slice(0, FRAME_LIMIT);

  return {
    pid,
    process: />>> (.+?) <<</.exec(header.message)?.[1] ?? fallbackProcess,
    exception: name,
    signal: number && `signal ${number}`,
    messages: block.flatMap((message) => /^Abort message: '(.*)'$/.exec(message)?.slice(1) ?? []),
    frames,
  };
}

/** Summarize `adb logcat -b crash -v threadtime` for one pid; null when it holds no crash for it. */
export function summarizeAndroidCrash(
  text: string,
  { pid, process = UNNAMED_PROCESS }: { pid: number; process?: string },
): Crash | null {
  const lines = parseLogcat(text);

  return javaCrash(lines, pid, process) ?? nativeCrash(lines, pid, process);
}

export function formatCrash({ process, exception, signal, messages, frames, report }: Crash) {
  const cause = [exception, signal].filter(Boolean).join(' · ');
  const width = Math.max(0, ...frames.map((frame) => frame.image.length));

  return [
    `${process} crashed${cause ? ` (${cause})` : ''}`,
    ...messages.map((message) => `    ${message}`),
    ...frames.map((frame) => `    ${frame.image.padEnd(width)}  ${frame.symbol}`),
    ...(report ? [`    Full report: ${report}`] : []),
  ].join('\n');
}
