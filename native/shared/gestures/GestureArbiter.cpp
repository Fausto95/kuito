// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/GestureHandlerOrchestrator.kt
// and .../core/GestureHandler.kt's state changes),
// MIT License, Copyright (c) 2016 Software Mansion.
#include "GestureArbiter.h"
#include "GestureEvents.h"
#include <algorithm>
#include <stdexcept>
#include <string>
#include <utility>

namespace kuito::gestures {

State GestureTable::state(int tag) const {
  auto found = gestures_.find(tag);
  return found == gestures_.end() ? State::Undetermined : found->second.state;
}

GestureTable::Gesture& GestureTable::recorded(int tag) {
  auto found = gestures_.find(tag);
  if (found == gestures_.end() || !found->second.arbiter)
    throw std::logic_error("Gesture " + std::to_string(tag) + " changed state without being recorded by an arbiter");
  return found->second;
}

void GestureTable::begin(int tag) {
  if (state(tag) != State::Undetermined) return;
  const std::vector<int> awaited = relations.awaited(tag);
  bool blocked = std::any_of(awaited.begin(), awaited.end(), [this](int other) {
    auto found = gestures_.find(other);
    return found != gestures_.end() && found->second.active && found->second.state == State::Active;
  });
  moveToState(tag, blocked ? State::Failed : State::Began);
}

void GestureTable::activate(int tag) {
  State current = state(tag);
  if (current == State::Undetermined || current == State::Began) moveToState(tag, State::Active);
}

void GestureTable::end(int tag) {
  State current = state(tag);
  if (current == State::Began || current == State::Active) moveToState(tag, State::End);
}

void GestureTable::fail(int tag) {
  State current = state(tag);
  if (current == State::Active || current == State::Undetermined || current == State::Began)
    moveToState(tag, State::Failed);
}

void GestureTable::cancel(int tag) {
  auto found = gestures_.find(tag);
  State current = state(tag);
  bool awaiting = found != gestures_.end() && found->second.awaiting;
  if (current == State::Active || current == State::Undetermined || current == State::Began || awaiting) {
    recorded(tag).arbiter->host_.cancelling(tag);
    moveToState(tag, State::Cancelled);
  }
}

void GestureTable::drop(int tag) {
  auto found = gestures_.find(tag);
  if (found != gestures_.end()) {
    if (found->second.arbiter) found->second.arbiter->forget(tag);
    gestures_.erase(tag);
  }
  relations.drop(tag);
}

void GestureTable::moveToState(int tag, State state) {
  Gesture& gesture = recorded(tag);
  if (gesture.state == state) return;
  State before = gesture.state;
  gesture.state = state;
  GestureArbiter& arbiter = *gesture.arbiter;
  {
    // The recognizer hears its change before a finished gesture leaves the stream.
    GestureArbiter::Changing changing(arbiter);
    arbiter.stateChanged(tag, state, before);
    arbiter.host_.changed(tag, state, before);
  }
  arbiter.scheduleCleanup();
}

GestureArbiter::~GestureArbiter() {
  for (int tag : gestures_) {
    auto found = table_.gestures_.find(tag);
    if (found != table_.gestures_.end() && found->second.arbiter == this) found->second.arbiter = nullptr;
  }
}

void GestureArbiter::record(int tag) {
  if (recorded(tag)) return;
  Gesture& entry = table_.gestures_[tag];
  if (entry.arbiter) throw std::logic_error("Gesture " + std::to_string(tag) + " is recorded by another arbiter");
  entry = Gesture{};
  entry.arbiter = this;
  gestures_.push_back(tag);
}

bool GestureArbiter::recorded(int tag) const {
  return std::find(gestures_.begin(), gestures_.end(), tag) != gestures_.end();
}

std::vector<int> GestureArbiter::order() const {
  std::vector<int> tags = gestures_;
  std::stable_sort(tags.begin(), tags.end(), [this](int first, int second) {
    const Gesture& a = gesture(first);
    const Gesture& b = gesture(second);
    // RNGH's comparator: among gestures both active or both awaiting, the
    // greater activation index comes first.
    if ((a.active && b.active) || (a.awaiting && b.awaiting)) return a.activationIndex > b.activationIndex;
    if (a.active != b.active) return a.active;
    return a.awaiting && !b.awaiting;
  });
  return tags;
}

bool GestureArbiter::awaiting(int tag) const { return gesture(tag).awaiting; }

bool GestureArbiter::active(int tag) const { return gesture(tag).active; }

bool GestureArbiter::takeResetProgress(int tag) {
  Gesture& entry = gesture(tag);
  return std::exchange(entry.resetProgress, false);
}

bool GestureArbiter::anyActive() const {
  return std::any_of(gestures_.begin(), gestures_.end(),
                     [this](int tag) { return gesture(tag).state == State::Active; });
}

void GestureArbiter::endTouch() {
  handlingTouch_ = false;
  if (cleanupScheduled_ && handlingChange_ == 0) cleanupFinished();
}

void GestureArbiter::scheduleCleanup() {
  if (handlingTouch_ || handlingChange_ != 0) {
    cleanupScheduled_ = true;
  } else {
    cleanupFinished();
  }
}

void GestureArbiter::cleanupFinished() {
  std::vector<int> leaving;
  for (auto tag = gestures_.rbegin(); tag != gestures_.rend(); ++tag) {
    Gesture& entry = gesture(*tag);
    if (finished(entry.state) && !entry.awaiting) leaving.push_back(*tag);
  }
  for (int tag : leaving) {
    Gesture& entry = gesture(tag);
    entry.arbiter = nullptr;
    entry.active = false;
    entry.awaiting = false;
    entry.activationIndex = INT_MAX;
    gestures_.erase(std::find(gestures_.begin(), gestures_.end(), tag));
    host_.reset(tag);
  }
  cleanupScheduled_ = false;
}

void GestureArbiter::forget(int tag) {
  gestures_.erase(std::remove(gestures_.begin(), gestures_.end(), tag), gestures_.end());
  awaiting_.erase(std::remove(awaiting_.begin(), awaiting_.end(), tag), awaiting_.end());
  host_.reset(tag);
}

bool GestureArbiter::waitsFor(int tag, int other) const { return table_.relations.waitsFor(tag, other); }

bool GestureArbiter::simultaneous(int a, int b) const { return table_.relations.simultaneous(a, b); }

bool GestureArbiter::hasOtherToWaitFor(int tag) const {
  return std::any_of(gestures_.begin(), gestures_.end(),
                     [&](int other) { return !finished(gesture(other).state) && waitsFor(tag, other); });
}

bool GestureArbiter::cancelledByFinished(int tag) const {
  return std::any_of(gestures_.begin(), gestures_.end(),
                     [&](int other) { return waitsFor(tag, other) && gesture(other).state == State::End; });
}

bool GestureArbiter::cancelledByActive(int tag) const {
  return std::any_of(gestures_.begin(), gestures_.end(), [&](int other) {
    return host_.sharePointers(tag, other) && gesture(other).active && !simultaneous(tag, other) &&
           host_.inside(tag, other);
  });
}

void GestureArbiter::tryActivate(int tag) {
  // If we are waiting for a gesture that has successfully finished, we should cancel handler
  if (cancelledByFinished(tag) || cancelledByActive(tag)) {
    table_.cancel(tag);
    return;
  }

  // see if there is anyone else who we need to wait for
  if (hasOtherToWaitFor(tag)) {
    addAwaiting(tag);
  } else {
    // we can activate handler right away
    makeActive(tag);
    gesture(tag).awaiting = false;
  }
}

bool GestureArbiter::isAwaitingListed(int tag) const {
  return std::find(awaiting_.begin(), awaiting_.end(), tag) != awaiting_.end();
}

void GestureArbiter::cleanupAwaiting() {
  awaiting_.erase(
      std::remove_if(awaiting_.begin(), awaiting_.end(), [this](int tag) { return !gesture(tag).awaiting; }),
      awaiting_.end());
}

void GestureArbiter::stateChanged(int tag, State now, State before) {
  {
    Changing changing(*this);
    stateChangedWhileChanging(tag, now, before);
  }
  scheduleCleanup();
}

void GestureArbiter::stateChangedWhileChanging(int tag, State now, State before) {

  if (gesture(tag).awaiting && (now == State::Cancelled || now == State::Failed)) gesture(tag).awaiting = false;

  if (finished(now)) {
    // A copy: activating or cancelling a gesture changes the list.
    const std::vector<int> currentlyAwaiting = awaiting_;

    // if there were handlers awaiting completion of this handler, we can trigger active state
    for (int other : currentlyAwaiting) {
      if (!waitsFor(other, tag) || !isAwaitingListed(other)) continue;

      if (now == State::End) {
        // gesture has ended, we need to kill the awaiting handler
        table_.cancel(other);
        if (gesture(other).state == State::End) {
          // Handle edge case, where discrete gestures end immediately after activation thus
          // their state is set to END and when the gesture they are waiting for activates they
          // should be cancelled, however `cancel` was never sent as gestures were already in the END state.
          // Send synthetic BEGAN -> CANCELLED to properly handle JS logic
          host_.send(other, State::Cancelled, State::Began);
        }
        gesture(other).awaiting = false;
      } else {
        // gesture has failed recognition, we may try activating
        tryActivate(other);
      }
    }
    cleanupAwaiting();
  }

  if (now == State::Active) {
    tryActivate(tag);
  } else if (before == State::Active || before == State::End) {
    if (gesture(tag).active) {
      host_.send(tag, now, before);
    } else if (now == State::Cancelled || now == State::Failed) {
      // Handle edge case where handler awaiting for another one tries to activate but finishes
      // before the other would not send state change event upon ending. Note that we only want
      // to do this if the newState is either CANCELLED or FAILED, if it is END we still want to
      // wait for the other handler to finish as in that case synthetic events will be sent by the
      // makeActive method.
      // This also covers the case where a discrete gesture (e.g. Tap) ends immediately after
      // activation (ACTIVE -> END) while still awaiting another handler, and is later
      // cancelled when that handler activates.
      host_.send(tag, now, State::Began);
    }
  } else if (reported(before, now)) {
    host_.send(tag, now, before);
  }
}

void GestureArbiter::makeActive(int tag) {
  State current = gesture(tag).state;
  {
    Gesture& entry = gesture(tag);
    entry.awaiting = false;
    entry.active = true;
    entry.resetProgress = true;
    entry.activationIndex = activationIndex_++;
  }

  // A copy: a recognizer told of its cancellation may drop a gesture.
  const std::vector<int> others(gestures_.rbegin(), gestures_.rend());
  for (int other : others)
    if (recorded(other) && cancelledBy(other, tag)) table_.cancel(other);

  // Clear all awaiting handlers waiting for the current handler to fail
  for (auto other = awaiting_.rbegin(); other != awaiting_.rend(); ++other)
    if (cancelledBy(*other, tag)) gesture(*other).awaiting = false;
  cleanupAwaiting();

  // At this point the waiting handler is allowed to activate, so we need to send BEGAN -> ACTIVE event
  // as it wasn't sent before. If handler has finished recognizing the gesture before it was allowed to
  // activate, we also need to send ACTIVE -> END and END -> UNDETERMINED events, as it was blocked from
  // sending events while waiting.
  // There is one catch though - if the handler failed or was cancelled while waiting, relevant event has
  // already been sent. The following chain would result in artificially activating that handler after the
  // failure logic was ran and we don't want to do that.
  if (current == State::Failed || current == State::Cancelled) return;

  host_.send(tag, State::Active, State::Began);

  if (current != State::Active) {
    host_.send(tag, State::End, State::Active);
    if (current != State::End) host_.send(tag, State::Undetermined, State::End);
  }
}

void GestureArbiter::addAwaiting(int tag) {
  if (isAwaitingListed(tag)) return;
  awaiting_.push_back(tag);
  Gesture& entry = gesture(tag);
  entry.awaiting = true;
  entry.activationIndex = activationIndex_++;
}

bool GestureArbiter::cancelledBy(int tag, int other) const {
  // if two handlers share no common pointer one can never trigger cancel for the other
  if (!host_.sharePointers(tag, other)) return false;
  // if handlers are allowed to run simultaneously, when first activates second can still remain
  // in began state
  if (simultaneous(tag, other)) return false;
  const Gesture& entry = gesture(tag);
  if (tag != other && (entry.awaiting || entry.state == State::Active)) {
    // A gesture about to activate, or active, gives way only to a root's own
    // gesture: roots use negative tags, the app's gestures never do.
    return tag >= 0 && other < 0;
  }
  return true;
}

void GestureArbiter::cancelAll() {
  // Copies: cancelling one gesture can make another wait.
  std::vector<int> waiting(awaiting_.rbegin(), awaiting_.rend());
  for (int tag : waiting) table_.cancel(tag);
  std::vector<int> all(gestures_.rbegin(), gestures_.rend());
  for (int tag : all) table_.cancel(tag);
}

void GestureArbiter::cancelApp() {
  std::vector<int> leaving;
  for (int tag : gestures_)
    if (tag >= 0) leaving.push_back(tag);
  // Cancelling a handler activates the handlers awaiting its failure. Drop the batch from the
  // awaiting pool first, so cancelling one member cannot activate another before its turn.
  for (int tag : leaving) awaiting_.erase(std::remove(awaiting_.begin(), awaiting_.end(), tag), awaiting_.end());
  for (int tag : leaving) table_.cancel(tag);
  scheduleCleanup();
}

void GestureArbiter::clear() {
  const std::vector<int> leaving = std::exchange(gestures_, {});
  awaiting_.clear();
  cleanupScheduled_ = false;
  // Every gesture leaves before any recognizer hears of it, so one that
  // throws leaves none pointing at an arbiter about to go.
  for (int tag : leaving) {
    Gesture& entry = gesture(tag);
    entry.state = State::Cancelled;
    entry.arbiter = nullptr;
    entry.active = false;
    entry.awaiting = false;
    entry.activationIndex = INT_MAX;
  }
  for (int tag : leaving) host_.reset(tag);
}

} // namespace kuito::gestures
