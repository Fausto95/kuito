#pragma once

#include <chrono>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <unordered_map>
#include <vector>
#include "EventRecord.h"
#include "FrameLedger.h"
#include "Http.h"
#include "Link.h"
#include "MotionMirror.h"
#include "Socket.h"
#include "MutationQueue.h"
#include "Recording.h"
#include "ViewTable.h"

namespace facebook {
namespace hermes {
class HermesRuntime;
}
namespace jsi {
class Function;
}
} // namespace facebook

namespace kuito {

class InspectorDevice;
class InspectorTarget;
class WorkReader;
class EventSender;

struct AsyncHost {
  std::function<void(int, double)> scheduleTimer;
  std::function<void(int)> cancelTimer;
  HttpHost http;
  SocketHost sockets;
  /// The module functions the app calls, by id (docs/native-modules.md).
  LinkHost link;
  /// console output and uncaught errors: (level, message, stack).
  std::function<void(const std::string&, const std::string&, const std::string&)> log;
  /// A motion value's mirror (MotionMirror::read). Set when the platform has a
  /// UI runtime; the kernel then sends it its UI-thread records (Mutation.h).
  std::function<std::optional<MotionMirror::Entry>(const std::string&)> readMotion;
  /// A motion value's number, if the mirror holds one at least as new as a
  /// JS write (MotionMirror::readNumber). Set with readMotion.
  std::function<MotionMirror::Answer(const std::string&, double)> readMotionNumber;
  /// The frame handoff's FrameHandoff::busy: the kernel holds its re-plans
  /// while the UI thread is behind. Set with readMotion.
  std::function<bool()> busy;
  /// Release shells: the bytecode of the app's chunk `name` (src/runtime/chunks.ts), which
  /// `__kuitoHostLoad` evaluates the first time the kernel requires it; empty when the
  /// shell has none. Without it, every chunk comes in the app's own script.
  std::function<std::string(const std::string& name)> loadChunk;
  /// Runs `evaluate` inside the platform's `Kuito evaluate <url>` trace section.
  std::function<void(const std::string& url, const std::function<void()>& evaluate)> traceEvaluate;
  /// Development builds: debug this runtime as the device's `js` target
  /// (docs/devtools.md). `wakeInspector` calls `Runtime::inspect` soon on the
  /// VM thread; it is called from any thread.
  std::shared_ptr<InspectorDevice> inspector;
  std::function<void()> wakeInspector;
  /// Development builds: keep every settled batch (`Runtime::recording`).
  bool record = false;
};

/// JavaScript that threw while a script was evaluated: `what()` is
/// `Name: message`, `stack` the engine's stack trace.
class ScriptError final : public std::runtime_error {
public:
  ScriptError(const std::string& message, std::string stack) : std::runtime_error(message), stack(std::move(stack)) {}
  const std::string stack;
};

// Single-owner Hermes VM. All entry points, timer and network completions
// must run on a dedicated serialized VM thread. Native UI commits go to the UI thread.
// Each entry point is a job: the kernel commits its view mutations with
// `__kuitoHostCommit`, the ViewTable checks each batch whole, and the job's
// batches reach `sink` together when it ends, or not at all when it throws.
// `evaluate` throws ScriptError for its caller; an error thrown by an event,
// timer or request callback has no caller and goes to the host log instead.
class Runtime final {
public:
  /// `sink` gets each job's mutations, how many `__kuitoHostCommit` calls
  /// carried them, and the job: its number and why it ran (FrameLedger.h).
  using Sink = std::function<void(std::vector<Mutation>, std::size_t, JobCause)>;
  explicit Runtime(Sink sink, AsyncHost asyncHost = {});
  ~Runtime();
  Runtime(const Runtime&) = delete;
  Runtime& operator=(const Runtime&) = delete;

  void evaluate(const std::string& source, const std::string& url);
  /// A native event: `handle` is the view's id, or 0 for the app, with its
  /// payload's record (docs/events.md#typed-events).
  void dispatch(std::uint32_t handle, const std::string& event, const EventRecord& record);
  void fireTimer(int id);
  /// The platform's answers to `HttpHost::start`, in this order (native/shared/Http.h).
  void httpHead(int id, int status, const std::string& url, const HttpHeaders& headers);
  void httpChunk(int id, std::vector<std::uint8_t> chunk);
  void httpEnd(int id, std::vector<std::uint8_t> body, const std::string& error);
  /// `total` is -1 when unknown.
  void httpProgress(int id, double bytes, double total);
  /// The platform's answers to `SocketHost::open` (native/shared/Socket.h).
  void socketOpen(int id, const std::string& protocol);
  void socketMessage(int id, SocketMessage message);
  void socketError(int id, const std::string& message);
  void socketClose(int id, int code, const std::string& reason, bool wasClean);
  /// Settles linked call `call` with what its function answered.
  void settleLinkCall(int call, const LinkResult& result);
  /// What the platform sent for observed event or live value `member`.
  void emitLinkEvent(int member, const LinkValue& value);
  /// Runs what an attached debugger queued, as a job of its own.
  void inspect();
  /// Every batch this runtime committed so far, as a `.krec` file (native/shared/Recording.h).
  /// Throws std::logic_error on a runtime that does not record.
  std::string recording() const;

private:
  void installLink();
  void runCallback(JobCause::Entry entry, const std::function<void()>& work);
  /// Numbers the job that starts now and notes why it runs.
  void startJob(JobCause::Entry entry, std::uint32_t handle = 0, const std::string& event = {});
  void flushMutations();
  void discardMutations();
  void countWork();
  void releaseLinkCalls();
  Sink sink_;
  std::uint64_t jobs_ = 0;
  /// The running job's number and cause.
  JobCause job_;
  MutationQueue pending_;
  /// The running job's `__kuitoHostCommit` calls.
  std::size_t commits_ = 0;
  ViewTable views_;
  /// Async linked calls of the running job by call number, sent after its mutations (docs/native-modules.md).
  std::vector<std::pair<int, std::function<void()>>> linkCalls_;
  LinkSignatures linkSignatures_;
  /// Each pending async call's function, whose signature types its result.
  std::unordered_map<int, int> linkCallFunctions_;
  std::unique_ptr<facebook::hermes::HermesRuntime> runtime_;
  /// The kernel's work counters, read after each job; goes before the runtime.
  std::unique_ptr<WorkReader> work_;
  /// Writes typed events into the kernel's record; goes before the runtime.
  std::unique_ptr<EventSender> events_;
  AsyncHost asyncHost_;
  std::unordered_map<int, std::unique_ptr<facebook::jsi::Function>> timers_;
  std::shared_ptr<InspectorTarget> inspected_;
  std::unique_ptr<Recorder> recorder_;
  std::chrono::steady_clock::time_point started_ = std::chrono::steady_clock::now();
};

} // namespace kuito
