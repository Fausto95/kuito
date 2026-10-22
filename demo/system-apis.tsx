import {
  Button,
  TextField,
  HStack,
  SafeArea,
  Scroll,
  VStack,
  Text,
  signal,
  watch,
  Show,
  accessibility,
  app,
  appearance,
  brightness,
  device,
  keepAwake,
  keyboard,
  localization,
  window,
} from 'kuito';

/** Holds the screen on while it is mounted. */
function Awake() {
  keepAwake();

  return <Text color="#d0d0dc">The screen stays on</Text>;
}

/**
 * app, device, window, keyboard, accessibility, localization, appearance,
 * keepAwake and brightness, with every
 * change logged to the terminal: background the app, switch dark mode, change
 * the language or text size, and watch the values follow.
 */
export default function App() {
  const memoryWarnings = signal(0);
  const awake = signal(false);

  app.watch('memoryWarning', () => {
    console.log('app memoryWarning');
    memoryWarnings.value++;
  });

  watch(app.state, (next) => console.log('app.state', next));
  watch(appearance.colorScheme, (next) => console.log('appearance.colorScheme', next));
  watch(localization.locales, (next) => console.log('localization.locales', JSON.stringify(next)));

  console.log(
    'device',
    JSON.stringify({
      physical: device.physical,
      brand: device.brand,
      manufacturer: device.manufacturer,
      model: device.model,
      modelId: device.modelId,
      type: device.type,
      memory: device.memory,
      osName: device.osName,
      osVersion: device.osVersion,
      osBuildId: device.osBuildId,
      apiLevel: device.apiLevel,
    }),
  );

  return (
    <SafeArea flex={1} backgroundColor="#101018">
      <Scroll>
        <VStack padding={24} gap={14}>
          <Text color="#ffffff" fontSize={22} fontWeight="bold">
            System APIs
          </Text>
          <Text id="app-state" color="#d0d0dc">
            {`app ${app.state.value} · memory warnings ${memoryWarnings.value}`}
          </Text>
          <Text id="device" color="#d0d0dc">
            {`${device.model ?? device.modelId} · ${device.osName} ${device.osVersion} · ${
              device.physical ? 'device' : 'simulator'
            } · ${device.type} · ${Math.round((device.memory ?? 0) / 2 ** 30)} GB`}
          </Text>
          <Text id="appearance" color="#d0d0dc">
            {`appearance ${appearance.colorScheme.value ?? 'no preference'} · font ${appearance.fontScale.value}`}
          </Text>
          <Text id="window" color="#d0d0dc">
            {`window ${window.size.value.width}×${window.size.value.height} ${window.orientation.value}` +
              ` · insets ${window.insets.value.top}/${window.insets.value.bottom}`}
          </Text>
          <TextField id="field" placeholder="Type to show the keyboard" color="#ffffff" />
          <Text id="keyboard" color="#d0d0dc">
            {`keyboard ${keyboard.visible.value ? `${keyboard.frame.value?.height} high` : 'hidden'} · ` +
              `screen reader ${accessibility.screenReader.value ?? '…'}`}
          </Text>
          <Text id="locale" color="#d0d0dc">
            {describeLocale()}
          </Text>
          <HStack gap={12}>
            <Button id="awake" onPress={() => (awake.value = !awake.value)}>
              {awake.value ? 'Let sleep' : 'Keep awake'}
            </Button>
          </HStack>
          <Show when={awake.value}>
            <Awake />
          </Show>
          <Text id="brightness" color="#d0d0dc">
            {`brightness ${brightness.level.value?.toFixed(2) ?? '…'}${
              brightness.system.value ? ' (system)' : ' (app)'
            }`}
          </Text>
          <HStack gap={12}>
            <Button id="dim" onPress={() => (brightness.level.value = 0.1)}>
              Dim
            </Button>
            <Button id="bright" onPress={() => (brightness.level.value = 1)}>
              Bright
            </Button>
            <Button id="restore" onPress={() => void brightness.restore()}>
              Restore
            </Button>
          </HStack>
        </VStack>
      </Scroll>
    </SafeArea>
  );
}

function describeLocale() {
  const [locale] = localization.locales.value;
  const [calendar] = localization.calendars.value;

  return `${locale.languageTag} · ${locale.currencyCode ?? 'no currency'} · ${calendar.timeZone} · ${
    calendar.uses24hourClock ? '24h' : '12h'
  } · ${calendar.calendar}`;
}
