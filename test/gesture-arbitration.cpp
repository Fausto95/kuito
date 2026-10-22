// Gesture arbitration as both renderers ran it in Swift and Kotlin: the cases
// come from RNGH's interaction rules each platform ported
// (KuitoGestureHandler.swift's delegate, GestureHandlerInteractionManager.kt)
// and from the orchestrator Android ported (GestureHandlerOrchestrator.kt and
// GestureHandler.kt's state changes).
#include "check.h"
#include "gestures/GestureArbiter.h"
#include "gestures/GestureEvents.h"
#include "gestures/GestureRelations.h"
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

using namespace kuito::gestures;

namespace {

void unrelatedGesturesNeitherWaitNorRunTogether() {
  GestureRelations relations;
  relations.set(1, {});
  relations.set(2, {});
  CHECK(!relations.waitsFor(1, 2));
  CHECK(!relations.waitsFor(2, 1));
  CHECK(!relations.simultaneous(1, 2));
  CHECK(relations.awaited(1).empty());
}

void aGestureRunsAlongsideItselfAndNeverWaitsForItself() {
  GestureRelations relations;
  relations.set(1, {{1}, {}, {1}});
  CHECK(relations.simultaneous(1, 1));
  CHECK(!relations.waitsFor(1, 1));
  CHECK(relations.awaited(1).empty());
}

void waitForMakesTheGestureWaitNotTheOther() {
  GestureRelations relations;
  relations.set(1, {{2}, {}, {}});
  relations.set(2, {});
  CHECK(relations.waitsFor(1, 2));
  CHECK(!relations.waitsFor(2, 1));
  CHECK(!relations.simultaneous(1, 2));
}

// blocksHandlers is waitFor seen from the other side: the blocked gesture
// waits.
void blocksMakesTheOtherGestureWait() {
  GestureRelations relations;
  relations.set(1, {{}, {}, {2}});
  relations.set(2, {});
  CHECK(relations.waitsFor(2, 1));
  CHECK(!relations.waitsFor(1, 2));
}

void simultaneousGoesBothWaysFromEitherSide() {
  GestureRelations relations;
  relations.set(1, {{}, {2}, {}});
  relations.set(2, {});
  CHECK(relations.simultaneous(1, 2));
  CHECK(relations.simultaneous(2, 1));
  CHECK(!relations.waitsFor(1, 2));
}

// A new value replaces all three relations: one left out is empty.
void aNewValueReplacesEveryRelation() {
  GestureRelations relations;
  relations.set(1, {{2}, {3}, {4}});
  relations.set(1, {{}, {}, {5}});
  CHECK(!relations.waitsFor(1, 2));
  CHECK(!relations.simultaneous(1, 3));
  CHECK(!relations.waitsFor(4, 1));
  CHECK(relations.waitsFor(5, 1));
}

// Relations name gestures by tag: they hold before the other gesture exists,
// and a dropped gesture's own relations go while others' naming it stay.
void relationsNameGesturesByTag() {
  GestureRelations relations;
  relations.set(1, {{9}, {8}, {}});
  CHECK(relations.waitsFor(1, 9));
  CHECK(relations.simultaneous(8, 1));

  relations.set(2, {{}, {}, {1}});
  relations.drop(1);
  CHECK(!relations.waitsFor(1, 9));
  CHECK(!relations.simultaneous(8, 1));
  CHECK(relations.waitsFor(1, 2));
}

void clearDropsEveryGesturesRelations() {
  GestureRelations relations;
  relations.set(1, {{2}, {3}, {}});
  relations.set(2, {{}, {}, {1}});
  relations.clear();
  CHECK(!relations.waitsFor(1, 2));
  CHECK(!relations.simultaneous(1, 3));
}

// The gestures one waits for: its own waitFor, then every gesture that blocks
// it, each once.
void awaitedJoinsWaitForAndTheGesturesThatBlock() {
  GestureRelations relations;
  relations.set(1, {{4, 2}, {}, {}});
  relations.set(2, {{}, {}, {1}});
  relations.set(3, {{}, {}, {1, 7}});
  relations.set(5, {{}, {}, {6}});
  CHECK((relations.awaited(1) == std::vector<int>{4, 2, 3}));
  CHECK(relations.awaited(7) == std::vector<int>{3});
  CHECK(relations.awaited(5).empty());
}

// Stands in for a renderer: which pointers each gesture tracks, which view
// holds which, and what the arbiter asked of it.
struct Host final : GestureHost {
  std::unordered_map<int, std::set<int>> pointers;
  std::unordered_map<int, int> parents;
  std::vector<std::string> log;
  GestureTable table;
  GestureArbiter arbiter{table, *this};

  bool sharePointers(int a, int b) override {
    for (int pointer : pointers[a])
      if (pointers[b].count(pointer))
        return true;
    return false;
  }
  bool inside(int gesture, int other) override {
    for (auto parent = parents.find(gesture); parent != parents.end();
         parent = parents.find(parent->second))
      if (parent->second == other)
        return true;
    return false;
  }
  void cancelling(int tag) override {
    log.push_back("cancelling " + std::to_string(tag));
  }
  // The recognizer hears its own change while the arbiter still has it: a
  // finished gesture leaves the stream after.
  void changed(int tag, State, State) override { CHECK(arbiter.recorded(tag)); }
  void send(int tag, State now, State before) override {
    log.push_back(std::to_string(tag) + ": " + name(before) + " -> " +
                  name(now));
  }
  void reset(int tag) override {
    log.push_back("reset " + std::to_string(tag));
  }

  static std::string name(State state) {
    switch (state) {
    case State::Undetermined:
      return "UNDETERMINED";
    case State::Failed:
      return "FAILED";
    case State::Began:
      return "BEGAN";
    case State::Cancelled:
      return "CANCELLED";
    case State::Active:
      return "ACTIVE";
    case State::End:
      return "END";
    }
    return "?";
  }

  /// Records the gestures for one pointer, as a new pointer's touch finds them.
  void touch(std::vector<int> tags, int pointer = 0) {
    for (int tag : tags) {
      arbiter.record(tag);
      pointers[tag].insert(pointer);
    }
  }
  /// The log since the last call.
  std::vector<std::string> take() { return std::exchange(log, {}); }
};

using Log = std::vector<std::string>;

void aLoneGestureSendsEveryChange() {
  Host host;
  host.touch({1});
  host.table.begin(1);
  host.table.activate(1);
  host.table.end(1);
  CHECK((host.take() == Log{"1: UNDETERMINED -> BEGAN", "1: BEGAN -> ACTIVE",
                            "1: ACTIVE -> END", "reset 1"}));
  CHECK(host.table.state(1) == State::End);
  CHECK(!host.arbiter.recorded(1));
}

// Each change leaves only the states RNGH lets it leave.
void changesLeaveOnlyTheirStates() {
  Host host;
  host.touch({1});
  host.arbiter.beginTouch();
  host.table.end(1);
  host.table.begin(1);
  host.table.begin(1);
  host.table.activate(1);
  host.table.activate(1);
  host.table.end(1);
  host.table.fail(1);
  host.table.cancel(1);
  host.arbiter.endTouch();
  CHECK((host.take() == Log{"1: UNDETERMINED -> BEGAN", "1: BEGAN -> ACTIVE",
                            "1: ACTIVE -> END", "reset 1"}));
}

// A gesture cancelled before it began tells the app nothing: no onFinalize
// without onBegin.
void aGestureCancelledBeforeItBeganSendsNothing() {
  Host host;
  host.touch({1});
  host.table.cancel(1);
  CHECK((host.take() == Log{"cancelling 1", "reset 1"}));
  CHECK(host.table.state(1) == State::Cancelled);
}

void aGestureNoArbiterRecordedCannotChange() {
  Host host;
  bool threw = false;
  try {
    host.table.begin(1);
  } catch (const std::logic_error &) {
    threw = true;
  }
  CHECK(threw);

  // Once it left the stream, a change it cannot make is still a no-op.
  host.touch({2});
  host.table.begin(2);
  host.table.fail(2);
  host.take();
  host.table.fail(2);
  host.table.end(2);
  CHECK(host.take().empty());
}

void aGestureThatWaitsActivatesWhenTheOtherFails() {
  Host host;
  host.table.relations.set(1, {{2}, {}, {}});
  host.touch({1, 2});
  host.table.begin(1);
  host.table.begin(2);
  host.table.activate(1);
  CHECK(host.arbiter.awaiting(1));
  CHECK(!host.arbiter.active(1));
  host.table.fail(2);
  CHECK(host.arbiter.active(1));
  CHECK(host.arbiter.takeResetProgress(1));
  CHECK(!host.arbiter.takeResetProgress(1));
  CHECK((host.take() == Log{"1: UNDETERMINED -> BEGAN",
                            "2: UNDETERMINED -> BEGAN", "1: BEGAN -> ACTIVE",
                            "2: BEGAN -> FAILED", "reset 2"}));
}

void aGestureThatWaitsIsCancelledWhenTheOtherEnds() {
  Host host;
  host.table.relations.set(2, {{}, {}, {1}});
  host.touch({1, 2});
  host.table.begin(1);
  host.table.begin(2);
  host.table.activate(1);
  host.table.activate(2);
  host.table.end(2);
  CHECK(host.table.state(1) == State::Cancelled);
  CHECK((host.take() == Log{"1: UNDETERMINED -> BEGAN",
                            "2: UNDETERMINED -> BEGAN", "2: BEGAN -> ACTIVE",
                            "cancelling 1", "1: BEGAN -> CANCELLED",
                            "2: ACTIVE -> END", "reset 2", "reset 1"}));
}

// A tap ends at once when it activates; while it waits, the app hears of
// neither, then of both when the other fails.
void aDiscreteGestureThatEndedWhileWaitingSendsItsActivationLater() {
  Host host;
  host.table.relations.set(1, {{2}, {}, {}});
  host.touch({1, 2});
  host.arbiter.beginTouch();
  host.table.begin(1);
  host.table.begin(2);
  host.table.activate(1);
  host.table.end(1);
  CHECK(host.arbiter.awaiting(1));
  host.table.fail(2);
  host.arbiter.endTouch();
  CHECK((host.take() == Log{"1: UNDETERMINED -> BEGAN",
                            "2: UNDETERMINED -> BEGAN", "1: BEGAN -> ACTIVE",
                            "1: ACTIVE -> END", "2: BEGAN -> FAILED", "reset 2",
                            "reset 1"}));
}

void aDiscreteGestureThatEndedWhileWaitingIsCancelledWhenTheOtherEnds() {
  Host host;
  host.table.relations.set(1, {{2}, {}, {}});
  host.touch({1, 2});
  host.arbiter.beginTouch();
  host.table.begin(1);
  host.table.begin(2);
  host.table.activate(1);
  host.table.end(1);
  host.table.activate(2);
  host.table.end(2);
  host.arbiter.endTouch();
  CHECK(host.table.state(1) == State::Cancelled);
  CHECK((host.take() == Log{"1: UNDETERMINED -> BEGAN",
                            "2: UNDETERMINED -> BEGAN", "2: BEGAN -> ACTIVE",
                            "cancelling 1", "1: BEGAN -> CANCELLED",
                            "2: ACTIVE -> END", "reset 2", "reset 1"}));
}

// Gestures with no relation race: the first to activate cancels the others
// on the same pointer, and leaves alone those on other pointers.
void theFirstGestureToActivateCancelsTheOthersOnItsPointer() {
  Host host;
  host.touch({1, 2});
  host.touch({3}, 1);
  host.table.begin(1);
  host.table.begin(2);
  host.table.begin(3);
  host.table.activate(1);
  CHECK(host.table.state(2) == State::Cancelled);
  CHECK(host.table.state(3) == State::Began);
  CHECK((host.take() ==
         Log{"1: UNDETERMINED -> BEGAN", "2: UNDETERMINED -> BEGAN",
             "3: UNDETERMINED -> BEGAN", "cancelling 2",
             "2: BEGAN -> CANCELLED", "1: BEGAN -> ACTIVE", "reset 2"}));
}

void simultaneousGesturesActivateTogether() {
  Host host;
  host.table.relations.set(1, {{}, {2}, {}});
  host.touch({1, 2});
  host.table.begin(1);
  host.table.begin(2);
  host.table.activate(1);
  host.table.activate(2);
  CHECK(host.arbiter.active(1) && host.arbiter.active(2));
  CHECK((host.arbiter.order() == std::vector<int>{2, 1}));
}

// A gesture inside an active one's view cannot activate on the same pointer.
void anActiveAncestorCancelsADescendantThatActivates() {
  Host host;
  host.parents[1] = 2;
  host.touch({1, 2});
  host.table.begin(1);
  host.table.begin(2);
  host.table.relations.set(2, {{}, {1}, {}});
  host.table.activate(2);
  host.table.relations.set(2, {});
  host.table.activate(1);
  CHECK(host.table.state(1) == State::Cancelled);
  CHECK(host.arbiter.active(2));
}

// A gesture waiting or active gives way only to a root's own gesture
// (negative tags), not to an app gesture that activates.
void onlyARootCancelsAGestureThatWaitsOrIsActive() {
  Host host;
  host.table.relations.set(1, {{3}, {}, {}});
  host.touch({1, 2, -1});
  host.touch({3}, 1);
  host.table.begin(-1);
  host.table.begin(1);
  host.table.begin(3);
  host.table.activate(1);
  host.table.begin(2);
  host.table.relations.set(2, {{}, {-1}, {}});
  host.table.activate(2);
  CHECK(host.arbiter.awaiting(1));
  CHECK(host.arbiter.active(2));
  host.table.relations.set(2, {});
  host.table.activate(-1);
  CHECK(host.table.state(1) == State::Cancelled);
  CHECK(host.table.state(2) == State::Cancelled);
}

// Among active gestures, the latest to activate comes first, as RNGH's
// comparator sorts them.
void touchesReachActiveThenAwaitingThenTheRest() {
  Host host;
  host.table.relations.set(1, {{4}, {}, {}});
  host.touch({1, 3});
  host.touch({4}, 3);
  host.touch({2}, 1);
  host.touch({5}, 2);
  for (int tag : {1, 2, 3, 4, 5})
    host.table.begin(tag);
  host.table.activate(1);
  host.table.activate(3);
  host.table.activate(2);
  CHECK((host.arbiter.order() == std::vector<int>{2, 3, 1, 4, 5}));
  CHECK(host.arbiter.anyActive());
}

// Finished gestures leave the stream after the touch event is delivered.
void finishedGesturesLeaveAfterTheTouch() {
  Host host;
  host.touch({1, 2});
  host.arbiter.beginTouch();
  host.table.begin(1);
  host.table.fail(1);
  CHECK(host.arbiter.recorded(1));
  host.arbiter.endTouch();
  CHECK(!host.arbiter.recorded(1));
  CHECK(host.arbiter.recorded(2));
  CHECK((host.take() ==
         Log{"1: UNDETERMINED -> BEGAN", "1: BEGAN -> FAILED", "reset 1"}));
}

void cancellingTheStreamCancelsWaitingGesturesFirst() {
  Host host;
  host.table.relations.set(1, {{2}, {}, {}});
  host.touch({1, 2});
  host.table.begin(1);
  host.table.begin(2);
  host.table.activate(1);
  host.take();
  host.arbiter.cancelAll();
  CHECK(host.table.state(1) == State::Cancelled);
  CHECK(host.table.state(2) == State::Cancelled);
  CHECK(
      (host.take() == Log{"cancelling 1", "1: BEGAN -> CANCELLED", "reset 1",
                          "cancelling 2", "2: BEGAN -> CANCELLED", "reset 2"}));
}

// A native view takes the touch: the app's gestures go together, so one
// cancelled does not let another that waits for it activate.
void aNativeViewTakingTheTouchCancelsOnlyAppGestures() {
  Host host;
  host.table.relations.set(1, {{2}, {}, {}});
  host.touch({1, 2, -1});
  host.table.begin(-1);
  host.table.begin(1);
  host.table.begin(2);
  host.table.activate(1);
  host.take();
  host.arbiter.cancelApp();
  CHECK(host.table.state(1) == State::Cancelled);
  CHECK(host.table.state(2) == State::Cancelled);
  CHECK(host.table.state(-1) == State::Began);
  for (const std::string &line : host.take())
    CHECK(line.find("ACTIVE") == std::string::npos);
}

void aDroppedGestureLeavesTheStream() {
  Host host;
  host.table.relations.set(1, {{2}, {}, {}});
  host.touch({1, 2});
  host.arbiter.beginTouch();
  host.table.begin(1);
  host.table.cancel(1);
  host.table.drop(1);
  CHECK(!host.arbiter.recorded(1));
  CHECK(host.table.state(1) == State::Undetermined);
  CHECK(!host.table.relations.waitsFor(1, 2));
  host.arbiter.endTouch();
  CHECK((host.arbiter.order() == std::vector<int>{2}));
}

// A gesture that never began tells the app nothing when it fails, as on iOS:
// no onFinalize without onBegin.
void aGestureThatNeverBeganSendsNoFailure() {
  Host host;
  host.touch({1});
  host.table.fail(1);
  CHECK((host.take() == Log{"reset 1"}));
  CHECK(host.table.state(1) == State::Failed);
}

// A gesture that waits for one already active does not begin, as UIKit's
// delegate refuses it on iOS: it fails, unheard.
void aGestureWaitingForAnActiveOneDoesNotBegin() {
  Host host;
  host.table.relations.set(2, {{1}, {}, {}});
  host.touch({1});
  host.table.begin(1);
  host.table.activate(1);
  host.touch({2}, 1);
  host.take();
  host.table.begin(2);
  CHECK(host.table.state(2) == State::Failed);
  CHECK((host.take() == Log{"reset 2"}));
}

// A root that goes ends its gestures without telling the app: a recognizer's
// timer that fires later changes nothing, and another root can record them
// afresh.
void aRootThatGoesEndsItsGesturesSilently() {
  Host host;
  host.touch({1});
  host.touch({2}, 1);
  host.table.begin(1);
  host.table.activate(1);
  host.take();
  host.arbiter.clear();
  CHECK((host.take() == Log{"reset 1", "reset 2"}));
  CHECK(!host.arbiter.recorded(1));
  CHECK(host.table.state(1) == State::Cancelled);
  host.table.fail(2);
  host.table.cancel(1);
  CHECK(host.take().empty());
  host.touch({1});
  host.table.begin(1);
  CHECK((host.take() == Log{"1: UNDETERMINED -> BEGAN"}));
}

// Only a gesture the app heard activate blocks one that waits for it: one
// still waiting itself may yet be cancelled.
void aGestureWaitingForOneThatWaitsBegins() {
  Host host;
  host.table.relations.set(2, {{1}, {}, {}});
  host.table.relations.set(3, {{2}, {}, {}});
  host.touch({1, 2});
  host.touch({3}, 1);
  host.table.begin(1);
  host.table.begin(2);
  host.table.activate(2);
  CHECK(host.arbiter.awaiting(2));
  host.table.begin(3);
  CHECK(host.table.state(3) == State::Began);
}

// A recognizer that throws while the arbiter tells it of a change leaves the
// arbiter able to clean up after the next touch.
void aThrowingRecognizerDoesNotStallTheArbiter() {
  struct Throwing final : GestureHost {
    GestureTable table;
    GestureArbiter arbiter{table, *this};
    bool fail = true;
    bool sharePointers(int, int) override { return true; }
    bool inside(int, int) override { return false; }
    void cancelling(int) override {}
    void changed(int, State, State) override {
      if (std::exchange(fail, false)) throw std::runtime_error("recognizer threw");
    }
    void send(int, State, State) override {}
    void reset(int) override {}
  } host;
  host.arbiter.record(1);
  bool threw = false;
  try {
    host.table.begin(1);
  } catch (const std::runtime_error&) {
    threw = true;
  }
  CHECK(threw);
  host.table.fail(1);
  CHECK(!host.arbiter.recorded(1));
}

std::vector<std::string> changes(State last, State now) {
  std::vector<std::string> lines;
  for (const Change& change : changesFor(last, now)) lines.push_back(Host::name(change.before) + " -> " + Host::name(change.state));
  return lines;
}

// What the app hears as a recognizer UIKit drives moves, given the last state
// it was told (KuitoGestureHandler.swift's sendEvents).
void aRecognizersMovesBecomeTheChangesTheAppHears() {
  CHECK((changes(State::Undetermined, State::Began) == Log{"UNDETERMINED -> BEGAN"}));
  CHECK((changes(State::Began, State::Active) == Log{"BEGAN -> ACTIVE"}));
  CHECK((changes(State::Active, State::End) == Log{"ACTIVE -> END"}));
  CHECK((changes(State::Active, State::Failed) == Log{"ACTIVE -> FAILED"}));
  // A tap ends without UIKit's changed state: it is heard activating first.
  CHECK((changes(State::Began, State::End) == Log{"BEGAN -> ACTIVE", "ACTIVE -> END"}));
  CHECK(changes(State::Active, State::Active).empty());
  // A recognizer set active by hand goes back to began when UIKit catches up.
  CHECK(changes(State::Active, State::Began).empty());
  CHECK(changes(State::End, State::Cancelled).empty());
  CHECK(changes(State::End, State::Failed).empty());
  // Never began: nothing to finish.
  CHECK(changes(State::Undetermined, State::Cancelled).empty());
  CHECK(changes(State::Undetermined, State::Failed).empty());
}

} // namespace

int main() {
  unrelatedGesturesNeitherWaitNorRunTogether();
  aGestureRunsAlongsideItselfAndNeverWaitsForItself();
  waitForMakesTheGestureWaitNotTheOther();
  blocksMakesTheOtherGestureWait();
  simultaneousGoesBothWaysFromEitherSide();
  aNewValueReplacesEveryRelation();
  relationsNameGesturesByTag();
  clearDropsEveryGesturesRelations();
  awaitedJoinsWaitForAndTheGesturesThatBlock();
  aLoneGestureSendsEveryChange();
  changesLeaveOnlyTheirStates();
  aGestureCancelledBeforeItBeganSendsNothing();
  aGestureNoArbiterRecordedCannotChange();
  aGestureThatWaitsActivatesWhenTheOtherFails();
  aGestureThatWaitsIsCancelledWhenTheOtherEnds();
  aDiscreteGestureThatEndedWhileWaitingSendsItsActivationLater();
  aDiscreteGestureThatEndedWhileWaitingIsCancelledWhenTheOtherEnds();
  theFirstGestureToActivateCancelsTheOthersOnItsPointer();
  simultaneousGesturesActivateTogether();
  anActiveAncestorCancelsADescendantThatActivates();
  onlyARootCancelsAGestureThatWaitsOrIsActive();
  touchesReachActiveThenAwaitingThenTheRest();
  finishedGesturesLeaveAfterTheTouch();
  cancellingTheStreamCancelsWaitingGesturesFirst();
  aNativeViewTakingTheTouchCancelsOnlyAppGestures();
  aDroppedGestureLeavesTheStream();
  aGestureThatNeverBeganSendsNoFailure();
  aGestureWaitingForAnActiveOneDoesNotBegin();
  aRecognizersMovesBecomeTheChangesTheAppHears();
  aRootThatGoesEndsItsGesturesSilently();
  aGestureWaitingForOneThatWaitsBegins();
  aThrowingRecognizerDoesNotStallTheArbiter();
  std::cout << "KUITO_GESTURE_ARBITRATION_PASS\n";
}
