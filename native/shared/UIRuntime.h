#pragma once

#include <chrono>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <utility>
#include <vector>
#include "EventRecord.h"
#include "FrameHandoff.h"
#include "Link.h"
#include "MotionMirror.h"
#include "MutationQueue.h"
#include "NestedBatch.h"

namespace facebook {
namespace hermes {
class HermesRuntime;
}
} // namespace facebook

namespace kuito {

class InspectorDevice;
class InspectorTarget;
class WorkReader;
class EventSender;

struct UIHost {
  /// One job's batch from the handoff, applied before returning. Its UI,
  /// UIKernel, UIScript and UIBundle records go back to receive() (by their
  /// index in the batch), load(), evaluate() and loadBundle(), in order.
  std::function<void(Batch&)> applyBatch;
  /// A drain left no batch waiting.
  std::function<void()> framesCommitted;
  /// The handoff was busy and a drain caught up: the JS thread's `host.idle`.
  std::function<void()> idle;
  /// Props the UI kernel wrote, applied before returning: Prop mutations.
  std::function<void(const std::vector<Mutation>&)> applyProps;
  /// A message for the JS thread's kernel, as plain data: the app's `ui` event (docs/events.md).
  std::function<void(PlainValue)> sendEvent;
  /// (level, message, stack), as the JS runtime's log.
  std::function<void(const std::string&, const std::string&, const std::string&)> log;
  /// Runs a module's main-thread function on this thread and returns what it
  /// answered: UI-thread code calls it with no hop (docs/native-modules.md).
  std::function<LinkResult(int function, std::vector<LinkValue> arguments)> callLinked;
  /// A linked member's signature, as `LinkHost::signature`: for `callLinked` and `platform`.
  std::function<std::string(int member)> linkSignature;
  /// As `LinkHost::allocate`.
  LinkAllocate linkAllocate;
  /// Call drain() once on the next display frame. Asked again while batches
  /// wait or the UI kernel animates.
  std::function<void()> requestFrame;
  /// Development builds: debug this runtime as the device's `ui` target
  /// (docs/devtools.md). `wakeInspector` calls `UIRuntime::inspect` soon on the
  /// UI thread; it is called from any thread.
  std::shared_ptr<InspectorDevice> inspector;
  std::function<void()> wakeInspector;
};

// The Hermes runtime on the platform UI thread, running the UI kernel
// (src/ui-thread). Every entry point must be called on the UI thread; each one
// applies the props it produced before returning, so they land in the frame
// being built. Errors go to the host log and discard that entry's props.
// Entries nest (a view fires an event while props are applied): the outermost
// one drains microtasks and applies every nested entry's props after its own.
class UIRuntime final {
public:
  UIRuntime(UIHost host, std::shared_ptr<MotionMirror> mirror, std::shared_ptr<FrameHandoff> handoff);
  ~UIRuntime();
  UIRuntime(const UIRuntime&) = delete;
  UIRuntime& operator=(const UIRuntime&) = delete;

  /// The UI kernel the shell ships, ui.hbc, if it is the one the kernel names
  /// by `hash` (UIKernel.h); otherwise the UI thread stays off and the host
  /// log says why.
  void load(std::string bytecode, const std::string& hash);
  /// Each revision of the app's UI bundle; none after a UI kernel that did not load.
  void evaluate(const std::string& source, const std::string& url);
  /// A release build's UI bundle, the app-ui.hbc the shell ships, if it is the
  /// one the app names by `hash` (UIKernel.h); otherwise the host log says why.
  void loadBundle(std::string bytecode, const std::string& hash, const std::string& url);
  /// The JS-thread kernel's operations: the UI record at `index` of the batch
  /// applyBatch is applying, as plain data (no JSON; docs/native-scheduling.md).
  void receive(std::size_t index);
  /// A native event with its payload's record (docs/events.md#typed-events).
  /// False: no UI-thread handler read it; send the same record to JS.
  bool event(std::uint32_t handle, const std::string& event, const EventRecord& record);
  /// A module's motion value the platform set (`motion<T>()` in its spec). One
  /// set before the UI kernel runs is kept, the latest per member, until it does.
  void platform(int member, LinkValue value);
  /// The display frame, the one place UI work runs on it: the batches the JS
  /// thread sent, for up to `budgetMs` and at least one, then the UI kernel's
  /// frame. `now` in milliseconds on a monotonic clock.
  void drain(double now, double budgetMs);
  /// Runs what an attached debugger queued.
  void inspect();

private:
  template <class Work>
  bool run(const char* what, Work&& work);
  void frame(double now);
  void drainBatches(std::chrono::steady_clock::time_point deadline);
  bool offer(std::uint32_t handle, const std::string& event, const EventRecord& record);
  UIHost host_;
  std::shared_ptr<MotionMirror> mirror_;
  std::shared_ptr<FrameHandoff> handoff_;
  /// The UI kernel asked for a frame.
  bool frameDue_ = false;
  /// The display frame time of the last drain.
  double lastDrain_ = -1;
  /// The UI records' operations of the batch applyBatch is applying, by record index.
  std::vector<std::pair<std::size_t, PlainValue>> operations_;
  std::unique_ptr<facebook::hermes::HermesRuntime> runtime_;
  /// The UI kernel's work counters, read after each entry; goes before the runtime.
  std::unique_ptr<WorkReader> work_;
  /// Writes typed events into the UI kernel's record; goes before the runtime.
  std::unique_ptr<EventSender> events_;
  NestedBatch<Mutation> props_;
  bool booted_ = false;
  /// load() ran, whether or not the UI kernel it was given booted.
  bool loaded_ = false;
  std::vector<std::pair<int, LinkValue>> early_;
  LinkSignatures linkSignatures_;
  std::shared_ptr<InspectorTarget> inspected_;
};

} // namespace kuito
