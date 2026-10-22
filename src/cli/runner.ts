import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

export type OutputStream = 'stdout' | 'stderr';

export type LineHandler = (line: string, stream: OutputStream) => void;

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  quiet?: boolean;
  onLine?: LineHandler | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Written to the command's stdin: a secret given there stays out of its argv. */
  input?: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

export interface Runner {
  run(bin: string, args?: readonly string[], options?: RunOptions): Promise<RunResult>;
}

type SpawnImpl = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

const tail = (text: string) => text.trim().slice(-2400);

/** A command that failed: its exit code or signal, and what it printed on each stream. */
export class CommandError extends Error {
  code: number | NodeJS.Signals | null;
  stdout: string;
  stderr: string;

  constructor(
    bin: string,
    args: readonly string[],
    code: number | NodeJS.Signals | null,
    { stdout, stderr, reason = `failed (${code})` }: RunResult & { reason?: string },
  ) {
    super(
      [`${bin} ${args.join(' ')} ${reason}`, tail(stderr), tail(stdout)].filter(Boolean).join('\n'),
    );

    this.name = 'CommandError';
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/** How long a process gets to exit after SIGTERM before it is killed. */
const GRACE_MS = 3000;

const exited = (child: ChildProcess) => child.exitCode != null || child.signalCode != null;

/**
 * Stops `child`: SIGTERM, then SIGKILL if it outlives `graceMs`. `group`
 * signals its whole process group, for a detached child that starts its own
 * (the Android emulator and its QEMU). Resolves once it has exited.
 */
export function terminate(
  child: ChildProcess,
  { graceMs = GRACE_MS, group = false }: { graceMs?: number; group?: boolean } = {},
): Promise<void> {
  if (exited(child)) return Promise.resolve();

  const { pid } = child;
  const send = (signal: NodeJS.Signals) => {
    try {
      if (group && pid !== undefined) process.kill(-pid, signal);
      else child.kill(signal);
    } catch {
      // Already gone between the check and the signal.
    }
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => send('SIGKILL'), graceMs);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    send('SIGTERM');
  });
}

/** Errors thrown by the CLI's own code are Errors; anything else is wrapped so it has a message. */
export const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** spawn() could not find the executable. */
export const isMissingExecutable = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/** One shell-free subprocess runner shared by discovery/build/launch. */
export function createRunner({
  spawnImpl = spawn,
  graceMs = GRACE_MS,
}: { spawnImpl?: SpawnImpl; graceMs?: number } = {}): Runner {
  return {
    run(
      bin,
      args = [],
      { cwd, env, quiet = true, onLine, timeoutMs = 180_000, signal, input } = {},
    ) {
      return new Promise((resolve, reject) => {
        let done = false;
        let timedOut = false;
        let stdout = '',
          stderr = '';
        const child = spawnImpl(bin, args, {
          cwd,
          env: { ...process.env, ...env },
          stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
          signal,
        });

        if (input !== undefined) child.stdin?.end(input);

        const stop = () => void terminate(child, { graceMs });
        const timer =
          timeoutMs > 0
            ? setTimeout(() => {
                timedOut = true;
                stop();
              }, timeoutMs)
            : null;

        // spawn() sends SIGTERM on abort; this makes sure it ends.
        signal?.addEventListener('abort', stop, { once: true });

        const streams = [
          ['stdout', child.stdout],
          ['stderr', child.stderr],
        ] as const;

        for (const [type, stream] of streams) {
          let buffered = '';

          stream?.on('data', (data: Buffer) => {
            const text = data.toString();

            if (type === 'stdout') stdout += text;
            else stderr += text;

            if (!quiet) {
              buffered += text;

              const lines = buffered.split(/\r?\n|\r/g);

              buffered = lines.pop() ?? '';
              for (const line of lines) if (line.trim()) onLine?.(line, type);
            }
          });
        }

        const settle = (error: Error | null, result: RunResult = { stdout, stderr }) => {
          if (done) return;
          done = true;
          if (timer) clearTimeout(timer);
          signal?.removeEventListener('abort', stop);

          if (error) reject(error);
          else resolve(result);
        };

        child.on('error', settle);

        child.on('close', (code, sig) =>
          code === 0
            ? settle(null, { stdout, stderr })
            : settle(
                new CommandError(bin, args, code ?? sig, {
                  stdout,
                  stderr,
                  reason: timedOut ? `timed out after ${timeoutMs / 1000}s` : undefined,
                }),
              ),
        );
      });
    },
  };
}

export async function hasTool(runner: Runner, binary: string): Promise<boolean> {
  try {
    await runner.run(process.platform === 'win32' ? 'where' : 'which', [binary], {
      timeoutMs: 5000,
    });

    return true;
  } catch {
    return false;
  }
}
