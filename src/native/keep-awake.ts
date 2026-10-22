import KeepAwake from '../../native/modules/keep-awake/keep-awake';
import { owned, report, type ScopeOptions } from './scope';

let holds = 0;

/**
 * Keeps the screen on while the calling component is mounted
 * (docs/keep-awake.md), or for the app's life with `{ scope: app }`. Returns
 * the function that lets the screen sleep sooner. Each call holds the screen
 * on its own, so one releasing doesn't let it sleep under another.
 */
export function keepAwake(options: ScopeOptions = {}): () => void {
  const hold = () => {
    const tag = 'kuito.keepAwake.' + ++holds;
    let held = false;

    const start = () => {
      held = true;
      KeepAwake.activate(tag).catch(report('keepAwake() could not keep the screen on'));

      return release;
    };
    const release = () => {
      if (!held) return;

      held = false;
      KeepAwake.deactivate(tag).catch(report('keepAwake() could not let the screen sleep'));
    };

    return { start, release };
  };

  return owned('keepAwake', options, hold, ({ start }) => start()).release;
}
