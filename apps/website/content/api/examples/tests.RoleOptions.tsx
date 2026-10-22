// Find a control by role and accessible name.
import { Button, HStack } from 'kuito';
import { assert, press, render, screen, test, type RoleOptions } from 'kuito/tests';

const Player = (props: { onNext: () => void }) => (
  <HStack>
    <Button label="Previous track">⏮</Button>
    <Button label="Next track" onPress={props.onNext}>
      ⏭
    </Button>
  </HStack>
);

// Two buttons: the accessible name tells them apart, as a screen reader does.
const next: RoleOptions = { name: 'Next track' };

test('the next button skips', async () => {
  let skipped = false;

  await render(<Player onNext={() => (skipped = true)} />);
  await press(screen.getByRole('button', next));

  assert.ok(skipped);
});
