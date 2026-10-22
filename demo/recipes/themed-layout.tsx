import {
  Box,
  For,
  HStack,
  SafeArea,
  Spacer,
  Text,
  Toggle,
  VStack,
  localization,
  signal,
  styles,
} from 'kuito';
import css from './themed-layout.css';

// An inbox that follows the system: its colors come from the color scheme,
// its rows mirror for right-to-left languages, its text grows with the
// user's size, and its words come from catalogs in ICU MessageFormat.

const t = localization.messages({
  en: {
    title: 'Inbox',
    greeting: 'Hello, {name}!',
    unread:
      '{count, plural, =0 {No unread messages} one {# unread message} other {# unread messages}}',
    mirror: 'Right to left',
  },
  ar: {
    title: 'البريد الوارد',
    greeting: 'مرحبًا، {name}!',
    unread:
      '{count, plural, zero {لا رسائل غير مقروءة} one {رسالة واحدة غير مقروءة} two {رسالتان غير مقروءتين} few {# رسائل غير مقروءة} many {# رسالة غير مقروءة} other {# رسالة غير مقروءة}}',
    mirror: 'من اليمين إلى اليسار',
  },
});

// A styles() sheet sits next to the .css one: the badge is this file's alone.
const sheet = styles({
  badge: {
    minWidth: 24,
    paddingInline: '8px',
    paddingBlock: '2px',
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
  },
});

const THREADS = [
  { id: 'ada', name: 'Ada', preview: 'The engine runs.', unread: 2 },
  { id: 'grace', name: 'Grace', preview: 'Found the bug.', unread: 1 },
  { id: 'alan', name: 'Alan', preview: 'Lunch?', unread: 0 },
];

/** The direction the app lays out in: its user's first language's. */
const appDirection = () => localization.locales.value[0]?.textDirection ?? 'ltr';

export default function ThemedLayout() {
  // Off, the screen inherits the app's direction; on, it previews the other one.
  const mirrored = signal(false);
  const unread = THREADS.reduce((sum, thread) => sum + thread.unread, 0);

  return (
    <SafeArea flex={1} class={css.screen}>
      <VStack
        gap={12}
        direction={mirrored.value ? (appDirection() === 'rtl' ? 'ltr' : 'rtl') : appDirection()}
      >
        <Text class={css.title}>{t('title')}</Text>
        <HStack class={css.row}>
          <Text class={css.name}>{t('mirror')}</Text>
          <Spacer />
          <Toggle label={t('mirror')} checked={mirrored} />
        </HStack>
        <Text class={css.lead}>{t('greeting', { name: 'Ada' })}</Text>
        <Text class={css.lead}>{t('unread', { count: unread })}</Text>
        <For each={THREADS}>
          {(thread) => (
            <HStack class={css.row}>
              <Box class={css.avatar} role="img" label={thread.name} />
              <VStack flex={1} gap={2}>
                <Text class={css.name}>{thread.name}</Text>
                <Text class={css.preview}>{thread.preview}</Text>
              </VStack>
              {thread.unread > 0 && (
                <Box class={sheet.badge}>
                  {/* A count in a fixed pill: it may grow a little, never past it. */}
                  <Text color="#ffffff" fontSize={13} maxFontScale={1.3}>
                    {String(thread.unread)}
                  </Text>
                </Box>
              )}
            </HStack>
          )}
        </For>
      </VStack>
    </SafeArea>
  );
}
