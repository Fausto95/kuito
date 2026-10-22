import {
  Blur,
  Circle,
  ContextMenu,
  Drawing,
  Page,
  Pager,
  Path,
  Pressable,
  SafeArea,
  Text,
  VStack,
  signal,
} from 'kuito';
import css from './screens.css';

const ITEMS = [
  { value: 'share', label: 'Share' },
  { value: 'played', label: 'Mark played', disabled: true },
  { value: 'delete', label: 'Delete', destructive: true },
];

/** Stripes for a Blur to blur: what is behind it shows through. */
function Stripes() {
  return (
    <VStack flex={1}>
      {['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'].map((color) => (
        <VStack flex={1} backgroundColor={color} />
      ))}
    </VStack>
  );
}

/** The standard components that aren't form controls, as the platforms draw them. */
export default function App() {
  const chosen = signal('nothing yet');
  const presses = signal(0);
  const page = signal(0);
  const done = signal(0.25);

  return (
    <SafeArea flex={1} class={css.screen}>
      <VStack padding={24} gap={16}>
        <Text class={css.title}>Components</Text>
        <ContextMenu
          title="Episode 4"
          items={ITEMS}
          onSelect={(event) => (chosen.value = event.value)}
        >
          <Pressable
            padding={16}
            borderRadius={12}
            backgroundColor="#e8e8ed"
            onPress={() => presses.value++}
          >
            <Text class={css.onLight}>Episode 4: long press for its menu</Text>
            <Text class={css.onLight}>{`Tapped ${presses.value} times`}</Text>
          </Pressable>
        </ContextMenu>
        <Text class={css.text}>{`Chose ${chosen.value}`}</Text>
        <ContextMenu items={ITEMS} disabled>
          <Text class={css.note} padding={16}>
            A disabled menu opens nothing
          </Text>
        </ContextMenu>
        <Pager page={page} height={160} flexGrow={0} borderRadius={12}>
          {['#ffd6a5', '#caffbf', '#a0c4ff'].map((color, index) => (
            <Page backgroundColor={color} justifyContent="center" alignItems="center">
              <Text class={css.onLight} fontSize={28}>
                {`Page ${index + 1}`}
              </Text>
            </Page>
          ))}
        </Pager>
        <VStack height={120} borderRadius={12} overflow="hidden">
          <Stripes />
          <Blur material="thin" position="absolute" bottom={0} left={0} right={0} padding={12}>
            <Text>A thin Blur over color stripes</Text>
          </Blur>
        </VStack>
        <Pressable onPress={() => (done.value = done.value >= 1 ? 0 : done.value + 0.25)}>
          <Drawing label="Progress" viewBox={[0, 0, 100, 100]} width={96} height={96}>
            <Circle cx={50} cy={50} r={40} fill="none" stroke="#e5e5ea" strokeWidth={10} />
            <Circle
              cx={50}
              cy={50}
              r={40}
              fill="none"
              stroke="#34c759"
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={[2 * Math.PI * 40 * done.value, 2 * Math.PI * 40]}
              rotate={-90}
              translateY={100}
            />
            <Path d="M35 50l10 10 20-20" fill="none" stroke="#34c759" strokeWidth={6} />
          </Drawing>
          <Text
            class={css.text}
          >{`A Drawing at ${Math.round(done.value * 100)}%: tap to fill`}</Text>
        </Pressable>
        <Pressable onPress={() => (page.value = (page.value + 1) % 3)}>
          <Text class={css.text}>{`Showing page ${page.value + 1}: tap to turn`}</Text>
        </Pressable>
      </VStack>
    </SafeArea>
  );
}
