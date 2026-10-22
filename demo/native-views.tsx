import { Button, HStack, SafeArea, VStack, Text, signal, Slider } from 'kuito';

/** A view a native module contributes: props update it, its events arrive, flexbox sizes it. */
export default function App() {
  const volume = signal(0.25);
  const released = signal(0);
  const locked = signal(false);

  return (
    <SafeArea flex={1} backgroundColor="#101018">
      <VStack padding={24} gap={20}>
        <Text id="title" color="#ffffff" fontSize={22} fontWeight="bold">
          Native views
        </Text>
        <HStack gap={12}>
          <Text color="#d0d0dc" width={64}>
            Volume
          </Text>
          <Slider
            id="volume"
            flex={1}
            height={40}
            value={volume}
            step={0.05}
            disabled={locked.value}
            fillColor="#f5c518"
            trackColor="#3a3a48"
            onChangeEnd={() => {
              released.value++;
            }}
          />
        </HStack>
        <Text id="value" color="#d0d0dc">
          {`value ${volume.value.toFixed(2)} · released ${released.value}×`}
        </Text>
        <HStack gap={12}>
          <Button
            id="reset"
            onPress={() => {
              volume.value = 0.75;
            }}
          >
            Set to 0.75
          </Button>
          <Button
            id="lock"
            onPress={() => {
              locked.value = !locked.value;
            }}
          >
            {locked.value ? 'Unlock' : 'Lock'}
          </Button>
        </HStack>
        <Slider id="half" width="50%" height={40} value={0.5} />
      </VStack>
    </SafeArea>
  );
}
