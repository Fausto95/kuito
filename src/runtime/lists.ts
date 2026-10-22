// Rows of native lists (docs/lists.md). The native list owns its cells and
// decides which key each one shows; a row renders into its cell as a module
// of its own whose root is the ListCell view, so a recycled cell is re-bound
// by the ordinary patch diff instead of being created again.
import { safeDispose } from './lifecycle';
import { dispose, patch } from './patch';
import type { PatchApi } from './registration';
import { releaseHooks } from './hooks';
import type { CachedInstance, HookSlot } from './state/components';
import { modules } from './state/modules';
import { lists, type CellRecord } from './state/views';
import { remember } from './transaction';
import { dict, isFunction, own } from './values';

/**
 * Another item takes over a cell: its components start fresh (state, mount
 * hooks and tasks), while the cell's native views stay to be re-bound.
 */
function resetInstances(moduleId: string): void {
  if (!own(modules, moduleId)) return;

  const module = modules[moduleId];

  module.lifecycleRecords.forEach(safeDispose);
  module.asyncRecords.forEach(safeDispose);
  module.lifecycleRecords = [];
  module.asyncRecords = [];
  releaseHooks(moduleId, module.hooks);
  module.hooks = dict<HookSlot>();
  module.instances = dict<CachedInstance>();
}

/**
 * Render the row `key` into `cell`, a ListCell under `list`, or nothing when
 * `render` is null. A row is reactive: the signals `render` reads re-render
 * it, so a cell already showing `key` needs nothing.
 */
export function renderCell(list: unknown, cell: unknown, key: unknown, render: unknown): void {
  if (
    typeof list !== 'string' ||
    !list ||
    typeof cell !== 'string' ||
    !cell ||
    typeof key !== 'string' ||
    (render !== null && !isFunction(render))
  )
    throw new TypeError('renderCell expects (listId, cellId, key, render or null)');

  const cells = own(lists, list) ? lists[list] : dict<CellRecord>();
  const record = own(cells, cell) ? cells[cell] : null;
  const shown = render !== null;

  if (record && record.key === key && record.shown === shown) return;

  if (record && record.key !== key) resetInstances(cell);

  patch(
    cell,
    (api: PatchApi) =>
      api.render({
        type: 'ListCell',
        props: { id: cell, cellKey: key, children: shown ? render : null },
      }),
    { parent: list, reevaluate: true },
  );

  cells[cell] = { key, shown };
  lists[list] = cells;
}

/** The cells of `list` that show a row, and the key each one shows. */
export function boundCells(list: unknown): { cell: string; key: string }[] {
  if (typeof list !== 'string' || !own(lists, list)) return [];

  const cells = lists[list];

  return Object.keys(cells).map((cell) => ({ cell, key: cells[cell].key }));
}

/** A list leaves the screen: its rows and cells go first, deepest views first. */
export function releaseCells(list: string): void {
  if (!own(lists, list)) return;

  const cells = lists[list];

  remember(lists, list);
  delete lists[list];
  Object.keys(cells).forEach((cell) => dispose(cell));
}
