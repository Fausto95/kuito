import { Box, fade, slide } from 'kuito';

<Box enter={slide.up(12)} exit={slide.down()} />; // 24 by default
<Box enter={fade.and(slide.left())} />;
