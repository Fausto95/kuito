import { Scroll, VStack, Text, type RouteOptions, type ScreenProps } from 'kuito';
import { Card } from '../../_components/card';
import { colors } from '../../_components/theme';
import { TOPICS } from '../../_components/topics';

const topicOf = (id: string) => TOPICS.find((topic) => topic.id === id);

// /explore is routes.explore already: this one is routes.topic({ topic }).
export const name = 'topic';

export type Params = { topic: string };

export const options: RouteOptions<Params> = {
  title: ({ topic }) => topicOf(topic)?.title ?? 'Topic',
};

export default function TopicScreen(props: ScreenProps<Params>) {
  const topic = topicOf(props.topic);

  if (!topic)
    return (
      <VStack padding={20}>
        <Text fontSize={17} color={colors.text}>{`There is no topic named ${props.topic}.`}</Text>
      </VStack>
    );

  const { Demo } = topic;
  const detail = (
    <Text fontSize={17} lineHeight={24} color={colors.text}>
      {topic.detail}
    </Text>
  );

  // A list scrolls itself, so it fills the screen instead of scrolling inside another view.
  if (topic.fills)
    return (
      <VStack flex={1} padding={20} gap={16} backgroundColor={colors.background}>
        {detail}
        <Demo />
      </VStack>
    );

  return (
    <Scroll flex={1} backgroundColor={colors.background}>
      <VStack padding={20} gap={16}>
        {detail}
        <Card title="Try it">
          <Demo />
        </Card>
      </VStack>
    </Scroll>
  );
}
