import { Pressable, Text } from 'kuito';
import { colors } from './theme';

/** A form's main action. */
export function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      label={title}
      alignItems="center"
      padding={14}
      borderRadius={12}
      backgroundColor={colors.accent}
      pressedScale={0.97}
      onPress={onPress}
    >
      <Text fontSize={17} fontWeight={600} color="#ffffff">
        {title}
      </Text>
    </Pressable>
  );
}
