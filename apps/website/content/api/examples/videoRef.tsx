// Seek a lesson video back to the beginning.
import { Button, Video, VStack, videoRef } from 'kuito';

export function Lesson() {
  const player = videoRef();
  return (
    <VStack flex={1}>
      <Video ref={player} src={{ uri: 'https://example.com/lesson.mp4' }} height={240} controls />
      <Button onPress={() => void player.current?.seek(0).catch(console.error)}>
        Restart lesson
      </Button>
    </VStack>
  );
}
