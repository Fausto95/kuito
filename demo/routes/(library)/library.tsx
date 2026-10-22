import { VStack, Text, type RouteOptions } from 'kuito';

export const options: RouteOptions = { title: 'Library' };

export default function Library() {
  return (
    <VStack padding={16}>
      <Text id="library" fontSize={20}>
        Your library
      </Text>
    </VStack>
  );
}
