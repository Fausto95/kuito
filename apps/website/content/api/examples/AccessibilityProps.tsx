// Make an icon-only button accessible.
import { Pressable, Symbol, type AccessibilityProps } from 'kuito';

// An icon button needs words for a screen reader: callers pass them through.
function IconButton(props: AccessibilityProps & { icon: string; onPress: () => void }) {
  return (
    <Pressable role="button" label={props.label} hint={props.hint} onPress={props.onPress}>
      <Symbol name={props.icon} size={22} />
    </Pressable>
  );
}

<IconButton icon="heart" label="Like" hint="Adds the song to your likes" onPress={() => {}} />;
