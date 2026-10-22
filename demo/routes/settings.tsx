import { VStack, Text, type RouteOptions } from 'kuito';

export const options: RouteOptions = { presentation: 'sheet' };

export default function Settings() {
  return (
    <VStack padding={24}>
      <Text id="settings" fontSize={20}>
        Settings
      </Text>
    </VStack>
  );
}
