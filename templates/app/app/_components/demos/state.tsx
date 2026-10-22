import { TextField, VStack, Toggle, HStack, Text, signal } from 'kuito';
import { colors } from '../theme';

export function StateDemo() {
  const name = signal('');
  const loud = signal(false);
  // A function, called in JSX, so the text follows both signals: a component body runs once.
  const greeting = () => {
    const text = `Hello, ${name.value.trim() || 'stranger'}`;

    return loud.value ? text.toUpperCase() + '!' : text;
  };

  return (
    <VStack gap={12}>
      <TextField
        value={name}
        placeholder="Your name"
        padding={12}
        borderRadius={10}
        backgroundColor={colors.accentSoft}
      />
      <HStack alignItems="center" justifyContent="space-between">
        <Text fontSize={16} color={colors.text}>
          Shout
        </Text>
        <Toggle checked={loud} />
      </HStack>
      <Text fontSize={22} fontWeight={700} color={colors.accent}>
        {greeting()}
      </Text>
    </VStack>
  );
}
