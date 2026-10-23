import type { KuitoNode } from 'kuito';
import { AsyncDemo } from './demos/async';
import { GesturesDemo } from './demos/gestures';
import { LayoutDemo } from './demos/layout';
import { ListDemo } from './demos/list';
import { MotionDemo } from './demos/motion';
import { NavigationDemo } from './demos/navigation';
import { StateDemo } from './demos/state';
import { TextDemo } from './demos/text';

export interface Topic {
  id: string;
  title: string;
  summary: string;
  detail: string;
  /** Shown live under the detail. */
  Demo: () => KuitoNode;
  /** A demo that fills the screen, like a list, instead of scrolling with it. */
  fills?: boolean;
}

export const TOPICS: Topic[] = [
  {
    id: 'layout',
    title: 'VStack, HStack and Box',
    summary: 'Flexbox layout with native views',
    detail:
      'VStack lays its children out in a column, HStack in a row, and Box is a plain view. ' +
      'Each takes flexbox and style props directly. Press the button to change justifyContent.',
    Demo: LayoutDemo,
  },
  {
    id: 'text',
    title: 'Text and Image',
    summary: 'Native labels and cached remote images',
    detail:
      'Text renders a native label. Image loads https, file and data URIs off the main thread ' +
      'and caches them; give it a size or an aspectRatio.',
    Demo: TextDemo,
  },
  {
    id: 'state',
    title: 'State',
    summary: 'Signals that update only what reads them',
    detail:
      'signal(initial) returns a signal. A component runs once; JSX that reads .value follows it, ' +
      'so writing .value updates just those views, without re-rendering the component.',
    Demo: StateDemo,
  },
  {
    id: 'motion',
    title: 'Motion',
    summary: 'Springs and timings on the UI thread',
    detail:
      'motion(initial) is a value animated next to the views. Assign spring(), timing() or ' +
      'sequence() to its .value and pass it straight to a prop such as translateX or scale.',
    Demo: MotionDemo,
  },
  {
    id: 'gestures',
    title: 'Gestures',
    summary: 'Pan, pinch, rotate and taps as values',
    detail:
      'pan(), pinch(), tap() and friends are values a view takes in gestures={[...]}. ' +
      'motion(0).follows(drag.x) moves with the finger on the UI thread, with no handler.',
    Demo: GesturesDemo,
  },
  {
    id: 'async',
    title: 'Async',
    summary: 'Resources and tasks with cancellation',
    detail:
      'resource() loads data when the screen mounts and exposes pending, data and error ' +
      'signals; task() runs on demand. Leaving the screen cancels the work in flight.',
    Demo: AsyncDemo,
  },
  {
    id: 'lists',
    title: 'List',
    summary: 'Virtualized by the platform',
    detail:
      'List takes data, renderItem and itemKey, as in React Native. The native list ' +
      'owns scrolling and recycling, so scrolling never waits for JavaScript.',
    Demo: ListDemo,
    fills: true,
  },
  {
    id: 'navigation',
    title: 'Navigation',
    summary: 'Native stacks and tabs, typed routes',
    detail:
      'Routes are files in app/ (file routes) or <Route> components in app.tsx (component ' +
      'routes), and the tab bar is a layout or <Tabs>. Link and navigate() move between ' +
      'routes, and present() waits for the result a screen dismisses with.',
    Demo: NavigationDemo,
  },
];
