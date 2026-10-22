import { Box, delay, fade, spring, timing } from 'kuito';

<Box opacity={timing(200).to(0)} translateY={delay(80, spring().to(12))} />;
<Box enter={delay(150, fade)} />;
