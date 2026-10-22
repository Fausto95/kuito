import {
  Box,
  HStack,
  Page,
  Pager,
  Pressable,
  SafeArea,
  Show,
  Text,
  VStack,
  interpolate,
  scrollMotion,
  signal,
  window,
} from 'kuito';

const PAGES = [
  { title: 'Welcome', body: 'Every episode you follow, in one place.', color: '#ffd6a5' },
  { title: 'Sync your library', body: 'Start on your phone, finish anywhere.', color: '#caffbf' },
  { title: 'You’re all set', body: 'New episodes land here the day they air.', color: '#a0c4ff' },
];

const LAST = PAGES.length - 1;

/**
 * A three-page onboarding: swipe or press Next. The dots and each page's
 * artwork follow the pager's scroll offset every frame, with no handler.
 */
export default function Onboarding() {
  const page = signal(0);
  const done = signal(false);
  const pager = scrollMotion();
  // A page is as wide as the pager, which fills the window's width.
  const width = window.size.value.width;
  // Where the pager rests on the page before, on this page and on the page after.
  const around = (index: number) => [(index - 1) * width, index * width, (index + 1) * width];

  return (
    <SafeArea flex={1} backgroundColor="#fdfcf8">
      <Show
        when={!done.value}
        fallback={
          <VStack flex={1} justifyContent="center" alignItems="center">
            <Text fontSize={28} fontWeight={700}>
              Enjoy the show
            </Text>
          </VStack>
        }
      >
        <HStack justifyContent="flex-end" padding={16}>
          <Pressable onPress={() => (page.value = LAST)} disabled={page.value === LAST}>
            <Text color="#6b6b76">Skip</Text>
          </Pressable>
        </HStack>
        <Pager page={page} motion={pager} flex={1}>
          {PAGES.map((each, index) => (
            <Page alignItems="center" justifyContent="center" gap={24} padding={32}>
              <Box
                width={200}
                height={200}
                borderRadius={100}
                backgroundColor={each.color}
                translateX={interpolate(pager.offset, around(index), [-width / 2, 0, width / 2])}
              />
              <Text
                fontSize={28}
                fontWeight={700}
                opacity={interpolate(pager.offset, around(index), [0, 1, 0])}
              >
                {each.title}
              </Text>
              <Text color="#6b6b76" textAlign="center">
                {each.body}
              </Text>
            </Page>
          ))}
        </Pager>
        <HStack
          role="progressbar"
          label={`Page ${page.value + 1} of ${PAGES.length}`}
          justifyContent="center"
          gap={8}
          padding={16}
        >
          {PAGES.map((_, index) => (
            <Box
              height={8}
              borderRadius={4}
              width={interpolate(pager.offset, around(index), [8, 24, 8])}
              backgroundColor={interpolate(pager.offset, around(index), [
                '#d0d0d8',
                '#1c1c24',
                '#d0d0d8',
              ])}
            />
          ))}
        </HStack>
        <Pressable
          margin={16}
          padding={16}
          borderRadius={14}
          alignItems="center"
          backgroundColor="#1c1c24"
          onPress={() => (page.value === LAST ? (done.value = true) : page.value++)}
        >
          <Text color="#ffffff" fontWeight={600}>
            {page.value === LAST ? 'Get started' : 'Next'}
          </Text>
        </Pressable>
      </Show>
    </SafeArea>
  );
}
