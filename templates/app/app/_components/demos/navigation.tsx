import { Pressable, VStack, Text, goBack, navigate, present, routes, signal } from 'kuito';
import { colors } from '../theme';

export function NavigationDemo() {
  const picked = signal('nothing yet');

  const pick = async () => {
    picked.value = (await present(routes.color())) ?? 'nothing: you closed the sheet';
  };

  const actions = [
    { label: 'Push another topic', run: () => navigate(routes.topic({ topic: 'motion' })) },
    { label: 'Open the About sheet', run: () => navigate(routes.about()) },
    { label: 'Pick a color in a sheet', run: () => void pick() },
    { label: 'Switch to the Home tab', run: () => navigate(routes.index()) },
    { label: 'Go back', run: () => goBack() },
  ];

  return (
    <VStack gap={8}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          padding={12}
          borderRadius={12}
          backgroundColor={colors.accentSoft}
          pressedOpacity={0.6}
          onPress={action.run}
        >
          <Text fontSize={16} fontWeight={600} color={colors.accent}>
            {action.label}
          </Text>
        </Pressable>
      ))}
      <Text fontSize={15} color={colors.muted}>{`Picked: ${picked.value}`}</Text>
    </VStack>
  );
}
