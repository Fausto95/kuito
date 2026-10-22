import {
  DatePicker,
  HStack,
  SafeArea,
  Scroll,
  SegmentedControl,
  Select,
  Text,
  Toggle,
  VStack,
  appearance,
  localization,
  persisted,
  type Schema,
} from 'kuito';

// A settings screen whose choices outlive the app: each control is bound
// to a persisted signal, and the defaults come from the user's region.

/** A Standard Schema from a type guard; an app would bring Valibot or Zod. */
function schema<T>(valid: (value: unknown) => value is T): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'recipe',
      validate: (value) => (valid(value) ? { value } : { issues: [{ message: 'unexpected' }] }),
    },
  };
}

const isBoolean = schema((value): value is boolean => typeof value === 'boolean');
const isNumber = schema((value): value is number => typeof value === 'number');
const isString = schema((value): value is string => typeof value === 'string');

const UNITS = [
  { value: 'metric', label: 'Metric' },
  { value: 'us', label: 'Imperial' },
];

const WEEKDAYS = [
  { value: '1', label: 'Sunday' },
  { value: '2', label: 'Monday' },
  { value: '7', label: 'Saturday' },
];

/** Today at 08:00, the reminder's default. */
const eightAm = () => new Date().setHours(8, 0, 0, 0);

/** The user's region decides the defaults: its units and its first weekday. */
function regionDefaults() {
  const [locale] = localization.locales.value;
  const firstWeekday = String(localization.calendars.value[0]?.firstWeekday);

  return {
    units: locale?.measurementSystem === 'us' ? 'us' : 'metric',
    weekStart: WEEKDAYS.some((day) => day.value === firstWeekday) ? firstWeekday : '2',
  };
}

/** A time as the user's language and clock write it: 08:00 or 8:00 AM. */
function formatTime(time: number) {
  const [locale] = localization.locales.value;
  const [calendar] = localization.calendars.value;

  return new Intl.DateTimeFormat(locale?.languageTag, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !calendar?.uses24hourClock,
  }).format(time);
}

export default function Settings() {
  const defaults = regionDefaults();
  const reminders = persisted(false, { key: 'settings.reminders', schema: isBoolean });
  const remindAt = persisted(eightAm(), { key: 'settings.remindAt', schema: isNumber });
  const units = persisted(defaults.units, { key: 'settings.units', schema: isString });
  const weekStart = persisted(defaults.weekStart, { key: 'settings.weekStart', schema: isString });

  return (
    <SafeArea flex={1}>
      <Scroll>
        <VStack padding={24} gap={20}>
          <Text fontSize={28} fontWeight="bold">
            Settings
          </Text>

          <HStack justifyContent="space-between">
            <Text>Daily reminder</Text>
            <Toggle label="Daily reminder" checked={reminders} />
          </HStack>
          <DatePicker
            label="Reminder time"
            type="time"
            value={remindAt}
            disabled={!reminders.value}
            height={44}
          />
          <Text color="#6e6e73">
            {reminders.value ? `Every day at ${formatTime(remindAt.value)}` : 'No reminder'}
          </Text>

          <Text>Units</Text>
          <SegmentedControl label="Units" options={UNITS} value={units} height={32} />

          <Text>Week starts on</Text>
          <Select label="Week starts on" options={WEEKDAYS} value={weekStart} height={44} />

          <Text color="#6e6e73">
            {`Appearance: ${appearance.colorScheme.value ?? 'no preference'}, from the system`}
          </Text>
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
