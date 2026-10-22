import { VStack, Text, type RouteOptions } from 'kuito';
import { colors } from './_components/theme';

// Outside the tab groups, so it belongs to no tab: a sheet over everything.
export const options: RouteOptions = { title: 'About', presentation: 'sheet' };

export default function About() {
  return (
    <VStack padding={24} gap={12} backgroundColor={colors.card}>
      <Text fontSize={22} fontWeight={700} color={colors.text}>
        Built with Kuito
      </Text>
      <Text fontSize={16} lineHeight={22} color={colors.muted}>
        Your TypeScript runs on Hermes and drives real UIKit and Android views. Save any file in
        app/ while kuito dev runs and the app updates in place. Swipe down to close this sheet.
      </Text>
    </VStack>
  );
}
