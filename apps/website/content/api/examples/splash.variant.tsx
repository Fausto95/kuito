import { splash } from 'kuito';

splash.variant.value; // the variant this launch showed, null for the default
splash.variant.value = 'holiday'; // picks the look of the next launch (Android 13+)
splash.variant.value = null; // back to the default
