// Fade a view on entry or removal.
import { Box, fade, slide, spring } from 'kuito';

<Box enter={fade.and(slide.up(12))} exit={fade} layout={spring()} />;
