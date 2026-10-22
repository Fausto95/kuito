import { Text, VStack } from 'kuito';
import { assert, render, screen, test, type FontTable } from 'kuito/tests';

// Regular and bold faces of the system font, as a device measured them.
const fonts: FontTable = {
  faces: [
    { weight: 400, size: 17, lineHeight: 22, advances: { ' ': 4.3 }, fallback: 9.5 },
    { weight: 700, size: 17, lineHeight: 22, advances: { ' ': 4.5 }, fallback: 10.2 },
  ],
};

test('a bold title wraps onto two lines', async () => {
  await render(
    <VStack width={160}>
      <Text fontWeight="bold">Weekly summary report</Text>
    </VStack>,
    { fonts },
  );

  assert.equal(screen.getByText('Weekly summary report').frame.height, 44);
});
