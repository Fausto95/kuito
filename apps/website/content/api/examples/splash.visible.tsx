// Observe splash visibility.
import { splash, watch } from 'kuito';

splash.visible.value; // true while the native splash is up

watch(splash.visible, (up) => {
  if (!up) console.log('splash gone');
});
