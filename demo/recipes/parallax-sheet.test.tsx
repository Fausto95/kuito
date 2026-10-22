// The parallax sheet on the headless host: opening and closing it, and the
// header and blurred bar that follow its scroll.
import { assert, press, render, screen, scroll, test, within } from 'kuito/tests';
import ParallaxSheet from './parallax-sheet';

const open = () => press(screen.getByText('Severance: see every episode'));

test('the sheet opens on its episodes and Done closes it', async () => {
  await render(<ParallaxSheet />);

  assert.equal(screen.queryByText('Episode 1'), null, 'a closed sheet shows nothing');

  await open();

  assert.ok(screen.getByRole('heading', { name: 'Severance' }));
  assert.ok(screen.getByText('Episode 12'));

  await press(screen.getByText('Done'));

  assert.equal(screen.queryByText('Episode 1'), null);
});

test('the bar fades in once the header scrolls away, which moves at half speed', async () => {
  await render(<ParallaxSheet />);
  await open();

  const bar = within(screen.getByRole('toolbar'));
  const art = () => screen.getByRole('img', { name: 'Severance key art' });

  assert.equal(bar.getByText('Severance').props.opacity, 0);
  assert.equal(art().props.translateY, 0);

  await scroll(screen.getByText('Episode 1'), { y: 240 });

  assert.equal(bar.getByText('Severance').props.opacity, 1);
  assert.equal(art().props.translateY, 120);
});
