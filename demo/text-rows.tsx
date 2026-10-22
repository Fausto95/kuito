import { HStack, SafeArea, Scroll, Text, VStack, onCleanup, signal } from 'kuito';

const ROWS = Array.from({ length: 100 }, (_, index) => index + 1);

/**
 * The text layout benchmark (docs/performance.md#text-layout): 200 labels
 * in rows too narrow for them, so each shrinks to its share and the engine
 * asks for its min-content width. Every second every label's text changes,
 * so every pass measures all 200 again.
 */
export default function TextRows() {
  const tick = signal(0);
  const timer = setInterval(() => tick.value++, 1000);

  onCleanup(() => clearInterval(timer));

  return (
    <SafeArea flex={1} backgroundColor="#ffffff">
      <Scroll flex={1}>
        <VStack padding={12} gap={8}>
          {ROWS.map((row) => (
            <HStack gap={8}>
              <Text fontSize={15} color="#111111">
                {`Episode ${row}: a title long enough to wrap, take ${tick.value}`}
              </Text>
              <Text fontSize={13} color="#6e6e73">
                {`Season ${row % 7} · aired ${tick.value % 60} minutes past the hour`}
              </Text>
            </HStack>
          ))}
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
