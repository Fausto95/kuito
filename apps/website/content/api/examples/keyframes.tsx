// Animate through several keyframes.
import { Box, keyframes, motion, repeat } from 'kuito';

const pulse = motion(1);

pulse.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600)); // one prop: an animation

const pop = keyframes({ 0: { opacity: 0, scale: 0.8 }, 100: { opacity: 1, scale: 1 } }, 300); // objects: an effect

<Box scale={pulse} enter={pop} />;
