// Supply a font face to a layout test.
import { HStack, Text } from 'kuito';
import { assert, render, screen, test, type FontFace } from 'kuito/tests';

// A monospaced face: every glyph 10 points wide at 17 points.
const mono: FontFace = {
  family: 'Menlo',
  weight: 400,
  size: 17,
  lineHeight: 20,
  advances: {},
  fallback: 10,
};

test('an 8-character code is 80 points wide', async () => {
  // In a row, the label is as wide as its text.
  await render(
    <HStack>
      <Text fontFamily="Menlo">AB12CD34</Text>
    </HStack>,
    { fonts: { faces: [mono] } },
  );

  assert.equal(screen.getByText('AB12CD34').frame.width, 80);
});
