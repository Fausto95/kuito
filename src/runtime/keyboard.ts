// The keyboard the native side tracks, for `keyboard` (src/native/keyboard.ts).
// Avoidance runs natively; these events are for app logic, not for layout.
import { hostCommand } from './host';
import { queueOperation } from './operations';
import type { MotionHandle } from './state/motion';
import { system } from './state/system';
import { platformMotion } from './motion-values';
import { notify, subscribe, type Subscription } from './system';
import { own, type PlainData } from './values';

/** The keyboard's frame on screen, in points. */
export interface KeyboardFrame {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
}

/** The event names `keyboard.watch` takes and the native event each one listens to. */
const EVENTS: Readonly<Record<string, string>> = Object.freeze({
  willShow: 'willshow',
  didShow: 'didshow',
  willHide: 'willhide',
  didHide: 'didhide',
  willChangeFrame: 'willchangeframe',
  didChangeFrame: 'didchangeframe',
});

const TYPES = Object.keys(EVENTS).map((name) => EVENTS[name]);

function number(payload: PlainData, key: string): number {
  const value = payload[key];

  if (typeof value !== 'number' || !Number.isFinite(value))
    throw TypeError('Invalid keyboard event: ' + key + ' must be a number');

  return value;
}

/** A native keyboard event; the frame is where the keyboard ends up. */
export function keyboardEvent(type: string, payload: PlainData): unknown {
  // A move the UI thread did not take: this thread's copy follows it.
  if (type === 'move') return system.keyboardHeight?.set(number(payload, 'height'));

  if (TYPES.indexOf(type) === -1) throw Error('Unknown app event: keyboard.' + type);

  const frame: KeyboardFrame = Object.freeze({
    screenX: number(payload, 'screenX'),
    screenY: number(payload, 'screenY'),
    width: number(payload, 'width'),
    height: number(payload, 'height'),
  });

  if (type === 'didshow' || (type === 'didchangeframe' && system.keyboard)) system.keyboard = frame;

  if (type === 'didhide') system.keyboard = null;

  // The UI thread moved its own copy from the same event (src/ui-thread/keyboard.ts).
  system.keyboardFrame?.set(system.keyboard);

  notify('keyboard.' + type, {
    frame,
    duration: number(payload, 'duration'),
    easing: typeof payload.easing === 'string' ? payload.easing : 'keyboard',
  });

  return undefined;
}

/** keyboard.frame: the UI thread moves it from the keyboard's own events, as this thread does. */
function frameMotion() {
  system.keyboardFrame ??= platformMotion('keyboard', 'keyboard.frame', (record) =>
    queueOperation({ op: 'keyboard', id: record.id, value: system.keyboard }),
  );

  return system.keyboardFrame;
}

/**
 * keyboard.height: the platform sends it every frame it moves once the app
 * reads or binds it, and the UI thread writes it from those moves.
 */
function heightMotion() {
  system.keyboardHeight ??= platformMotion(
    'keyboard.height',
    'keyboard.height',
    (record) => {
      queueOperation({ op: 'linked', id: record.id, value: record.value });
      queueOperation({ op: 'handler', key: '0.keyboard.move', motion: { height: record.id } });
      hostCommand(0, 'keyboard.motion', 'on');
    },
    system.keyboard?.height ?? 0,
  );

  return system.keyboardHeight;
}

export const keyboard = Object.freeze({
  /** keyboard.frame, as a motion value; null while hidden. */
  frameMotion(): MotionHandle {
    return frameMotion().handle;
  },
  /** keyboard.height, as a motion value; 0 while hidden. */
  heightMotion(): MotionHandle {
    return heightMotion().handle;
  },
  dismiss(): void {
    hostCommand(0, 'keyboard.dismiss');
  },
  addListener(name: string, listener: unknown): Subscription {
    if (!own(EVENTS, name))
      throw Error(
        'Unknown keyboard event "' + name + '". Use one of: ' + Object.keys(EVENTS).join(', '),
      );

    return subscribe('keyboard.' + EVENTS[name], listener);
  },
  /** The shown keyboard's frame, the same object until the next change; null while hidden. */
  frame(): KeyboardFrame | null {
    return system.keyboard;
  },
});
