import { Symbol, tap, type HitArea } from 'kuito';

// A 24-point icon that takes touches over 44 points, as the platforms advise.
const comfortable: HitArea = { horizontal: 10, vertical: 10 };

<Symbol
  name="xmark"
  size={24}
  gestures={[tap({ hitArea: comfortable, onEnd: () => console.log('close') })]}
/>;
