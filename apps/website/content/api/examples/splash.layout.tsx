import { splash } from 'kuito';

const layout = splash.layout(); // null without a splash

if (layout) console.log(layout.logo.y + layout.logo.height, layout.brand?.width);
