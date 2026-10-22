// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/GestureHandlerInteractionController.kt
// and apple/RNGestureHandler.mm's UIGestureRecognizerDelegate),
// MIT License, Copyright (c) 2016 Software Mansion.
#include "GestureRelations.h"
#include <algorithm>
#include <utility>

namespace kuito::gestures {

void GestureRelations::set(int tag, Relations relations) { relations_[tag] = std::move(relations); }

bool GestureRelations::names(const std::vector<int>& tags, int tag) {
  return std::find(tags.begin(), tags.end(), tag) != tags.end();
}

const Relations* GestureRelations::find(int tag) const {
  auto found = relations_.find(tag);
  return found == relations_.end() ? nullptr : &found->second;
}

bool GestureRelations::waitsFor(int gesture, int other) const {
  if (gesture == other) return false;
  const Relations* own = find(gesture);
  const Relations* others = find(other);
  return (own && names(own->waitFor, other)) || (others && names(others->blocks, gesture));
}

bool GestureRelations::simultaneous(int a, int b) const {
  if (a == b) return true;
  const Relations* first = find(a);
  const Relations* second = find(b);
  return (first && names(first->simultaneous, b)) || (second && names(second->simultaneous, a));
}

std::vector<int> GestureRelations::awaited(int gesture) const {
  std::vector<int> tags;
  if (const Relations* own = find(gesture))
    for (int tag : own->waitFor)
      if (tag != gesture && !names(tags, tag)) tags.push_back(tag);
  std::vector<int> blockers;
  for (const auto& [tag, relations] : relations_)
    if (tag != gesture && names(relations.blocks, gesture) && !names(tags, tag)) blockers.push_back(tag);
  std::sort(blockers.begin(), blockers.end());
  tags.insert(tags.end(), blockers.begin(), blockers.end());
  return tags;
}

} // namespace kuito::gestures
