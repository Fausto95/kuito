import { Pressable, VStack, Text, type RouteOptions, type ScreenProps } from 'kuito';
import { colors } from './_components/theme';

// A sheet that answers: present(routes.color()) resolves with the color picked.
export type Result = string;

export const options: RouteOptions = { title: 'Pick a color', presentation: 'sheet' };

const CHOICES = ['Coral', 'Teal', 'Indigo'];

export default function Color({ dismiss }: ScreenProps<{}, Result>) {
  return (
    <VStack padding={24} gap={12} backgroundColor={colors.card}>
      <Text fontSize={22} fontWeight={700} color={colors.text}>
        Pick a color
      </Text>
      {CHOICES.map((choice) => (
        <Pressable
          key={choice}
          padding={12}
          borderRadius={12}
          backgroundColor={colors.accentSoft}
          pressedOpacity={0.6}
          onPress={() => dismiss(choice)}
        >
          <Text fontSize={17} color={colors.accent}>
            {choice}
          </Text>
        </Pressable>
      ))}
    </VStack>
  );
}
