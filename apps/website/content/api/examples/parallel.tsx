import { Box, fade, parallel, slide, zoom } from 'kuito';

<Box enter={parallel(fade, slide.up(12), zoom())} />; // same as fade.and(slide.up(12)).and(zoom())
