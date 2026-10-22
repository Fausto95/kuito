// The routes the hand-written Router fixtures declare, as an app that writes
// its <Router> by hand types them (docs/navigation.md#routes-in-jsx).
import type { RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo<{}>;
    about: RouteTo<{}>;
    show: RouteTo<{ id: number }>;
    library: RouteTo<{}>;
    settings: RouteTo<{}>;
    compose: RouteTo<{}>;
    player: RouteTo<{}>;
    night: RouteTo<{}>;
    photo: RouteTo<{}>;
    picker: RouteTo<{ from: string }, string>;
    details: RouteTo<{}, number>;
    next: RouteTo<{}>;
  }
}
