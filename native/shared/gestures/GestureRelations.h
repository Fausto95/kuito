// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/GestureHandlerInteractionController.kt
// and apple/RNGestureHandler.mm's UIGestureRecognizerDelegate),
// MIT License, Copyright (c) 2016 Software Mansion.
#pragma once
#include <unordered_map>
#include <vector>

namespace kuito::gestures {

/// One gesture's relations to others, by tag, as its `gestures` entry gives
/// them (docs/motion.md, "Native contract").
struct Relations {
  std::vector<int> waitFor;
  std::vector<int> simultaneous;
  std::vector<int> blocks;
};

/// Which gesture waits for or runs alongside which, for every gesture of one
/// renderer. Both renderers answer their arbitration questions here: UIKit's
/// delegate on iOS, the orchestrator on Android. Tags are unique in the app,
/// so a relation may name a gesture on another view, or one not made yet.
class GestureRelations {
public:
  /// Replaces all three of the gesture's relations: one left empty is none.
  void set(int tag, Relations relations);
  /// The gesture's own relations go; others' naming it stay.
  void drop(int tag) { relations_.erase(tag); }
  void clear() { relations_.clear(); }

  /// `gesture` waits for `other` to fail before it may activate: it names
  /// `other` in waitFor, or `other` names it in blocks. Never itself.
  bool waitsFor(int gesture, int other) const;
  /// Either names the other in simultaneous; a gesture runs alongside itself.
  bool simultaneous(int a, int b) const;
  /// Every gesture `gesture` waits for, each once: its waitFor in order, then
  /// the gestures that block it by tag.
  std::vector<int> awaited(int gesture) const;

private:
  static bool names(const std::vector<int>& tags, int tag);
  const Relations* find(int tag) const;

  std::unordered_map<int, Relations> relations_;
};

} // namespace kuito::gestures
