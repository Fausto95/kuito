#include "Inspector.h"

#if KUITO_INSPECTOR
#include <hermes/DebuggerAPI.h>
#include <hermes/cdp/CDPAgent.h>
#include <hermes/cdp/CDPDebugAPI.h>
#include <hermes/hermes.h>
#include <jsi/jsi.h>
#include <atomic>
#include <chrono>
#include <deque>
#include <exception>
#include <utility>
#endif

namespace kuito {

#if KUITO_INSPECTOR
namespace cdp = facebook::hermes::cdp;
namespace jsi = facebook::jsi;
using facebook::hermes::HermesRuntime;
using facebook::hermes::debugger::RuntimeTask;

namespace {
const std::string kSeparator = "\x1f";

const std::unordered_map<std::string, cdp::ConsoleAPIType>& consoleTypes() {
  static const std::unordered_map<std::string, cdp::ConsoleAPIType> types = {
      {"log", cdp::ConsoleAPIType::kLog},     {"info", cdp::ConsoleAPIType::kInfo},
      {"debug", cdp::ConsoleAPIType::kDebug}, {"warn", cdp::ConsoleAPIType::kWarning},
      {"error", cdp::ConsoleAPIType::kError},
  };
  return types;
}

/// Each agent gets its own context id: DevTools tells a reloaded runtime's
/// context from the one before it.
int nextContext() {
  static std::atomic<int> last{0};
  return ++last;
}

/// Hermes's agent leaves announcing the execution context to its integrator;
/// without it DevTools has no context to evaluate console input in.
std::string contextCreated(int context, const std::string& title) {
  const auto id = std::to_string(context);
  return "{\"method\":\"Runtime.executionContextCreated\",\"params\":{\"context\":{\"id\":" + id +
         ",\"origin\":\"\",\"name\":\"" + title + "\",\"uniqueId\":\"" + id + "\"}}}";
}

std::string quoted(const std::string& text) {
  std::string out = "\"";
  for (char c : text) {
    if (c == '"' || c == '\\') out += '\\';
    out += c;
  }
  return out + "\"";
}
} // namespace

struct InspectorDevice::Saved {
  cdp::State state;
  int context;
};

struct InspectorTarget::Agent {
  explicit Agent(HermesRuntime& runtime) : runtime(runtime), api(cdp::CDPDebugAPI::create(runtime)) {}

  HermesRuntime& runtime;
  /// Runtime thread only. Null once closed.
  std::unique_ptr<cdp::CDPDebugAPI> api;
  /// The kernel's console methods, released on the runtime's thread while it lives.
  std::vector<std::unique_ptr<jsi::Function>> methods;

  // Separate locks: creating or destroying a session enqueues tasks.
  std::mutex sessionMutex;
  std::unique_ptr<cdp::CDPAgent> session;
  int context = 0;
  /// False once the runtime is going: no session may start after that.
  bool open = true;

  std::mutex taskMutex;
  std::deque<RuntimeTask> tasks;
};

InspectorTarget::InspectorTarget(std::string id, std::string title, std::function<void()> wake)
    : id_(std::move(id)), title_(std::move(title)), wake_(std::move(wake)) {}

InspectorTarget::~InspectorTarget() = default;

void InspectorTarget::drain() {
  std::deque<RuntimeTask> tasks;
  {
    std::lock_guard<std::mutex> lock(agent_->taskMutex);
    tasks.swap(agent_->tasks);
  }
  if (!agent_->api) return;
  // One failing task must not drop the ones behind it: DevTools waits on each.
  std::exception_ptr failure;
  for (auto& task : tasks) {
    try {
      task(agent_->runtime);
    } catch (...) {
      if (!failure) failure = std::current_exception();
    }
  }
  if (failure) std::rethrow_exception(failure);
}

namespace {
void enqueue(const std::weak_ptr<InspectorTarget>& weak, InspectorTarget::Agent& agent,
             const std::function<void()>& wake, RuntimeTask task) {
  {
    std::lock_guard<std::mutex> lock(agent.taskMutex);
    agent.tasks.push_back(std::move(task));
  }
  if (!weak.expired()) wake();
}
} // namespace

InspectorDevice::InspectorDevice(std::function<void(const std::string&)> send) : send_(std::move(send)) {}

InspectorDevice::~InspectorDevice() = default;

std::function<void(const std::string&)> InspectorDevice::forward(const std::string& id) {
  std::weak_ptr<InspectorDevice> weak = weak_from_this();
  return [weak, id](const std::string& message) {
    if (auto device = weak.lock()) device->send_("cdp" + kSeparator + id + kSeparator + message);
  };
}

void InspectorDevice::announce() {
  std::string targets = "[";
  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& [id, target] : targets_) {
      if (targets.size() > 1) targets += ",";
      targets += "{\"id\":" + quoted(id) + ",\"title\":" + quoted(target->title_) + "}";
    }
  }
  send_("targets" + kSeparator + targets + "]");
}

void InspectorDevice::opened() { announce(); }

void InspectorDevice::closed() {
  std::vector<std::shared_ptr<InspectorTarget>> attached;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto& id : sessions_)
      if (auto found = targets_.find(id); found != targets_.end()) attached.push_back(found->second);
    sessions_.clear();
    saved_.clear();
  }
  for (const auto& target : attached) {
    std::lock_guard<std::mutex> lock(target->agent_->sessionMutex);
    target->agent_->session.reset();
  }
}

namespace {
using Session = std::unique_ptr<cdp::CDPAgent>;

/// Starts a session on `target`, resuming `state` when a runtime came back.
void connect(const std::shared_ptr<InspectorTarget>& target, InspectorTarget::Agent& agent,
             const std::function<void()>& wake, std::function<void(const std::string&)> send, cdp::State state,
             bool resumed) {
  std::lock_guard<std::mutex> lock(agent.sessionMutex);
  agent.session.reset();
  if (!agent.open) return;
  std::weak_ptr<InspectorTarget> weak = target;
  agent.context = nextContext();
  agent.session = cdp::CDPAgent::create(
      agent.context, *agent.api,
      [weak, &agent, wake](RuntimeTask task) { enqueue(weak, agent, wake, std::move(task)); }, std::move(send),
      std::move(state));
  // The saved state keeps breakpoints, not enabled domains, and DevTools
  // enables them once per connection: enable them again for it.
  if (resumed) {
    agent.session->enableRuntimeDomain();
    agent.session->enableDebuggerDomain();
  }
}
} // namespace

void InspectorDevice::receive(const std::string& frame) {
  auto first = frame.find(kSeparator);
  if (first == std::string::npos) return;
  auto second = frame.find(kSeparator, first + 1);
  const std::string type = frame.substr(0, first);
  const std::string id = frame.substr(first + 1, second == std::string::npos ? std::string::npos : second - first - 1);
  std::shared_ptr<InspectorTarget> target;
  bool session = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (type == "connect") sessions_.insert(id);
    if (type == "disconnect") sessions_.erase(id);
    // A frontend that connects or leaves starts the next session fresh.
    if (type != "cdp") saved_.erase(id);
    session = sessions_.count(id) > 0;
    if (auto found = targets_.find(id); found != targets_.end()) target = found->second;
  }
  if (!target) return;
  auto& agent = *target->agent_;

  using Handler = std::function<void(InspectorDevice&)>;
  const std::unordered_map<std::string, Handler> handlers = {
      {"connect",
       [&](InspectorDevice& device) {
         connect(target, agent, target->wake_, device.forward(id), cdp::State(), false);
       }},
      {"disconnect",
       [&](InspectorDevice&) {
         std::lock_guard<std::mutex> lock(agent.sessionMutex);
         agent.session.reset();
       }},
      // A Components panel message for the kernel's backend
      // (src/runtime/devtools.ts), run on the runtime's thread as a job.
      {"panel",
       [&](InspectorDevice&) {
         if (second == std::string::npos) return;
         std::weak_ptr<InspectorTarget> weak = target;
         enqueue(weak, agent, target->wake_, [message = frame.substr(second + 1)](HermesRuntime& rt) {
           auto devtools = rt.global().getProperty(rt, "__kuitoDevtools");
           if (!devtools.isObject()) return;
           auto receive = devtools.asObject(rt).getProperty(rt, "receive");
           if (!receive.isObject() || !receive.asObject(rt).isFunction(rt)) return;
           receive.asObject(rt).asFunction(rt).call(rt, jsi::String::createFromUtf8(rt, message));
         });
       }},
      {"cdp",
       [&](InspectorDevice& device) {
         if (!session || second == std::string::npos) return;
         auto message = frame.substr(second + 1);
         std::lock_guard<std::mutex> lock(agent.sessionMutex);
         if (!agent.session) return;
         // As V8 does, the context comes before Runtime.enable's answer. CDP
         // clients send compact JSON, so the method's text is enough to spot it.
         if (message.find("\"method\":\"Runtime.enable\"") != std::string::npos)
           device.forward(id)(contextCreated(agent.context, target->title_));
         agent.session->handleCommand(std::move(message));
       }},
  };
  if (auto handler = handlers.find(type); handler != handlers.end()) handler->second(*this);
}

/// Ends `agent`'s session, keeping its state for the next runtime; `closing`
/// also stops any later session from starting on it.
std::unique_ptr<InspectorDevice::Saved> InspectorDevice::takeSession(InspectorTarget::Agent& agent, bool closing) {
  std::lock_guard<std::mutex> lock(agent.sessionMutex);
  if (closing) agent.open = false;
  std::unique_ptr<Saved> saved;
  if (agent.session) saved.reset(new Saved{agent.session->getState(), agent.context});
  agent.session.reset();
  return saved;
}

/// As on a page navigation: DevTools drops the runtime's scripts and takes
/// the next runtime's afresh. Script ids restart with each runtime, so
/// dropping them one context at a time would collide with the new ones.
std::string InspectorDevice::contextsCleared(const std::string& id) {
  return "cdp" + kSeparator + id + kSeparator + "{\"method\":\"Runtime.executionContextsCleared\"}";
}

std::shared_ptr<InspectorTarget> InspectorDevice::attach(const std::string& id, const std::string& title,
                                                         HermesRuntime& runtime, std::function<void()> wake) {
  std::shared_ptr<InspectorTarget> target(new InspectorTarget(id, title, std::move(wake)));
  target->agent_ = std::make_unique<InspectorTarget::Agent>(runtime);
  auto& agent = *target->agent_;
  // The CPU profiler samples the thread that registered.
  runtime.registerForProfiling();
  std::weak_ptr<InspectorTarget> weak = target;

  // console methods become host functions: their caller, the app's code, is
  // the top of the stack DevTools shows the entry at.
  auto wrap = jsi::Function::createFromHostFunction(
      runtime, jsi::PropNameID::forAscii(runtime, "__kuitoHostConsole"), 2,
      [weak, &agent](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
        if (count != 2 || !args[0].isString() || !args[1].isObject() || !args[1].asObject(rt).isFunction(rt))
          throw jsi::JSError(rt, "__kuitoHostConsole expects (level, method)");
        auto level = args[0].asString(rt).utf8(rt);
        auto type = consoleTypes().find(level);
        if (type == consoleTypes().end()) throw jsi::JSError(rt, "Unknown console level " + level);
        size_t index = agent.methods.size();
        agent.methods.push_back(std::make_unique<jsi::Function>(args[1].asObject(rt).asFunction(rt)));
        return jsi::Function::createFromHostFunction(
            rt, jsi::PropNameID::forUtf8(rt, level), 0,
            [weak, &agent, index, kind = type->second](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* values,
                                                       size_t size) -> jsi::Value {
              if (weak.expired() || index >= agent.methods.size()) return jsi::Value::undefined();
              if (agent.api) {
                std::vector<jsi::Value> copies;
                for (size_t i = 0; i < size; ++i) copies.emplace_back(rt, values[i]);
                double now =
                    std::chrono::duration<double, std::milli>(std::chrono::system_clock::now().time_since_epoch())
                        .count();
                agent.api->addConsoleMessage(
                    cdp::ConsoleMessage(now, kind, std::move(copies), agent.runtime.getDebugger().captureStackTrace()));
              }
              return agent.methods[index]->call(rt, values, size);
            });
      });
  runtime.global().setProperty(runtime, "__kuitoHostConsole", std::move(wrap));

  // The Components backend's way out: panel messages, as JSON.
  std::weak_ptr<InspectorDevice> device = weak_from_this();
  auto devtools = jsi::Function::createFromHostFunction(
      runtime, jsi::PropNameID::forAscii(runtime, "__kuitoHostDevtools"), 1,
      [device, id](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
        if (count != 1 || !args[0].isString()) throw jsi::JSError(rt, "__kuitoHostDevtools expects a message");
        if (auto owner = device.lock())
          owner->send_("panel" + kSeparator + id + kSeparator + args[0].asString(rt).utf8(rt));
        return jsi::Value::undefined();
      });
  runtime.global().setProperty(runtime, "__kuitoHostDevtools", std::move(devtools));

  std::unique_ptr<Saved> saved;
  std::shared_ptr<InspectorTarget> previous;
  bool session = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto found = targets_.find(id); found != targets_.end()) previous = found->second;
    targets_[id] = target;
    session = sessions_.count(id) > 0;
    if (auto found = saved_.find(id); found != saved_.end()) {
      saved = std::move(found->second);
      saved_.erase(found);
    }
  }
  // A new runtime can come up before the one it replaces is gone (Android
  // gives each its own thread): the session moves over now.
  if (session && !saved && previous) {
    saved = takeSession(*previous->agent_, false);
    if (saved) send_(contextsCleared(id));
  }
  if (session) {
    const bool resumed = saved != nullptr;
    connect(target, agent, target->wake_, forward(id), resumed ? std::move(saved->state) : cdp::State(), resumed);
    // A resumed session enabled Runtime before the reload: announce the new context.
    if (resumed) forward(id)(contextCreated(agent.context, title));
  }
  announce();
  return target;
}

void InspectorDevice::detach(const std::shared_ptr<InspectorTarget>& target) {
  if (!target) return;
  const std::string& id = target->id_;
  auto& agent = *target->agent_;
  bool session = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto found = targets_.find(id); found != targets_.end() && found->second == target) targets_.erase(found);
    session = sessions_.count(id) > 0;
  }

  // Null if the session already moved to this runtime's successor.
  std::unique_ptr<Saved> saved = takeSession(agent, true);
  // The agent hands its domains back to this thread to tear down; then the
  // runtime may go. No lock is held while those tasks run.
  target->drain();
  agent.api.reset();
  agent.methods.clear();
  agent.runtime.unregisterForProfiling();

  if (session && saved) {
    send_(contextsCleared(id));
    std::lock_guard<std::mutex> lock(mutex_);
    if (sessions_.count(id)) saved_[id] = std::move(saved);
  }
  announce();
}

#else

struct InspectorDevice::Saved {};
struct InspectorTarget::Agent {};

InspectorDevice::InspectorDevice(std::function<void(const std::string&)> send) : send_(std::move(send)) {}
InspectorDevice::~InspectorDevice() = default;
void InspectorDevice::receive(const std::string&) {}
void InspectorDevice::opened() {}
void InspectorDevice::closed() {}
std::shared_ptr<InspectorTarget> InspectorDevice::attach(const std::string&, const std::string&,
                                                         facebook::hermes::HermesRuntime&, std::function<void()>) {
  return nullptr;
}
void InspectorDevice::detach(const std::shared_ptr<InspectorTarget>&) {}
InspectorTarget::~InspectorTarget() = default;
void InspectorTarget::drain() {}

#endif

} // namespace kuito
