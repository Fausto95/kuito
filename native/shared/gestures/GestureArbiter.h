// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/GestureHandlerOrchestrator.kt
// and .../core/GestureHandler.kt's state changes),
// MIT License, Copyright (c) 2016 Software Mansion.
#pragma once
#include "GestureRelations.h"
#include "GestureState.h"
#include <climits>
#include <unordered_map>
#include <vector>

namespace kuito::gestures {

/// What only the platform knows about a gesture, and what it does when the
/// arbiter decides. Calls may come back into the table and the arbiter.
class GestureHost {
public:
  /// The two gestures track a pointer in common.
  virtual bool sharePointers(int a, int b) = 0;
  /// `gesture`'s view is a descendant of `other`'s.
  virtual bool inside(int gesture, int other) = 0;
  /// The gesture is about to be cancelled: its recognizer stops what it scheduled.
  virtual void cancelling(int tag) = 0;
  /// The gesture's state changed, after the arbiter took the change into account.
  virtual void changed(int tag, State now, State before) = 0;
  /// The app is told the gesture went from `before` to `now`.
  virtual void send(int tag, State now, State before) = 0;
  /// The gesture left the stream: its recognizer forgets the touches it saw.
  virtual void reset(int tag) = 0;

protected:
  ~GestureHost() = default;
};

class GestureArbiter;

/// Every gesture of one renderer by tag: the relations between them and each
/// one's state. A gesture changes state only while an arbiter has it in its
/// stream; its last state stays readable after it leaves.
class GestureTable {
public:
  GestureRelations relations;

  State state(int tag) const;
  /// RNGH's guarded changes: each is a no-op from a state it does not leave.
  /// They throw std::logic_error for a gesture no arbiter has recorded.
  /// A gesture that waits for one the app heard activate fails instead of
  /// beginning, as UIKit's delegate refuses it: it could only wait to be
  /// cancelled. The gesture it waits for may be under another root.
  void begin(int tag);
  void activate(int tag);
  void end(int tag);
  void fail(int tag);
  void cancel(int tag);
  /// The gesture is gone: it leaves its arbiter's stream, its state and its
  /// own relations go.
  void drop(int tag);

private:
  friend class GestureArbiter;

  struct Gesture {
    State state = State::Undetermined;
    GestureArbiter* arbiter = nullptr;
    bool active = false;
    bool awaiting = false;
    bool resetProgress = false;
    int activationIndex = INT_MAX;
  };

  Gesture& recorded(int tag);
  void moveToState(int tag, State state);

  std::unordered_map<int, Gesture> gestures_;
};

/// Arbitrates the gestures under one root of touches: which activates, which
/// waits for another to fail, which is cancelled, and which state changes the
/// app sees. The platform finds the gestures under each new pointer, records
/// them here, and delivers the touch stream in `order()`.
class GestureArbiter {
public:
  GestureArbiter(GestureTable& table, GestureHost& host) : table_(table), host_(host) {}
  /// Its gestures leave the stream without being reset: see `clear`.
  ~GestureArbiter();
  GestureArbiter(const GestureArbiter&) = delete;
  GestureArbiter& operator=(const GestureArbiter&) = delete;

  /// The gesture joins the stream from UNDETERMINED, unless it is in it already.
  void record(int tag);
  bool recorded(int tag) const;
  /// The order a touch event reaches the gestures: active ones first, then
  /// awaiting ones, each the latest to activate or start waiting first (RNGH's
  /// comparator), then the rest in the order they were recorded.
  std::vector<int> order() const;
  bool awaiting(int tag) const;
  bool active(int tag) const;
  /// True once after the gesture is let through to activate: its progress
  /// restarts from the next event, so values do not jump.
  bool takeResetProgress(int tag);
  bool anyActive() const;

  /// Around one touch event's delivery: finished gestures leave the stream
  /// after it, not while it is delivered.
  void beginTouch() { handlingTouch_ = true; }
  void endTouch();
  /// The touch stream was cancelled: every gesture is.
  void cancelAll();
  /// A native view took the touch: the app's gestures (non-negative tags) give it up.
  void cancelApp();
  /// The root goes: every gesture in the stream ends CANCELLED and is reset,
  /// telling the app nothing, so a recognizer's timer that fires later changes
  /// nothing. Call before destroying an arbiter whose host still stands.
  void clear();

private:
  friend class GestureTable;
  using Gesture = GestureTable::Gesture;

  /// While a change is handled, finished gestures stay in the stream; the
  /// count unwinds with an exception from the host too.
  struct Changing {
    explicit Changing(GestureArbiter& arbiter) : arbiter(arbiter) { ++arbiter.handlingChange_; }
    ~Changing() { --arbiter.handlingChange_; }
    Changing(const Changing&) = delete;
    Changing& operator=(const Changing&) = delete;
    GestureArbiter& arbiter;
  };

  Gesture& gesture(int tag) { return table_.gestures_.at(tag); }
  const Gesture& gesture(int tag) const { return table_.gestures_.at(tag); }
  void stateChanged(int tag, State now, State before);
  void stateChangedWhileChanging(int tag, State now, State before);
  void tryActivate(int tag);
  void makeActive(int tag);
  void addAwaiting(int tag);
  void cleanupAwaiting();
  void scheduleCleanup();
  void cleanupFinished();
  void forget(int tag);
  bool waitsFor(int tag, int other) const;
  bool simultaneous(int a, int b) const;
  bool hasOtherToWaitFor(int tag) const;
  bool cancelledByFinished(int tag) const;
  bool cancelledByActive(int tag) const;
  bool cancelledBy(int tag, int other) const;
  bool isAwaitingListed(int tag) const;

  GestureTable& table_;
  GestureHost& host_;
  std::vector<int> gestures_;
  std::vector<int> awaiting_;
  bool handlingTouch_ = false;
  int handlingChange_ = 0;
  bool cleanupScheduled_ = false;
  int activationIndex_ = 0;
};

} // namespace kuito::gestures
