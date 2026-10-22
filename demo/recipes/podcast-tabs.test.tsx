// The podcast tabs on the headless host: links, the header a screen asks
// for, and the deep links that open each tab, screen and the modal.
import { assert, press, render, screen, test, type TestView } from 'kuito/tests';
import App from './podcast-tabs';

/** The native view of `kind` a view shows in. */
function around(view: TestView, kind: string): TestView {
  for (let at = view.parent; at; at = at.parent) if (at.kind === kind) return at;

  throw new Error(`${view.kind} ${view.id} is in no ${kind}`);
}

/** The screen a view shows in, which holds its title and header. */
const screenOf = (view: TestView) => around(view, 'NavigationScreen');

/** The title of the tab selected in the tab bar `view` is under. */
function selectedTab(view: TestView): unknown {
  const tabs = around(view, 'NavigationTabs');

  return tabs.children[Number(tabs.props.selectedIndex)]?.props.title;
}

test('the podcasts screen has a large title, Sort, Add and a search field', async () => {
  await render(<App />);

  const podcasts = screenOf(screen.getByText('Hardcore History'));

  assert.equal(podcasts.props.title, 'Podcasts');
  assert.equal(podcasts.props.largeTitle, true);
  assert.deepEqual(podcasts.props.search, { placeholder: 'Your podcasts' });

  assert.deepEqual(podcasts.props.headerItems, [
    { label: 'Sort', placement: 'leading' },
    { label: 'Add', icon: { ios: 'plus', android: 'add' }, placement: 'trailing' },
  ]);
});

test('a podcast pushes its screen, and Play next queues it in the other tab', async () => {
  await render(<App />);

  await press(screen.getByText('Song Exploder'));

  assert.equal(screenOf(screen.getByText('Play next')).props.title, 'Song Exploder');

  await press(screen.getByText('Play next'));

  assert.equal(selectedTab(screen.getByText('Queued: Song Exploder')), 'Up Next');
});

// The Router's navigation state, like the app's module state, lasts for the
// file, as for an app's life: each link goes from where the last one left it.
// A link the app launched with goes the same way once the Router mounts.
test('links open a podcast, the other tab, the modal and the first screen', async () => {
  const app = await render(<App />);
  const open = (url: string) => app.emit('Linking', 'url', url);

  await open('kuito://podcast/2');
  assert.equal(screenOf(screen.getByText('Play next')).props.title, '99% Invisible');

  await open('kuito://up-next');
  assert.equal(selectedTab(screen.getByText('Play next')), 'Up Next');

  await open('kuito://add');
  assert.equal(screenOf(screen.getByText('Follow Radiolab')).props.title, 'Add a podcast');

  await press(screen.getByText('Follow Radiolab'));
  assert.equal(screen.queryByText('Follow Radiolab'), null, 'the modal closed');

  await open('kuito://');
  assert.equal(selectedTab(screen.getByText('Radiolab')), 'Listen', 'popped to its first screen');
});
