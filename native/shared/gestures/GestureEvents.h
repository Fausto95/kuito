// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/RNGestureHandler.mm's sendEventsInState),
// MIT License, Copyright (c) 2016 Software Mansion.
#pragma once
#include "GestureState.h"
#include <vector>

namespace kuito::gestures {

/// One state change the app hears: `state`, coming from `before`.
struct Change {
  State state;
  State before;
};

/// A gesture that never began tells the app nothing when it fails or is
/// cancelled: no onFinalize without onBegin. Both renderers hold to it.
inline bool reported(State before, State now) {
  return before != State::Undetermined || (now != State::Cancelled && now != State::Failed);
}

/// The changes the app hears when a recognizer UIKit drives moves to `now`,
/// `last` being the last state the app was told. A gesture's state then
/// becomes the last change's. Updates while active are not changes.
std::vector<Change> changesFor(State last, State now);

} // namespace kuito::gestures
