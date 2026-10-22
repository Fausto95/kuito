// Read the system display preferences.
import { Text, appearance, type AppearancePreferences } from 'kuito';

function describe(preferences: AppearancePreferences): string {
  const scheme = preferences.colorScheme ?? 'no preference';

  return `${scheme}, text at ${Math.round(preferences.fontScale * 100)}%`;
}

<Text>
  {describe({ colorScheme: appearance.colorScheme.value, fontScale: appearance.fontScale.value })}
</Text>;
