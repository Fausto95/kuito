#pragma once

#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace facebook {
namespace hermes {
class HermesRuntime;
}
} // namespace facebook

namespace kuito {

class InspectorDevice;

/// One runtime's CDP agent. Commands arrive on any thread; the agent's work
/// runs on the runtime's thread through `drain`, or, while JavaScript runs or
/// is paused, inside Hermes's debugger loop.
class InspectorTarget final : public std::enable_shared_from_this<InspectorTarget> {
public:
  ~InspectorTarget();
  InspectorTarget(const InspectorTarget&) = delete;
  InspectorTarget& operator=(const InspectorTarget&) = delete;

  /// Runs the agent's queued work. On the runtime's thread, between JavaScript jobs.
  void drain();

  /// Hermes's debugger API and the session's agent, where the build has them.
  struct Agent;

private:
  friend class InspectorDevice;
  InspectorTarget(std::string id, std::string title, std::function<void()> wake);
  const std::string id_;
  const std::string title_;
  std::function<void()> wake_;
  std::unique_ptr<Agent> agent_;
};

/// The device side of the dev server's inspector proxy (docs/devtools.md):
/// frames from one socket, routed to the CDP agents Hermes provides for each
/// runtime. Frames are fields joined by U+001F: `connect`/`disconnect` and a
/// target, or `cdp`, a target and a CDP message; the device answers with `cdp`
/// frames and announces its runtimes in a `targets` frame. `panel` frames carry
/// the Components panel's messages to and from the kernel
/// (`__kuitoDevtools.receive`, `__kuitoHostDevtools`).
///
/// A frontend's session outlives the runtime it debugs: when a reload or a
/// new UI runtime brings back a target of the same id, its agent resumes with
/// the session's breakpoints and enabled domains.
///
/// Development builds only (KUITO_INSPECTOR); elsewhere `attach` returns null.
class InspectorDevice final : public std::enable_shared_from_this<InspectorDevice> {
public:
  /// `send` writes one frame to the socket, from any thread.
  explicit InspectorDevice(std::function<void(const std::string&)> send);
  ~InspectorDevice();
  InspectorDevice(const InspectorDevice&) = delete;
  InspectorDevice& operator=(const InspectorDevice&) = delete;

  /// A frame from the proxy. Any thread, typically the socket's.
  void receive(const std::string& frame);
  /// The socket (re)connected: the proxy learns the targets again.
  void opened();
  /// The socket dropped: every session ends.
  void closed();

  /// Makes `runtime` inspectable as `id` and installs `__kuitoHostConsole` in
  /// it. On the runtime's thread; `wake` must call `InspectorTarget::drain`
  /// there soon, from any thread.
  std::shared_ptr<InspectorTarget> attach(const std::string& id, const std::string& title,
                                          facebook::hermes::HermesRuntime& runtime, std::function<void()> wake);
  /// On the runtime's thread, before the runtime is destroyed.
  void detach(const std::shared_ptr<InspectorTarget>& target);

private:
  struct Saved;
  static std::unique_ptr<Saved> takeSession(InspectorTarget::Agent& agent, bool closing);
  static std::string contextsCleared(const std::string& id);
  void announce();
  std::function<void(const std::string&)> forward(const std::string& id);
  std::function<void(const std::string&)> send_;
  std::mutex mutex_;
  std::unordered_map<std::string, std::shared_ptr<InspectorTarget>> targets_;
  /// Targets with a frontend attached, and their state while the runtime is away.
  std::unordered_set<std::string> sessions_;
  std::unordered_map<std::string, std::unique_ptr<Saved>> saved_;
};

} // namespace kuito
