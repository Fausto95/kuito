// Transform several drawing shapes together.
import { Circle, Drawing, Group } from 'kuito';

<Drawing label="Three dots" viewBox={[0, 0, 30, 10]} width={60} height={20}>
  <Group fill="#8a8a96" translateX={5} translateY={5}>
    <Circle r={3} />
    <Circle cx={10} r={3} />
    <Circle cx={20} r={3} />
  </Group>
</Drawing>;
