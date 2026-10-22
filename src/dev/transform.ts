import { relative } from 'node:path';
import type { Plugin } from 'rolldown';
import { componentPass, sharedKeyNames, type ComponentDefinition } from './components/index.ts';
import { render } from './edits.ts';
import {
  isAppModule,
  isJsxModule,
  isVirtualModule,
  parseModule,
  syntaxError,
  type ParsedModule,
} from './parse.ts';
import {
  outerWrapEdits,
  threadPass,
  type Placement,
  type RejectedFunction,
  type ThreadFunction,
} from './threads/index.ts';
import { inlineStylePass } from '../style/inline.ts';
import type { Diagnostic } from './compiler.ts';
import type { NativeProps } from '../style/properties.ts';
import type { Platform } from '../style/stylesheet.ts';

/** One file's placement report. */
export interface PlacementFile {
  file: string;
  entries: Placement[];
}

interface TransformOptions {
  /** The bundle's platform, for `styles()`'s `@platform` blocks. */
  platform?: Platform;
  /** Whether a file is a native module's spec, whose default export is a namespace of functions. */
  isSpec?: (path: string) => boolean;
}

export interface CompiledModule {
  code: string;
  map: ReturnType<typeof render>['map'];
  /** Whether any pass changed the module. */
  changed: boolean;
  /** The module's UI-thread functions, as a script for the UI runtime; empty for none. */
  ui: string;
  /** `ui`'s map back to the module; null for none. */
  uiMap: string | null;
  functions: ThreadFunction[];
  rejected: RejectedFunction[];
  /** What touches the UI thread's state, and where it runs (docs/placement.md). */
  placement: Placement[];
  components: ComponentDefinition[];
  styles: Record<string, NativeProps>;
  /** What compiles but likely misbehaves, by file and line. */
  warnings: Diagnostic[];
}

/**
 * Kuito's passes over one parsed module, in order: `styles()` sheets, the
 * component API, then UI-thread functions. Each reads the same program and
 * returns edits; one MagicString applies them, for one source map.
 */
function compileModule(module: ParsedModule, options: TransformOptions): CompiledModule {
  const { id } = module;
  const jsx = isJsxModule(id);
  const sheets = jsx ? inlineStylePass(module, options) : { edits: [], styles: {} };
  const components = jsx
    ? componentPass(module)
    : {
        edits: sharedKeyNames(module),
        expressions: [],
        registrations: new Map(),
        components: [],
        warnings: [],
      };
  const earlier = [...sheets.edits, ...components.edits];
  const threads = isVirtualModule(id)
    ? {
        edits: outerWrapEdits(module, components.registrations),
        ui: '',
        uiMap: null,
        functions: [],
        rejected: [],
        placement: [],
      }
    : threadPass(module, {
        expressions: components.expressions,
        outer: components.registrations,
        edits: earlier,
        isSpec: options.isSpec,
      });
  const edits = [...earlier, ...threads.edits];

  return {
    ...render(module.source, id, edits),
    changed: edits.length > 0,
    ui: threads.ui,
    uiMap: threads.uiMap,
    functions: threads.functions,
    rejected: threads.rejected,
    placement: threads.placement,
    components: components.components,
    styles: sheets.styles,
    warnings: components.warnings,
  };
}

/** `source` as the bundler compiles it: parsed (or found parsed) and passed through Kuito's passes. */
export function compileSource(
  source: string,
  id: string,
  options: TransformOptions = {},
): CompiledModule {
  const module = parseModule(id, source);
  const error = syntaxError(module);

  if (error) throw error;

  return compileModule(module, options);
}

/**
 * Bundler plugin: compiles each app module; collects each module's UI code
 * into `modules` and its warnings into `warnings`.
 */
export function createTransformPlugin({
  modules,
  warnings = new Map(),
  placements = new Map(),
  platform,
  isSpec,
}: TransformOptions & {
  modules: Map<string, { code: string; map: string | null }>;
  warnings?: Map<string, Diagnostic[]>;
  /** Each module's placement report, with the file it names. */
  placements?: Map<string, PlacementFile>;
}): Plugin {
  return {
    name: 'kuito-transform',
    transform(source: string, id: string) {
      if (!isAppModule(id)) return null;

      const compiled = compileSource(source, id, { platform, isSpec });

      if (compiled.ui) modules.set(id, { code: compiled.ui, map: compiled.uiMap });
      else modules.delete(id);

      if (compiled.warnings.length) warnings.set(id, compiled.warnings);
      else warnings.delete(id);

      if (compiled.placement.length)
        placements.set(id, { file: relative(process.cwd(), id), entries: compiled.placement });
      else placements.delete(id);

      return compiled.changed ? { code: compiled.code, map: compiled.map } : null;
    },
  };
}
