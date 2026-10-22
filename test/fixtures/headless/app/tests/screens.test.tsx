// Run by test/headless.test.ts through `kuito test`: the API an app's tests use.
import {
  advance,
  assert,
  choose,
  press,
  render,
  screen,
  scroll,
  test,
  type,
  within,
} from 'kuito/tests';
import {
  Album,
  Announcer,
  Badge,
  Counter,
  Due,
  Episode,
  Feed,
  Frosted,
  Logo,
  Plan,
  Size,
  Fetched,
  Form,
  Long,
  Notes,
  Paste,
} from '../screens';

test('press reaches onPress through the Pressable the text is in', async () => {
  const app = await render(<Counter />);

  await press(screen.getByText('Add'));
  await press(screen.getByRole('button', { name: 'Add' }));

  assert.ok(screen.getByText('Count: 2'));
  assert.equal(screen.getByRole('heading').text, 'Counter');

  // The count's text is the UI thread's to write; the batches built the views.
  assert.ok(app.mutations.some((m) => m.op === 'create' && m.kind === 'Pressable'));
});

test('a long press holds past the delay instead', async () => {
  await render(<Counter />);
  await press(screen.getByText('Hold'), { long: true });

  assert.ok(screen.getByText('Count: 100'));
});

test('frames come from the layout engine', async () => {
  const app = await render(<Counter />);
  const [add, hold] = screen.getAllByRole('button');

  // Without a font table, a glyph is half its size wide and a line 1.2 times it.
  assert.deepEqual(add?.frame, { x: 0, y: 0, width: 176, height: 40.666664123535156 });
  assert.equal(hold?.frame.x, 186);

  assert.deepEqual(screen.getByText('Add').windowFrame, {
    x: 30,
    y: 67,
    width: 156,
    height: 20.66666603088379,
  });

  assert.match(app.tree(), /^\d+ VStack in 0 0\.0,0\.0 402\.0x146\.3 layout-only$/m);
});

test('within scopes a query to a view', async () => {
  await render(<Counter />);

  const row = screen.getByText('Add').parent?.parent;

  assert.ok(row);
  assert.equal(within(row).getAllByRole('button').length, 2);
  assert.equal(within(row).queryByText('Counter'), null);
  assert.throws(() => within(row).getByText('Counter'), /No view shows the text Counter/);
});

test('type reports each character, and a Toggle flips', async () => {
  await render(<Form />);

  await type(screen.getByRole('textbox'), 'Ada');
  await press(screen.getByRole('switch'));

  assert.ok(screen.getByText('Hello, Ada'));
  assert.ok(screen.getByText('On'));
});

test('a field with lines grows with what is typed, up to its maximum', async () => {
  await render(<Notes />);

  const height = (name: string) => screen.getByRole('textbox', { name }).frame.height;
  const line = height('Note');
  const near = (actual: number, lines: number) =>
    assert.ok(Math.abs(actual - lines * line) < 1, `${actual} is ${lines} lines of ${line}`);

  near(height('Summary'), 2);

  await type(screen.getByRole('textbox', { name: 'Note' }), 'one\ntwo');

  assert.ok(screen.getByText('Note: 2 lines'));
  near(height('Note'), 2);

  await type(screen.getByRole('textbox', { name: 'Note' }), '\nthree\nfour');

  assert.ok(screen.getByText('Note: 4 lines'));
  near(height('Note'), 3);
});

test('a list binds the rows near its viewport, and more as it scrolls', async () => {
  await render(<Feed />);

  assert.ok(screen.getByText('Row 0'));
  assert.equal(screen.queryByText('Row 59'), null);

  await scroll(screen.getByText('Row 0'), { y: 2000 });

  assert.ok(screen.getByText('Row 59'));
  assert.ok(screen.getByText('Ended 1'));
});

test('a Scroll reports where it is scrolled to', async () => {
  await render(<Long />);
  await scroll(screen.getByText('At 0'), { y: 300 });

  assert.ok(screen.getByText('At 300'));
});

test('native modules answer from the test’s fakes', async () => {
  const app = await render(<Paste />, {
    modules: { Clipboard: { readText: async () => 'copied' } },
  });

  await press(screen.getByText('Paste'));

  assert.ok(screen.getByText('Pasted: copied'));

  assert.deepEqual(
    app.calls.map((call) => `${call.module}.${call.name}`),
    ['Clipboard.readText'],
  );
});

test('requests reach the test’s fetch', async () => {
  const urls: string[] = [];

  await render(<Fetched />, {
    fetch: (request) => {
      urls.push(request.url);

      return { body: 'Hello from the server' };
    },
  });

  assert.ok(screen.getByText('Hello from the server'));
  assert.deepEqual(urls, ['https://example.test/greeting']);
});

test('time moves only as the test advances it', async () => {
  await render(<Counter />);

  const before = Date.now();

  await advance(60_000);

  assert.ok(Date.now() - before < 10_000);
});

test('choose picks what a DatePicker shows and keeps the rest, within its bounds', async () => {
  await render(<Due />);

  const due = screen.getByRole('button', { name: 'Due' });

  await choose(due, new Date(2026, 11, 24));

  assert.ok(screen.getByText('Due: 2026-12-24 14:30'), 'a day keeps the time');

  await choose(screen.getByRole('button', { name: 'At' }), new Date(2030, 0, 1, 7, 15));

  assert.ok(screen.getByText('Due: 2026-12-24 7:15'), 'a time keeps the day');

  await assert.rejects(choose(due, new Date(2026, 9, 20)), /before its min/);
  await choose(screen.getByRole('button', { name: 'Locked' }), new Date(2027, 0, 1));

  assert.ok(screen.getByText('Due: 2026-12-24 7:15'), 'a disabled picker takes no touch');

  await choose(due, new Date(2026, 9, 21));

  assert.ok(screen.getByText('Due: 2026-10-21 9:0'), "min's day at 7:15 is moved to its 9:00");
});

test('choose picks an option of a Select by the label it shows', async () => {
  await render(<Size />);

  const size = screen.getByRole('combobox', { name: 'Size' });

  await choose(size, 'Large');

  assert.ok(screen.getByText('Size: l'));

  await assert.rejects(choose(size, 'Huge'), /has no option Huge: it has Small, Medium, Large/);
  await choose(screen.getByRole('combobox', { name: 'Fixed' }), 'Small');

  assert.ok(screen.getByText('Size: l'), 'a disabled select takes no touch');
});

test('choose picks a segment of a SegmentedControl by its label', async () => {
  await render(<Plan />);

  const view = screen.getByRole('radiogroup', { name: 'View' });

  await choose(view, 'Month');

  assert.ok(screen.getByText('View: month'));

  await assert.rejects(choose(view, 'Year'), /has no option Year: it has Day, Week, Month/);
  await choose(screen.getByRole('radiogroup', { name: 'Fixed' }), 'Day');

  assert.ok(screen.getByText('View: month'), 'a disabled control takes no touch');
});

test('choose picks an item of the ContextMenu a view is in by its label', async () => {
  await render(<Episode />);

  const episode = screen.getByText('Episode 4');

  await choose(episode, 'Delete');

  assert.ok(screen.getByText('Last: delete'));

  await assert.rejects(
    choose(episode, 'Mark played'),
    /Mark played is disabled: a user cannot pick it/,
  );

  await assert.rejects(
    choose(episode, 'Rename'),
    /has no item Rename: it has Share, Mark played, Delete/,
  );

  await choose(screen.getByText('Episode 5'), 'Share');

  assert.ok(screen.getByText('Last: delete'), 'a disabled menu does not open');
});

test('a Pager shows a page a whole width each and follows the page the user swipes to', async () => {
  await render(<Album />);

  const pager = screen.getByText('First photo');
  const page = (text: string) => screen.getByText(text).parent?.frame;
  const width = page('First photo')?.width ?? 0;

  assert.equal(width, 402, "a page is as wide as the pager, the iPhone 18 Pro's screen");

  assert.equal(
    page('Third photo')?.height,
    screen.getByText('Third photo').parent?.parent?.frame.height,
    'and as tall',
  );

  await scroll(pager, { x: 2 * width });

  assert.ok(screen.getByText('Page: 2'));
  assert.ok(screen.getByText('Paged: 2'));

  await scroll(pager, { x: width * 0.6 });

  assert.ok(screen.getByText('Page: 1'), 'a drag comes to rest on the nearest page');
  assert.ok(screen.getByText('Paged: 2, 1'));
});

test("a Pager scrolls to the app's page and reports only the user's", async () => {
  const app = await render(<Album />);
  const before = app.mutations.length;

  await press(screen.getByText('Last'));

  assert.ok(screen.getByText('Page: 2'));
  assert.ok(screen.getByText('Paged: none'), "the app's own page is no page change");

  assert.deepEqual(
    app.mutations
      .slice(before)
      .filter((m) => m.op === 'prop' && m.name === 'scrollTo')
      .map((m) => (m.op === 'prop' ? JSON.stringify(m.value) : '')),
    [JSON.stringify({ page: 2, animated: true, request: 1 })],
  );
});

test('a Blur lays its children out inside it', async () => {
  await render(<Frosted />);

  const title = screen.getByText('Now playing');

  assert.equal(title.parent?.kind, 'module:Blur');
  assert.equal(title.frame.x, 12, 'inside its padding');
});

test('a Drawing is an image whose shapes follow the signals they read', async () => {
  const app = await render(<Logo />);
  const logo = screen.getByRole('img', { name: 'Logo' });
  const drawn = () =>
    app.mutations
      .filter((m) => m.op === 'prop' && m.id === logo.id && m.name === 'shapes')
      .map((m) => (m.op === 'prop' ? JSON.stringify(m.value) : ''));

  assert.equal(drawn().length, 1);
  assert.match(drawn()[0], /M60 50A10 10 0 1 1 40 50/);
  assert.match(drawn()[0], /#ff0000ff/);

  await press(screen.getByText('Grow'));

  assert.equal(drawn().length, 2);
  assert.match(drawn()[1], /M70 50A20 20 0 1 1 30 50/);
});

test("a Drawing draws its src's shapes in its viewBox, then its children", async () => {
  const app = await render(<Badge />);
  const badge = screen.getByRole('img', { name: 'Done' });
  const sent = (name: string) =>
    app.mutations.flatMap((m) =>
      m.op === 'prop' && m.id === badge.id && m.name === name ? [String(m.value)] : [],
    );

  assert.deepEqual(sent('viewBox'), ['[0,0,24,24]']);
  assert.match(sent('shapes')[0], /"d":"M4 12l5 5L20 6".*"d":"M23 12A11 11/);
});

test('a custom event a child dispatches bubbles to its parent', async () => {
  await render(<Announcer />);

  await press(screen.getByText('Announce'));
  assert.ok(screen.getByText('Heard: 1'));
});
