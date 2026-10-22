// `kuito help`, written from the tables that parsing, the session and doctor
// read: a command, option or shortcut cannot exist without showing here.
import { COMMAND_TABLE, OPTION_TABLE } from './config.ts';
import { GRADLE, JDK, NODE } from './requirements.ts';
import { SHORTCUTS } from './session/format.ts';

const WIDTH = 76;
const INDENT = '    ';

/** `text` broken into lines of at most `width`, at spaces. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }

  return [...lines, line];
}

/** Two columns: each term padded to the widest, its description wrapped beside it. */
function columns(rows: readonly (readonly [string, string])[]): string[] {
  const left = Math.max(...rows.map(([term]) => term.length)) + 2;

  return rows.flatMap(([term, description]) =>
    wrap(description, WIDTH - INDENT.length - left).map(
      (line, index) => INDENT + (index === 0 ? term : '').padEnd(left) + line,
    ),
  );
}

const section = (title: string, lines: string[]) => [`  ${title}`, ...lines, ''];

const usage = columns([
  ['kuito', 'Pick a device, build, launch and Live Patch'],
  ...COMMAND_TABLE.map(({ usage, summary }) => [`kuito ${usage}`, summary] as const),
]);

const options = columns(
  OPTION_TABLE.map((option) => [
    option.flags.join(', ') + ('placeholder' in option ? ` ${option.placeholder}` : ''),
    option.help,
  ]),
);

// All of them: `hidden` only keeps a shortcut off the session's bar.
const shortcuts = columns(SHORTCUTS.map(({ key, label, help }) => [`${key} ${label}`, help]));

const examples = [
  'kuito create MyApp',
  'kuito module create Battery',
  'kuito dev ios',
  'kuito dev android --device Pixel_9',
  'kuito dev ios --env staging',
  'kuito build android',
  'kuito build ios --profile release',
  'kuito doctor',
].map((example) => INDENT + example);

const requirements = wrap(
  `Requirements: Node.js ${NODE}+. iOS needs macOS, Xcode and XcodeGen; Android needs ` +
    `the SDK platform-tools and emulator, JDK ${JDK} and Gradle ${GRADLE}. ` +
    '`kuito doctor` checks them.',
  WIDTH - 2,
).map((line) => `  ${line}`);

export const HELP = [
  '',
  '  ◆ kuito  native, without the ceremony',
  '',
  ...section('Usage', usage),
  ...section('Options', options),
  ...section('While running', shortcuts),
  ...section('Examples', examples),
  ...requirements,
  '',
].join('\n');
