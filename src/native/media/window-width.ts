// The window's metrics, which styles that follow its width and
// `window.widthClass` read (docs/styles.md#conditions): the style compiler
// calls this from a stylesheet whose queries name the width.
import Window from '../../../native/modules/window/window';

export function provideWindowWidth(): void {
  if (!globalThis.__kuito)
    throw new Error('Styles that follow the system require the Kuito runtime');

  globalThis.__kuito.provideMedia({ windowMetrics: Window.metrics });
}
