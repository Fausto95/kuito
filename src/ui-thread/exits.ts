// A removed view's exit: the renderer keeps the view on screen while its
// props animate here, then lets it go when told `exited` (docs/motion.md).
import { isAnimation } from './animation';
import { bind, unbind } from './bindings';
import { animate } from './frames';
import { host } from './host';
import { createMotion } from './motion';
import { motionRefs, motions, pending } from './state';
import { decode } from './wire';
import { isPlainData } from '../runtime/values';

interface Track {
  prop: string;
  from: unknown;
  animation: Record<string, unknown>;
}

function track(view: number, value: unknown): Track {
  if (!isPlainData(value) || typeof value.prop !== 'string')
    throw new TypeError('Malformed exit for view ' + view);

  const animation = decode(value.animation);

  if (!isAnimation(animation)) throw new TypeError('Exit of ' + value.prop + ' needs an animation');

  const from = decode(value.from);
  const ref = typeof from === 'object' && from !== null ? motionRefs.get(from) : undefined;

  return { prop: value.prop, from: ref ? ref.value : from, animation };
}

/** Animates each track from where it is; once every one ends, the view may go. */
export function exitView(view: number, tracks: unknown[]): void {
  const parsed = tracks.map((each) => track(view, each));
  const ids = parsed.map(({ prop }) => '~exit:' + view + ':' + prop);
  let running = parsed.length;

  const release = () => {
    parsed.forEach(({ prop }, index) => {
      unbind(view, prop);
      delete motions[ids[index]];
    });

    host.__kuitoUISetProp(view, 'exited', true);
  };

  // After the frame that ends the last one has applied its props.
  const ended = () => {
    if (--running === 0) pending.afterFlush.push(release);
  };

  if (!parsed.length) return void pending.afterFlush.push(release);

  parsed.forEach(({ prop, from, animation }, index) => {
    const record = createMotion(ids[index], from, 0, true);

    bind(view, prop, () => record.ref.value);
    animate(record, { ...animation, onEnd: ended });
  });
}
