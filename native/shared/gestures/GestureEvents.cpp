// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/RNGestureHandler.mm's sendEventsInState),
// MIT License, Copyright (c) 2016 Software Mansion.
#include "GestureEvents.h"

namespace kuito::gestures {

std::vector<Change> changesFor(State last, State now) {
  if (now == last || !reported(last, now)) return {};
  // Don't send change events from END to FAILED or CANCELLED.
  if (last == State::End && (now == State::Failed || now == State::Cancelled)) return {};
  // Recognizers don't respect manually changing their state (that happens when we are activating
  // handler under custom conditions). If we send a custom event in state ACTIVE and the recognizer
  // will later update its state, we will end up sending ACTIVE->BEGAN and BEGAN->ACTIVE chain. To
  // prevent this, we simply detect the first weird state change and stop it.
  if (now == State::Began && last == State::Active) return {};
  // An END that skipped ACTIVE (a tap) sends ACTIVE first, to preserve the gesture flow.
  if (now == State::End && last != State::Active) return {{State::Active, last}, {State::End, State::Active}};
  return {{now, last}};
}

} // namespace kuito::gestures
