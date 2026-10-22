import { Drawing, Polyline } from 'kuito';

<Drawing label="Plays this week" viewBox={[0, 0, 60, 20]} width={120} height={40}>
  <Polyline
    points={[
      [0, 17],
      [10, 12],
      [20, 15],
      [30, 8],
      [40, 11],
      [50, 5],
      [60, 9],
    ]}
    fill="none"
    stroke="#e5484d"
    strokeWidth={1.5}
    strokeLinejoin="round"
  />
</Drawing>;
