import { DatePicker, SafeArea, SegmentedControl, Select, Text, VStack, signal } from 'kuito';
import css from './screens.css';

const SIZES = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
];

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** The standard form controls, as the platforms draw them: pick, then read the values back. */
export default function App() {
  const day = signal(Date.now());
  const meeting = signal(Date.now());
  const size = signal<string | undefined>(undefined);
  const view = signal('week');

  return (
    <SafeArea flex={1} class={css.screen}>
      <VStack padding={24} gap={16}>
        <Text class={css.title}>Forms</Text>
        <DatePicker label="Day" value={day} min={Date.now()} height={44} />
        <Text class={css.text}>{new Date(day.value).toDateString()}</Text>
        <DatePicker label="Meeting" type="datetime" value={meeting} height={44} />
        <Text class={css.text}>{new Date(meeting.value).toLocaleString()}</Text>
        <DatePicker label="Locked" type="time" value={meeting.value} disabled height={44} />
        <Select label="Size" options={SIZES} value={size} placeholder="Choose a size" height={44} />
        <Text class={css.text}>{size.value ?? 'No size yet'}</Text>
        <Select label="Fixed" options={SIZES} value="m" disabled height={44} />
        <SegmentedControl label="View" options={VIEWS} value={view} height={32} />
        <Text class={css.text}>{view.value}</Text>
        <SegmentedControl label="Locked" options={VIEWS} value="day" disabled height={32} />
      </VStack>
    </SafeArea>
  );
}
