// Check for haptic support.
import { haptics } from 'kuito';

if (haptics.supported) haptics.impact('light');
