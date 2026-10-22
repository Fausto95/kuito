// The motion values, transitions and exits each view's props animate with.
import type { AnimationSpec } from '../animation-specs';
import type { Effect } from '../effects';
import type { MotionHandle } from './motion';

/**
 * The motion value each animated prop runs on, by view and prop: a prop's
 * animations and transitions all move one value, so each continues from
 * where the last one was.
 */
export const propMotions = new Map<number, Record<string, MotionHandle>>();
/** Each view's transition, as specs by group (`opacity`, `backgroundColor`, `transform`, `all`). */
export const viewTransitions = new Map<number, Record<string, AnimationSpec>>();
/** Each view's exit effect, which plays on the UI thread once the view is removed. */
export const viewExits = new Map<number, Effect>();
/** Whether the kernel listens for the motion preference, which the UI thread honors. */
export const motionPreference = { followed: false };
