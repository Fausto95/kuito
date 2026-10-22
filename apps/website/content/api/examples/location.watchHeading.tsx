// Observe compass readings and stop when the screen unmounts.
import { Text, onMount, signal, location, type EventSubscription } from 'kuito';

export function Compass() {
  const heading = signal('Waiting for compass');
  onMount(() => {
    let disposed = false;
    let subscription: EventSubscription | undefined;
    void location
      .watchHeading((value) => {
        heading.value = JSON.stringify(value);
      })
      .then((value) => {
        if (disposed) value.remove();
        else subscription = value;
      })
      .catch((error) => {
        heading.value = String(error);
      });
    return () => {
      disposed = true;
      subscription?.remove();
    };
  });
  return <Text>{heading.value}</Text>;
}
