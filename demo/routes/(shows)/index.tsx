import { Box, Link, HStack, VStack, Text, routes, signal, type RouteOptions } from 'kuito';
import { COLORS, SHOWS } from '../_shows';

export const options: RouteOptions = { title: 'Shows' };

export default function Shows() {
  const opens = signal(0);

  return (
    <VStack gap={12} padding={16}>
      <Text fontSize={13} color="#8e8e93">{`${opens.value} opened`}</Text>
      {SHOWS.map((name, index) => (
        <Link
          key={name}
          id={`show-${index}`}
          to={routes.show({ id: index })}
          onPressStart={() => opens.value++}
        >
          <HStack gap={12} alignItems="center">
            <Box
              sharedId={`poster-${index}`}
              width={32}
              height={48}
              borderRadius={6}
              backgroundColor={COLORS[index]}
            />
            <Text fontSize={20}>{name}</Text>
          </HStack>
        </Link>
      ))}
      <Link id="to-settings" to={routes.settings()}>
        <Text fontSize={17} color="#0a84ff">
          Settings
        </Text>
      </Link>
    </VStack>
  );
}
