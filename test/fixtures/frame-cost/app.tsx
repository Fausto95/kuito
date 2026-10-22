import { HStack, Pressable, Text, TextField, VStack, signal } from 'kuito';

// The interactions test/frame-cost.test.ts budgets: a tap that changes only
// paint (S1), one label's text among 100, typing (S5), and idle (S6).

const LABELS = Array.from({ length: 100 }, (_, index) => 'Label ' + index);

export default function App() {
  const liked = signal(false);
  const renamed = signal(0);
  const draft = signal('');

  return (
    <VStack>
      <HStack>
        <Pressable
          id="like"
          backgroundColor={liked.value ? '#e50914' : '#202024'}
          onPress={() => (liked.value = !liked.value)}
        >
          <Text>Like</Text>
        </Pressable>
        <Pressable id="rename" onPress={() => renamed.value++}>
          <Text>Rename</Text>
        </Pressable>
      </HStack>
      <TextField id="draft" value={draft.value} onChange={(text) => (draft.value = text)} />
      <VStack>
        {LABELS.map((label, index) => (
          <Text>{index === 50 && renamed.value > 0 ? 'Renamed ' + renamed.value : label}</Text>
        ))}
      </VStack>
    </VStack>
  );
}
