import { Box, signal, spring, timing, type Transition } from 'kuito';

// One feel for every card in the app: quick fades, springy moves.
const cardTransition: Transition = {
  opacity: timing(150),
  transform: spring({ damping: 18, stiffness: 220 }),
  shadow: timing(150),
};

const lifted = signal(false);

<Box
  transition={cardTransition}
  animate={{ translateY: lifted.value ? -4 : 0, shadowRadius: lifted.value ? 12 : 4 }}
  onPress={() => (lifted.value = !lifted.value)}
/>;
