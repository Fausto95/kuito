import { Pressable, Text, VStack, styles } from 'kuito';

function explode(reason: string): never {
  throw new Error('boom: ' + reason);
}

// Clear of the status bar, so a tap on a simulator reaches the button.
const sheet = styles({ screen: { paddingTop: '200px' } });

/** An app whose button throws, for crash reports (docs/crash-reports.md). */
export default function App() {
  return (
    <VStack class={sheet.screen}>
      <Pressable id="crash" label="Crash" onPress={() => explode('pressed')}>
        <Text>Crash</Text>
      </Pressable>
    </VStack>
  );
}
