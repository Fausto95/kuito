// Gesture tags and ids, which native relations and motion values name.

/**
 * Each view's gestures' tags, by view and then gesture kind, unique in the
 * app: native relations name gestures by tag. A view's tags go with it.
 */
export const gestureTags = new Map<number, Record<string, number>>();
export const gestureCount = { next: 0 };
/** Each gesture value's id, which a view's handler and the motion values following it name. */
export const gestureIds = new WeakMap<object, number>();
export const gestureIdCount = { next: 0 };
