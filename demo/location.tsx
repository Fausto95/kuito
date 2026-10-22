import {
  Pressable,
  HStack,
  SafeArea,
  Scroll,
  VStack,
  Text,
  onCleanup,
  signal,
  Show,
  location,
  permissions,
  type EventSubscription,
  type LocationObject,
} from 'kuito';

const describe = (fix: LocationObject) =>
  `${fix.coords.latitude.toFixed(5)}, ${fix.coords.longitude.toFixed(5)} ±${Math.round(fix.coords.accuracy ?? -1)} m` +
  (fix.mocked ? ' (mocked)' : '');

const failure = (error: unknown) => String((error as { message?: string }).message ?? error);

/** The mounted screen's view of the task; none in a headless runtime. */
let showTracked: ((text: string) => void) | null = null;

// At module scope, so a background launch defines it too; it logs where a
// headless runtime's console goes (the device log).
location.defineUpdates('track', ({ locations }) => {
  const last = locations[locations.length - 1];

  showTracked?.(`${locations.length} fix(es), last ${describe(last)}`);
  console.log('location task track ' + JSON.stringify(locations));
});

function Button(props: { id: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      id={props.id}
      padding={10}
      borderRadius={8}
      backgroundColor="#2a2a36"
      onPress={() => props.onPress()}
    >
      <Text color="#ffffff">{props.label}</Text>
    </Pressable>
  );
}

/** Locates while it is mounted; the fixes land in `location.position`. */
function Watcher() {
  location.watch({ accuracy: 'highest' });

  // A Text of its own, not a Line: only its label changes as each fix comes.
  return (
    <Text id="watched" color="#ffffff">
      {'watch: ' +
        (location.error.value?.message ??
          (location.position.value ? describe(location.position.value) : 'waiting'))}
    </Text>
  );
}

function Line(props: { id: string; text: string }) {
  return (
    <Text id={props.id} color="#ffffff">
      {props.text}
    </Text>
  );
}

/**
 * Asks for location, then reads it once, watches it, and names the place;
 * with "always", locates in the background for the `track` task.
 */
export default function App() {
  const permission = signal('not asked');
  const position = signal('—');
  const watching = signal(false);
  const place = signal('—');
  const heading = signal('—');
  const background = signal('—');
  const tracked = signal('—');
  let compass: EventSubscription | null = null;

  const log = (line: string) => console.log('location ' + line);

  const request = () =>
    void permissions.request('location').then((response) => {
      permission.value = response.status;
      log('permission ' + JSON.stringify(response));
    });

  const locate = () =>
    void location.current({ accuracy: 'high' }).then(
      (fix) => {
        position.value = describe(fix);
        log('current ' + JSON.stringify(fix));
      },
      (error) => (position.value = failure(error)),
    );

  const toggleWatch = () => (watching.value = !watching.value);

  const name = () =>
    void location
      .current()
      .then((fix) => location.reverseGeocode(fix.coords))
      .then(
        (places) => {
          const first = places[0];

          place.value = first
            ? [first.street, first.city, first.country].filter(Boolean).join(', ')
            : 'nowhere';

          log('places ' + JSON.stringify(places));
        },
        (error) => (place.value = failure(error)),
      );

  const toggleCompass = () => {
    if (compass) {
      compass.remove();
      compass = null;
      heading.value = '—';

      return;
    }

    void location
      .watchHeading((next) => (heading.value = `${Math.round(next.magHeading)}° magnetic`))
      .then(
        (subscription) => (compass = subscription),
        (error) => (heading.value = failure(error)),
      );
  };

  const always = () =>
    void permissions.request('locationAlways').then((response) => {
      permission.value = 'always ' + response.status;
      log('always ' + JSON.stringify(response));
    });

  const toggleBackground = () =>
    void location
      .updating('track')
      .then((started) =>
        started
          ? location.stopUpdates('track').then(() => 'stopped')
          : location
              .startUpdates('track', {
                accuracy: 'high',
                showsBackgroundLocationIndicator: true,
                notification: { title: 'Kuito demo', body: 'Tracking your location' },
              })
              .then(() => 'started'),
      )
      .then(
        (next) => {
          background.value = next;
          log('background ' + next);
        },
        (error) => (background.value = failure(error)),
      );

  showTracked = (text) => (tracked.value = text);
  onCleanup(() => (showTracked = null));

  void location
    .updating('track')
    .then((started) => (background.value = started ? 'started' : 'stopped'));

  return (
    <SafeArea flex={1} backgroundColor="#0b0b10">
      <Scroll>
        <VStack gap={12} padding={20}>
          <Text color="#ffffff" fontSize={24} fontWeight={700}>
            location
          </Text>
          <Line id="permission" text={'permission: ' + permission.value} />
          <Line id="position" text={'current: ' + position.value} />
          <Show when={watching.value} fallback={<Line id="watched" text={'watch: off'} />}>
            <Watcher />
          </Show>
          <Line id="place" text={'place: ' + place.value} />
          <Line id="heading" text={'heading: ' + heading.value} />
          <Line id="background" text={'background: ' + background.value} />
          <Line id="tracked" text={'task: ' + tracked.value} />
          <HStack gap={10} flexWrap="wrap">
            <Button id="request" label="Request" onPress={request} />
            <Button id="locate" label="Current" onPress={locate} />
            <Button id="watch" label="Watch" onPress={toggleWatch} />
            <Button id="name" label="Place" onPress={name} />
            <Button id="compass" label="Compass" onPress={toggleCompass} />
            <Button id="always" label="Always" onPress={always} />
            <Button id="background-toggle" label="Background" onPress={toggleBackground} />
          </HStack>
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
