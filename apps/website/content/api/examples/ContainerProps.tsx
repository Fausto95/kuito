import { Text, VStack, type ContainerProps } from 'kuito';

// A card is a container with the app's look; callers lay out and fill it.
function Card(props: ContainerProps) {
  return <VStack padding={16} borderRadius={12} backgroundColor="#ffffff" gap={8} {...props} />;
}

<Card marginTop={12}>
  <Text>Storage</Text>
  <Text>2.1 GB of 5 GB used</Text>
</Card>;
