// Draw a closed shape.
import { Drawing, Polygon } from 'kuito';

<Drawing label="Play" viewBox={[0, 0, 24, 24]} width={24} height={24}>
  <Polygon
    points={[
      [7, 4],
      [20, 12],
      [7, 20],
    ]}
    fill="#111827"
    strokeLinejoin="round"
  />
</Drawing>;
