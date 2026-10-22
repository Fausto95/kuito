import { createStore } from 'zustand/vanilla';
import { createSessionState, reduceSession } from './state.ts';
import type { SessionEvent } from './state.ts';

/** The only writer of session state: events are timestamped here and reduced. */
export function createSessionStore({
  entry,
  now = Date.now,
}: {
  entry: string;
  now?: () => number;
}) {
  const store = createStore(() => createSessionState({ entry }));

  return {
    ...store,
    dispatch: (event: SessionEvent) =>
      store.setState((state) => reduceSession(state, { at: now(), ...event }), true),
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
