// Offset entry animations across a group.
import { Box, fade, slide, stagger, zoom } from 'kuito';

<Box enter={stagger(80, fade, slide.up(12), zoom())} />; // each 80 ms after the one before
