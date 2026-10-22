import { Box, Pressable, HStack, SafeArea, Text } from 'kuito';
import css from './theme.css';

export type Tab = 'discover' | 'search' | 'library' | 'lab';

const TABS: { value: Tab; label: string }[] = [
  { value: 'discover', label: 'Discover' },
  { value: 'search', label: 'Search' },
  { value: 'library', label: 'Library' },
  { value: 'lab', label: 'Lab' },
];

interface TabBarProps {
  tab: Tab;
  onSelect: (tab: Tab) => void;
}

/** Bottom tabs, clear of the home indicator; the active one is lit with a dot. */
export function TabBar(props: TabBarProps) {
  return (
    <SafeArea edges={['bottom']} class={css.tabBar}>
      <Box class={css.separator} />
      <HStack id="tabs" class={css.tabs} role="tablist">
        {TABS.map((tab) => (
          <Pressable
            id={'tab-' + tab.value}
            key={tab.value}
            class={css.tab}
            haptic="selection"
            role="tab"
            aria-selected={props.tab === tab.value}
            onPress={() => props.onSelect(tab.value)}
          >
            <Text class={css.tabLabel} color={props.tab === tab.value ? '#f5f5f7' : '#6b6b76'}>
              {tab.label}
            </Text>
            <Box class={css.tabDot} opacity={props.tab === tab.value ? 1 : 0} />
          </Pressable>
        ))}
      </HStack>
    </SafeArea>
  );
}
