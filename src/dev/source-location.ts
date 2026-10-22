// Source positions for compiler errors. Rolldown keeps `loc` and `frame` on
// errors thrown by plugins, and the CLI shows both next to the rejected edit.
import { lineTable } from './ast.ts';

/** 0-based character offset → 1-based line and column, for a one-off error. */
export const locate = (source: string, offset: number) => lineTable(source)(offset);

/** The line with its neighbours and a caret under `column`, in oxc's frame style. */
interface Position {
  line: number;
  column: number;
}

export function codeFrame(source: string, { line, column }: Position, context = 1) {
  const lines = source.split('\n');
  const first = Math.max(1, line - context);
  const last = Math.min(lines.length, line + context);
  const width = String(last).length;
  const frame: string[] = [];

  for (let number = first; number <= last; number++) {
    frame.push(` ${String(number).padStart(width)} | ${lines[number - 1]}`);
    if (number === line) frame.push(` ${' '.repeat(width)} : ${' '.repeat(column - 1)}^`);
  }

  return frame.join('\n');
}

export function sourceError(
  message: string,
  { file, source, start }: { file: string; source: string; start: number },
) {
  const { line, column } = locate(source, start);

  return Object.assign(new Error(message), {
    loc: { file, line, column },
    frame: codeFrame(source, { line, column }),
  });
}
