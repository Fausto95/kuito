import { Box, Button, onMount, ref, signal, type KuitoNativeEvent } from 'kuito';

const saving = signal(false);

function Form(props: { onSave: () => void }) {
  const form = ref();

  // In the capture phase the form sees a press before the button inside it does,
  // and stops it while a save is running.
  const guard = (event: KuitoNativeEvent) => {
    if (saving.value) event.stopPropagation();
  };

  onMount(() => form.current?.addEventListener('press', guard, { capture: true }));

  return (
    <Box ref={form}>
      <Button onPress={props.onSave}>Save</Button>
    </Box>
  );
}
