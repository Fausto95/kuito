// Read the current color scheme.
import { appearance, watch } from 'kuito';

appearance.colorScheme.value; // 'light' | 'dark' | null
appearance.fontScale.value; // 1 by default
watch(appearance.fontScale, (scale) => console.log(scale)); // in a component
