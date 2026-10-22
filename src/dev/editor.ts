// Opens a source position in the developer's editor: the LogBox's frames and
// code frames are links back to the code.

import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { projectFile } from './project-file.ts';

interface Location {
  file: string;
  line: number;
  column: number;
}

type Arguments = (at: Location) => string[];

const GOTO: Arguments = ({ file, line, column }) => ['-g', `${file}:${line}:${column}`];
const SUFFIX: Arguments = ({ file, line, column }) => [`${file}:${line}:${column}`];
const JETBRAINS: Arguments = ({ file, line, column }) => [
  '--line',
  String(line),
  '--column',
  String(column),
  file,
];

/** Graphical editors by executable name; terminal editors cannot open from a server. */
const EDITORS: Partial<Record<string, Arguments>> = {
  code: GOTO,
  'code-insiders': GOTO,
  codium: GOTO,
  cursor: GOTO,
  windsurf: GOTO,
  zed: SUFFIX,
  subl: SUFFIX,
  idea: JETBRAINS,
  webstorm: JETBRAINS,
  studio: JETBRAINS,
  fleet: JETBRAINS,
};

const executable = (editor: string) => basename(editor.trim().split(/\s+/)[0] ?? '');

/** `editor` may carry flags, like `code --new-window`. Unknown editors get the file alone. */
export function editorCommand(editor: string, at: Location) {
  const [command = editor, ...flags] = editor.trim().split(/\s+/);
  const style = EDITORS[executable(editor)];

  return { command, args: [...flags, ...(style ? style(at) : [at.file])] };
}

const isGraphical = (editor: string | undefined): editor is string =>
  !!editor && !!EDITORS[executable(editor)];

export function pickEditor(env: NodeJS.ProcessEnv): string {
  return env.KUITO_EDITOR || [env.VISUAL, env.EDITOR].find(isGraphical) || 'code';
}

/** Returns whatever the launcher does; the default resolves once the editor started. */
type Launch = (command: string, args: string[]) => unknown;

function launchDetached(command: string, args: string[]) {
  return new Promise<void>((resolveLaunch, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });

    child.once('error', reject);

    child.once('spawn', () => {
      child.unref();
      resolveLaunch();
    });
  });
}

/** `location.file` is relative to `root`; nothing outside the project opens. */
export function openInEditor(
  location: Location,
  {
    root,
    env = process.env,
    launch = launchDetached,
  }: { root: string; env?: NodeJS.ProcessEnv; launch?: Launch },
) {
  const file = projectFile(root, resolve(root, location.file));

  if (!file) throw new Error(`${location.file} is outside the project, or does not exist`);

  const { command, args } = editorCommand(pickEditor(env), { ...location, file });

  return launch(command, args);
}
