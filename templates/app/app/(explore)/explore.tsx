import { Box, List, Link, HStack, VStack, Text, routes, type RouteOptions } from 'kuito';
import { colors } from '../_components/theme';
import { TOPICS, type Topic } from '../_components/topics';

export const options: RouteOptions = { title: 'Explore' };

function TopicRow({ topic }: { topic: Topic }) {
  return (
    <Link to={routes.topic({ topic: topic.id })} pressedOpacity={0.6}>
      <HStack
        alignItems="center"
        gap={14}
        padding={16}
        borderRadius={16}
        backgroundColor={colors.card}
      >
        <Box
          width={40}
          height={40}
          borderRadius={12}
          alignItems="center"
          justifyContent="center"
          backgroundColor={colors.accentSoft}
        >
          <Text fontSize={18} fontWeight={700} color={colors.accent}>
            {topic.title.charAt(0)}
          </Text>
        </Box>
        <VStack flex={1} gap={2}>
          <Text fontSize={17} fontWeight={600} color={colors.text}>
            {topic.title}
          </Text>
          <Text fontSize={14} color={colors.muted}>
            {topic.summary}
          </Text>
        </VStack>
        <Text fontSize={22} color={colors.muted}>
          ›
        </Text>
      </HStack>
    </Link>
  );
}

export default function Explore() {
  return (
    <List
      flex={1}
      backgroundColor={colors.background}
      padding={16}
      gap={12}
      data={TOPICS}
      itemKey={(topic) => topic.id}
      renderItem={({ item }) => <TopicRow topic={item} />}
    />
  );
}
