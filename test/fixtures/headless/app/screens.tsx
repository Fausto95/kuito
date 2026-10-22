import {
  Blur,
  KuitoCustomEvent,
  clipboard,
  Circle,
  ContextMenu,
  Drawing,
  DatePicker,
  SegmentedControl,
  Select,
  HStack,
  List,
  Page,
  Pager,
  onMount,
  Pressable,
  ref,
  Scroll,
  signal,
  Text,
  TextField,
  Toggle,
  task,
  VStack,
} from 'kuito';
import check from './check.svg?drawing';

export function Counter() {
  const count = signal(0);

  return (
    <VStack padding={20} gap={8}>
      <Text role="heading" fontSize={24}>
        Counter
      </Text>
      <HStack gap={10}>
        <Pressable label="Add" role="button" flex={1} padding={10} onPress={() => count.value++}>
          <Text>Add</Text>
        </Pressable>
        <Pressable
          label="Hold"
          role="button"
          flex={1}
          padding={10}
          onLongPress={() => (count.value = 100)}
        >
          <Text>Hold</Text>
        </Pressable>
      </HStack>
      <Text>{`Count: ${count.value}`}</Text>
    </VStack>
  );
}

export function Form() {
  const name = signal('');
  const on = signal(false);

  return (
    <VStack padding={20} gap={8}>
      <TextField placeholder="Name" value={name} />
      <Toggle checked={on} />
      <Text>{`Hello, ${name.value || 'nobody'}`}</Text>
      <Text>{on.value ? 'On' : 'Off'}</Text>
    </VStack>
  );
}

export function Notes() {
  const note = signal('');

  return (
    <VStack padding={20} gap={8}>
      <TextField label="Note" lines={{ min: 1, max: 3 }} placeholder="Note" value={note} />
      <TextField label="Summary" lines={2} placeholder="Summary" />
      <Text>{`Note: ${note.value.split('\n').length} lines`}</Text>
    </VStack>
  );
}

const ROWS = Array.from({ length: 60 }, (_, index) => ({
  id: String(index),
  title: `Row ${index}`,
}));

export function Feed() {
  const ends = signal(0);

  return (
    <VStack flex={1}>
      <Text>{`Ended ${ends.value}`}</Text>
      <List
        flex={1}
        data={ROWS}
        onReachEnd={() => ends.value++}
        renderItem={({ item }) => <Text height={40}>{item.title}</Text>}
      />
    </VStack>
  );
}

export function Long() {
  const y = signal(0);

  return (
    <Scroll flex={1} onScroll={(event) => (y.value = event.y)}>
      <Text>{`At ${y.value}`}</Text>
      <VStack height={2000} />
    </Scroll>
  );
}

export function Paste() {
  const text = signal('');
  const paste = task(async () => {
    text.value = await clipboard.readText();
  });

  return (
    <VStack>
      <Pressable label="Paste" onPress={() => void paste.run()}>
        <Text>Paste</Text>
      </Pressable>
      <Text>{`Pasted: ${text.value}`}</Text>
    </VStack>
  );
}

export function Fetched() {
  const status = signal('loading');

  void fetch('https://example.test/greeting')
    .then((response) => response.text())
    .then((body) => (status.value = body))
    .catch((error: unknown) => (status.value = String(error)));

  return <Text>{status.value}</Text>;
}

/** A moment as its parts in the device's zone. */
const shown = (moment: number) => {
  const at = new Date(moment);

  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()} ${at.getHours()}:${at.getMinutes()}`;
};

export function Due() {
  // In the device's zone, as the pickers show it.
  const due = signal(new Date(2026, 9, 21, 14, 30).getTime());

  return (
    <VStack padding={20} gap={8}>
      <DatePicker label="Due" value={due} min={new Date(2026, 9, 21, 9, 0).getTime()} height={44} />
      <DatePicker label="At" type="time" value={due} height={44} />
      <DatePicker label="Locked" value={due} disabled height={44} />
      <Text>{`Due: ${shown(due.value)}`}</Text>
    </VStack>
  );
}

const SIZES = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
];

export function Size() {
  const size = signal('m');

  return (
    <VStack padding={20} gap={8}>
      <Select label="Size" options={SIZES} value={size} height={44} />
      <Select label="Fixed" options={SIZES} value={size} disabled height={44} />
      <Text>{`Size: ${size.value}`}</Text>
    </VStack>
  );
}

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function Plan() {
  const view = signal('week');

  return (
    <VStack padding={20} gap={8}>
      <SegmentedControl label="View" options={VIEWS} value={view} height={32} />
      <SegmentedControl label="Fixed" options={VIEWS} value={view} disabled height={32} />
      <Text>{`View: ${view.value}`}</Text>
    </VStack>
  );
}

const EPISODE = [
  { value: 'share', label: 'Share' },
  { value: 'played', label: 'Mark played', disabled: true },
  { value: 'delete', label: 'Delete', destructive: true },
];

export function Episode() {
  const last = signal('none');

  return (
    <VStack padding={20} gap={8}>
      <ContextMenu
        title="Episode 4"
        items={EPISODE}
        onSelect={(event) => (last.value = event.value)}
      >
        <Text>Episode 4</Text>
      </ContextMenu>
      <ContextMenu items={EPISODE} disabled onSelect={(event) => (last.value = event.value)}>
        <Text>Episode 5</Text>
      </ContextMenu>
      <Text>{`Last: ${last.value}`}</Text>
    </VStack>
  );
}

export function Album() {
  const page = signal(0);
  const paged = signal<number[]>([]);

  return (
    <VStack flex={1}>
      <Pager
        label="Photos"
        page={page}
        onPageChange={(next) => (paged.value = [...paged.value, next])}
        height={300}
      >
        <Page>
          <Text>First photo</Text>
        </Page>
        <Page>
          <Text>Second photo</Text>
        </Page>
        <Page>
          <Text>Third photo</Text>
        </Page>
      </Pager>
      <Text>{`Page: ${page.value}`}</Text>
      <Text>{`Paged: ${paged.value.length ? paged.value.join(', ') : 'none'}`}</Text>
      <Pressable onPress={() => (page.value = 2)}>
        <Text>Last</Text>
      </Pressable>
    </VStack>
  );
}

export function Frosted() {
  return (
    <VStack flex={1}>
      <Blur material="thin" padding={12}>
        <Text>Now playing</Text>
      </Blur>
    </VStack>
  );
}

export function Logo() {
  const radius = signal(10);

  return (
    <VStack padding={20}>
      <Drawing label="Logo" viewBox={[0, 0, 100, 100]} width={100} height={100}>
        <Circle cx={50} cy={50} r={radius.value} fill="#ff0000" />
      </Drawing>
      <Pressable onPress={() => (radius.value = 20)}>
        <Text>Grow</Text>
      </Pressable>
    </VStack>
  );
}

export function Badge() {
  return (
    <Drawing label="Done" src={check} width={24} height={24}>
      <Circle cx={12} cy={12} r={11} fill="none" stroke="#34c759" />
    </Drawing>
  );
}

/** A custom event a child dispatches, heard by its parent as it bubbles. */
export function Announcer() {
  const card = ref();
  const button = ref();
  const heard = signal(0);

  onMount(() => {
    card.current?.addEventListener('announce', () => heard.value++);
  });

  return (
    <VStack ref={card} padding={20} gap={8}>
      <Pressable
        ref={button}
        label="Announce"
        role="button"
        onPress={() =>
          button.current?.dispatchEvent(
            new KuitoCustomEvent('announce', { detail: 'hello', bubbles: true }),
          )
        }
      >
        <Text>Announce</Text>
      </Pressable>
      <Text>{'Heard: ' + heard.value}</Text>
    </VStack>
  );
}
