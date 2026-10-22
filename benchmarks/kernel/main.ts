// The benchmark script a host evaluates after the kernel: it reads its options
// from `__kuitoBenchOptions` (JSON), times with `__kuitoBenchNow`
// (milliseconds) and hands its results, or its error, to `__kuitoBenchReport`.
import { runCases, type KernelGlobals } from './cases';

declare const __kuitoBenchOptions: string;
declare const __kuitoBenchNow: () => number;
declare const __kuitoBenchReport: (json: string) => void;

const host = globalThis as unknown as KernelGlobals;
const options: { rounds?: number; only?: string; scale?: number } = JSON.parse(__kuitoBenchOptions);

runCases(host, __kuitoBenchNow, options).then(
  (results) => __kuitoBenchReport(JSON.stringify({ results })),
  (error: unknown) =>
    __kuitoBenchReport(
      JSON.stringify({
        error: error instanceof Error ? error.stack || error.message : String(error),
      }),
    ),
);
