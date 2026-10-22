// The onboarding pager on the headless host: what Next, Skip and a swipe
// show, and the dots that follow the pager's offset.
import { assert, press, render, screen, scroll, test } from 'kuito/tests';
import Onboarding from './onboarding-pager';

const dots = (name: string) => screen.getByRole('progressbar', { name });

// The headless window is an iPhone 18 Pro's, 402 points wide.
const WIDTH = 402;

test('Next turns to the second page', async () => {
  await render(<Onboarding />);

  await press(screen.getByText('Next'));

  const title = screen.getByText('Sync your library');

  assert.ok(title.windowFrame.x > 0 && title.windowFrame.x < WIDTH, 'its title is on screen');
  assert.ok(dots('Page 2 of 3'));
});

test('a swipe to the last page lights its dot and offers Get started', async () => {
  await render(<Onboarding />);

  await scroll(screen.getByText('Welcome'), { x: 2 * WIDTH });

  assert.deepEqual(
    dots('Page 3 of 3').children.map((dot) => dot.frame.width),
    [8, 8, 24],
  );

  await press(screen.getByText('Get started'));

  assert.ok(screen.getByText('Enjoy the show'));
});

test('Skip jumps to the last page', async () => {
  await render(<Onboarding />);

  await press(screen.getByText('Skip'));

  assert.ok(dots('Page 3 of 3'));
  assert.ok(screen.getByText('Get started'));
  assert.equal(screen.queryByText('Skip')?.parent?.props.disabled, true, 'Skip is spent');
});
