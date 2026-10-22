import { Pressable, HStack, VStack, Text, type RouteOptions, type ScreenProps } from 'kuito';

/** What present(routes.rate({ show })) resolves with: the stars picked. */
export type Result = number;

export type Params = { show: string };

export const options: RouteOptions<Params> = { presentation: 'sheet' };

export default function Rate({ show, dismiss }: ScreenProps<Params, Result>) {
  return (
    <VStack padding={24} gap={16}>
      <Text fontSize={20} fontWeight={600}>{`Rate ${show}`}</Text>
      <HStack gap={12}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <Pressable key={stars} id={`stars-${stars}`} onPress={() => dismiss(stars)}>
            <Text fontSize={28}>{String(stars)}</Text>
          </Pressable>
        ))}
      </HStack>
    </VStack>
  );
}
