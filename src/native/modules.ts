// Types a native module's members share (src/native/define-module.ts,
// docs/native-modules.md).

/** What crosses the host boundary as data: JSON values, checked again at run time. */
export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

/** What a module function's arguments and results hold: JSON values and ArrayBuffers (docs/native-modules.md#bytes). */
export type ModuleData =
  | string
  | number
  | boolean
  | null
  | ArrayBuffer
  | readonly ModuleData[]
  | { readonly [key: string]: ModuleData | undefined };

export interface EventSubscription {
  remove(): void;
}
