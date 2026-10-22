// Plain output for one-shot commands (doctor, devices, build, logs). Named
// ANSI colours follow the terminal theme, so they stay readable on light and
// dark backgrounds alike.

const enabled = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, text: string) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : text);
const accent = (text: string) => paint('36', text);
const green = (text: string) => paint('32', text);
const yellow = (text: string) => paint('33', text);
const red = (text: string) => paint('31', text);

export const dim = (text: string) => paint('2', text);
export const bold = (text: string) => paint('1', text);

export type Out = (line: string) => void;

export function banner(out: Out = console.log) {
  out('');
  out(`  ${accent('◆')} ${bold('kuito')}  ${dim('native, without the ceremony')}`);
  out('');
}

export function step(label: string, detail = '', out: Out = console.log) {
  out(`  ${accent('◇')} ${label}${detail ? '  ' + dim(detail) : ''}`);
}

export function check(ok: boolean, label: string, fix: string, out: Out = console.log) {
  out(`  ${ok ? green('✔') : yellow('○')} ${label}${ok ? '' : dim(`  ${fix}`)}`);
}

export function warn(label: string, out: Out = console.log) {
  out(`  ${yellow('!')} ${label}`);
}

export function problem(label: string, out: Out = console.error) {
  out(`  ${red('✖')} ${label}`);
}

/** Spinner on interactive terminals, a single line elsewhere; reports duration when done. */
export async function task<T>(
  label: string,
  detail: string,
  operation: () => Promise<T>,
  out: Out = console.log,
): Promise<T> {
  const tty = Boolean(process.stdout.isTTY && !process.env.CI);
  const frames = ['◐', '◓', '◑', '◒'];
  const started = Date.now();
  const line = (frame: string) => `\x1b[2K\r  ${accent(frame)} ${label}  ${dim(detail)}`;

  if (!tty) step(label, detail, out);

  let count = 0;
  const timer = tty
    ? setInterval(() => process.stdout.write(line(frames[++count % frames.length])), 90)
    : null;

  if (tty) process.stdout.write(line(frames[0]));

  const finish = () => {
    if (timer) clearInterval(timer);
    if (tty) process.stdout.write('\x1b[2K\r');
  };

  try {
    const value = await operation();

    finish();
    out(`  ${green('✔')} ${label}  ${dim(`${((Date.now() - started) / 1000).toFixed(1)}s`)}`);

    return value;
  } catch (error) {
    finish();
    problem(`${label} failed`, out);

    throw error;
  }
}
