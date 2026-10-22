// Share stroke styling between shapes.
import { Circle, Drawing, Path, type ShapePaint } from 'kuito';

// The app's icon strokes, shared by every shape that draws one.
const iconStroke: ShapePaint = {
  fill: 'none',
  stroke: '#1c1c1e',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

<Drawing label="Search" viewBox={[0, 0, 24, 24]} width={24} height={24}>
  <Circle cx={11} cy={11} r={7} {...iconStroke} />
  <Path d="M16 16l5 5" {...iconStroke} />
</Drawing>;
