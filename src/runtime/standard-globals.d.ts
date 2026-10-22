// Standard globals as the kernel sees them on its hosts. Ambient and imported
// by no module, so only the kernel's program (tsconfig.runtime.json) declares
// them; tests that import kernel modules keep Node's types for these names.
declare global {
  var console:
    | Partial<Record<'log' | 'info' | 'debug' | 'warn' | 'error', (...values: unknown[]) => void>>
    | undefined;
}

export {};
