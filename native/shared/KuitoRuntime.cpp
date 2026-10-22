#include "KuitoRuntime.h"
#include "Inspector.h"
#include "JSIHelpers.h"
#include "LinkJSI.h"
#include "Standard.h"

#include <hermes/hermes.h>
#include <jsi/jsi.h>
#include <stdexcept>
#include <utility>

namespace kuito {
namespace jsi = facebook::jsi;

namespace {
// Promise jobs must run on Hermes' microtask queue, which this host drains
// after every job. Its default differs between Hermes builds (on in static_h
// source builds, off in the prebuilt Hermes V1); off, Promise falls back to a
// host-provided setImmediate that Kuito does not define.
::hermes::vm::RuntimeConfig runtimeConfig() {
  return ::hermes::vm::RuntimeConfig::Builder().withMicrotaskQueue(true).build();
}
} // namespace

Runtime::Runtime(Sink sink, AsyncHost host)
    : sink_(std::move(sink)), runtime_(facebook::hermes::makeHermesRuntime(runtimeConfig())),
      work_(std::make_unique<WorkReader>("__kuito")), events_(std::make_unique<EventSender>("__kuito")),
      asyncHost_(std::move(host)) {
  // The job's view mutations, in one call: a batch the table rejects throws
  // here, in the kernel's commit, with none of it kept.
  if (asyncHost_.record) recorder_ = std::make_unique<Recorder>();
  installHost(*runtime_, "__kuitoHostCommit", 3, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    auto raw = readRawBatch(rt, args, count);
    // Decoding takes the strings; a recording keeps the batch as it came, once the table accepts it.
    const auto recorded = recorder_ ? raw.strings : std::vector<std::string>();
    auto batch = decodeBatch(raw.data, raw.length, std::move(raw.strings));
    views_.apply(batch);
    if (recorder_) {
      const std::chrono::duration<double, std::milli> since = std::chrono::steady_clock::now() - started_;
      recorder_->stage(since.count(), raw.data, raw.length, recorded);
    }
    ++commits_;
    for (auto& change : batch) pending_.push(std::move(change));
  });
  if (asyncHost_.busy) {
    auto busy = jsi::Function::createFromHostFunction(
        *runtime_, jsi::PropNameID::forAscii(*runtime_, "__kuitoHostBusy"), 0,
        [this](jsi::Runtime&, const jsi::Value&, const jsi::Value*, size_t) { return jsi::Value(asyncHost_.busy()); });
    runtime_->global().setProperty(*runtime_, "__kuitoHostBusy", std::move(busy));
  }
  if (asyncHost_.link) installLink();
  // A chunk's script, evaluated inside the job that required it: it only
  // defines the chunk, which the kernel then runs (docs/navigation.md#route-modules).
  if (asyncHost_.loadChunk)
    installHost(*runtime_, "__kuitoHostLoad", 1, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
      if (count != 1 || !args[0].isString()) throw jsi::JSError(rt, "load expects (name)");
      auto name = args[0].getString(rt).utf8(rt);
      auto script = asyncHost_.loadChunk(name);
      // The kernel reports a chunk nobody defined, by name.
      if (script.empty()) return;
      auto url = "kuito://modules/" + name;
      auto evaluate = [&] { rt.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(std::move(script)), url); };
      if (asyncHost_.traceEvaluate) asyncHost_.traceEvaluate(url, evaluate);
      else evaluate();
    });
  installHost(*runtime_, "__kuitoHostSetTimer", 3, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    if (count != 3 || !args[0].isNumber() || !args[1].isNumber() || !args[2].isObject() ||
        !args[2].asObject(rt).isFunction(rt))
      throw jsi::JSError(rt, "Timer expects (id, milliseconds, function)");
    if (!asyncHost_.scheduleTimer) throw jsi::JSError(rt, "Native timer scheduler unavailable");
    int id = static_cast<int>(args[0].asNumber());
    if (timers_.count(id)) throw jsi::JSError(rt, "Timer ID already active");
    timers_[id] = std::make_unique<jsi::Function>(args[2].asObject(rt).asFunction(rt));
    try {
      asyncHost_.scheduleTimer(id, args[1].asNumber());
    } catch (...) {
      timers_.erase(id);
      throw;
    }
  });
  installHost(*runtime_, "__kuitoHostClearTimer", 1, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    if (count != 1 || !args[0].isNumber()) throw jsi::JSError(rt, "clearTimer requires ID");
    int id = static_cast<int>(args[0].asNumber());
    timers_.erase(id);
    if (asyncHost_.cancelTimer) asyncHost_.cancelTimer(id);
  });
  installStandard(*runtime_);
  if (asyncHost_.http) installHttp(*runtime_, asyncHost_.http);
  if (asyncHost_.sockets) installSockets(*runtime_, asyncHost_.sockets);
  // UI-thread operations travel in the batch, after the view mutations they
  // refer to; the platform hands them to its UIRuntime in order.
  if (asyncHost_.readMotion) {
    auto read = jsi::Function::createFromHostFunction(
        *runtime_, jsi::PropNameID::forAscii(*runtime_, "__kuitoHostMotionRead"), 1,
        [this](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
          if (count != 1 || !args[0].isString()) throw jsi::JSError(rt, "motion read expects an id");
          auto entry = asyncHost_.readMotion(args[0].asString(rt).utf8(rt));
          if (!entry) return jsi::Value::undefined();
          jsi::Object read(rt);
          read.setProperty(rt, "value", jsiValue(rt, entry->value));
          read.setProperty(rt, "js", entry->js);
          return read;
        });
    runtime_->global().setProperty(*runtime_, "__kuitoHostMotionRead", std::move(read));
  }
  if (asyncHost_.readMotionNumber) {
    auto number = jsi::Function::createFromHostFunction(
        *runtime_, jsi::PropNameID::forAscii(*runtime_, "__kuitoHostMotionNumber"), 2,
        [this](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
          if (count != 2 || !args[0].isString() || !args[1].isNumber())
            throw jsi::JSError(rt, "motion number expects (id, version)");
          auto answer = asyncHost_.readMotionNumber(args[0].asString(rt).utf8(rt), args[1].asNumber());
          if (answer.kind == MotionMirror::Fresh::Number) return jsi::Value(answer.value);
          return answer.kind == MotionMirror::Fresh::Stale ? jsi::Value::null() : jsi::Value::undefined();
        });
    runtime_->global().setProperty(*runtime_, "__kuitoHostMotionNumber", std::move(number));
  }
  if (asyncHost_.log)
    installHost(*runtime_, "__kuitoHostLog", 3, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
      if (count != 3) throw jsi::JSError(rt, "log expects (level, message, stack)");
      asyncHost_.log(scalarText(rt, args[0]), scalarText(rt, args[1]), scalarText(rt, args[2]));
    });
  if (asyncHost_.inspector)
    inspected_ = asyncHost_.inspector->attach("js", "JS thread", *runtime_, asyncHost_.wakeInspector);
}

Runtime::~Runtime() {
  if (inspected_) asyncHost_.inspector->detach(inspected_);
}

void Runtime::inspect() {
  if (inspected_) runCallback(JobCause::Entry::Unknown, [&] { inspected_->drain(); });
}

void Runtime::evaluate(const std::string& source, const std::string& url) {
  startJob(JobCause::Entry::Script);
  try {
    runtime_->evaluateJavaScript(std::make_shared<jsi::StringBuffer>(source), url);
    runtime_->drainMicrotasks();
    flushMutations();
  } catch (const jsi::JSError& error) {
    discardMutations();
    throw ScriptError(describeError(*runtime_, error), error.getStack());
  } catch (...) {
    discardMutations();
    throw;
  }
}

void Runtime::startJob(JobCause::Entry entry, std::uint32_t handle, const std::string& event) {
  job_.job = ++jobs_;
  job_.entry = entry;
  job_.handle = handle;
#if KUITO_INSTRUMENTS
  job_.event = event;
#else
  (void)event;
#endif
}

void Runtime::runCallback(JobCause::Entry entry, const std::function<void()>& work) {
  // An event names its view before it runs (dispatch).
  if (entry != JobCause::Entry::Event) startJob(entry);
  try {
    work();
    runtime_->drainMicrotasks();
    flushMutations();
  } catch (const jsi::JSError& error) {
    discardMutations();
    if (!asyncHost_.log) throw;
    asyncHost_.log("error", describeError(*runtime_, error), error.getStack());
  } catch (...) {
    discardMutations();
    throw;
  }
}

void Runtime::dispatch(std::uint32_t handle, const std::string& event, const EventRecord& record) {
  startJob(JobCause::Entry::Event, handle, event);
  runCallback(JobCause::Entry::Event, [&] {
    auto& rt = *runtime_;
    auto kernel = rt.global().getPropertyAsObject(rt, "__kuito");
    auto type = jsi::String::createFromUtf8(rt, event);
    if (record.layout == kValueEvent) {
      kernel.getPropertyAsFunction(rt, "dispatch")
          .call(rt, static_cast<double>(handle), std::move(type), jsiValue(rt, record.value));
      return;
    }
    if (record.layout == kJsonEvent) {
      auto data =
          record.json.empty() ? jsi::Value::undefined() : jsi::Value(jsi::String::createFromUtf8(rt, record.json));
      kernel.getPropertyAsFunction(rt, "dispatch")
          .call(rt, static_cast<double>(handle), std::move(type), std::move(data));
      return;
    }
    auto strings = events_->write(rt, record);
    kernel.getPropertyAsFunction(rt, "dispatchRecord")
        .call(rt, static_cast<double>(handle), std::move(type), static_cast<double>(record.layout), std::move(strings));
  });
}

} // namespace kuito

void kuito::Runtime::fireTimer(int id) {
  auto it = timers_.find(id);
  if (it == timers_.end()) return;
  auto timer = std::move(it->second);
  timers_.erase(it);
  runCallback(JobCause::Entry::Timer, [&] { timer->call(*runtime_); });
}

void kuito::Runtime::httpHead(int id, int status, const std::string& url, const HttpHeaders& headers) {
  runCallback(JobCause::Entry::Network, [&] { deliverHttpHead(*runtime_, id, status, url, headers); });
}

void kuito::Runtime::httpChunk(int id, std::vector<std::uint8_t> chunk) {
  runCallback(JobCause::Entry::Network, [&] { deliverHttpChunk(*runtime_, id, std::move(chunk)); });
}

void kuito::Runtime::httpEnd(int id, std::vector<std::uint8_t> body, const std::string& error) {
  runCallback(JobCause::Entry::Network, [&] { deliverHttpEnd(*runtime_, id, std::move(body), error); });
}

void kuito::Runtime::httpProgress(int id, double bytes, double total) {
  runCallback(JobCause::Entry::Network, [&] { deliverHttpProgress(*runtime_, id, bytes, total); });
}

void kuito::Runtime::socketOpen(int id, const std::string& protocol) {
  runCallback(JobCause::Entry::Network, [&] { deliverSocketOpen(*runtime_, id, protocol); });
}

void kuito::Runtime::socketMessage(int id, SocketMessage message) {
  runCallback(JobCause::Entry::Network, [&] { deliverSocketMessage(*runtime_, id, std::move(message)); });
}

void kuito::Runtime::socketError(int id, const std::string& message) {
  runCallback(JobCause::Entry::Network, [&] { deliverSocketError(*runtime_, id, message); });
}

void kuito::Runtime::socketClose(int id, int code, const std::string& reason, bool wasClean) {
  runCallback(JobCause::Entry::Network, [&] { deliverSocketClose(*runtime_, id, code, reason, wasClean); });
}

namespace kuito {
namespace {

/// The error the kernel makes of a failed call, named for its function.
jsi::JSError linkError(jsi::Runtime& rt, int id, const std::string& code, const std::string& message) {
  auto make = rt.global().getPropertyAsFunction(rt, "__kuitoLinkError");
  return jsi::JSError(
      rt, make.call(rt, id, jsi::String::createFromUtf8(rt, code), jsi::String::createFromUtf8(rt, message)));
}

} // namespace
} // namespace kuito

// A linked function crosses by its id with its arguments as values its
// signature types. A failure throws the error the kernel makes of it.
void kuito::Runtime::installLink() {
  auto& link = asyncHost_.link;
  linkSignatures_ = LinkSignatures(link.signature);
  auto call = jsi::Function::createFromHostFunction(
      *runtime_, jsi::PropNameID::forAscii(*runtime_, "__kuitoHostCall"), 1,
      [this, &link](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
        if (count < 1 || !args[0].isNumber()) throw jsi::JSError(rt, "call expects (id, ...arguments)");
        auto id = static_cast<int>(args[0].asNumber());
        LinkResult result;
        try {
          const auto* signature = linkSignatures_.find(id);
          result = link.call(id, linkArguments(rt, args, 1, count, signature, link.allocate));
          if (auto value = std::get_if<LinkValue>(&result)) {
            if (!signature) throw LinkMismatch("ERR_FUNCTION_NOT_FOUND", "is not linked into this shell");
            return jsiValue(rt, *value, signature->result);
          }
        } catch (const LinkMismatch& mismatch) {
          throw linkError(rt, id, mismatch.code, mismatch.what());
        } catch (const std::exception& error) { throw linkError(rt, id, "ERR_NATIVE", error.what()); }
        const auto& failure = std::get<LinkFailure>(result);
        throw linkError(rt, id, failure.code, failure.message);
      });
  runtime_->global().setProperty(*runtime_, "__kuitoHostCall", std::move(call));
  // A call waits for the job to end, so the platform receives the job's view
  // mutations before it: a main-thread function sees the screen the app rendered.
  installHost(*runtime_, "__kuitoHostCallAsync", 2,
              [this, &link](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
                if (count < 2 || !args[0].isNumber() || !args[1].isNumber())
                  throw jsi::JSError(rt, "callAsync expects (id, call, ...arguments)");
                const auto id = static_cast<int>(args[0].asNumber());
                const auto call = static_cast<int>(args[1].asNumber());
                std::vector<LinkValue> values;
                try {
                  values = linkArguments(rt, args, 2, count, linkSignatures_.find(id), link.allocate);
                } catch (const LinkMismatch& mismatch) {
                  throw linkError(rt, id, mismatch.code, mismatch.what());
                } catch (const std::exception& error) { throw linkError(rt, id, "ERR_NATIVE", error.what()); }
                linkCallFunctions_[call] = id;
                linkCalls_.emplace_back(call, [&link, id, call, values = std::move(values)]() mutable {
                  link.callAsync(id, call, std::move(values));
                });
              });
  installHost(*runtime_, "__kuitoHostObserve", 2, [&link](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    if (count != 2 || !args[0].isNumber() || !args[1].isBool())
      throw jsi::JSError(rt, "observe expects (id, observing)");
    link.observe(static_cast<int>(args[0].asNumber()), args[1].getBool());
  });
}

void kuito::Runtime::emitLinkEvent(int member, const LinkValue& value) {
  runCallback(JobCause::Entry::Module, [&] {
    const auto* signature = linkSignatures_.find(member);
    if (!signature) throw std::runtime_error("Member " + std::to_string(member) + " is not linked into this shell");
    auto emit = runtime_->global().getPropertyAsFunction(*runtime_, "__kuitoLinkEmit");
    emit.call(*runtime_, member, jsiValue(*runtime_, value, signature->result));
  });
}

void kuito::Runtime::settleLinkCall(int call, const LinkResult& result) {
  runCallback(JobCause::Entry::Module, [&] {
    auto& rt = *runtime_;
    auto function = linkCallFunctions_.find(call);
    if (function == linkCallFunctions_.end())
      throw std::logic_error("Native module call " + std::to_string(call) + " is not pending");
    const int id = function->second;
    linkCallFunctions_.erase(function);
    const auto fail = [&rt, call](const std::string& code, const std::string& message) {
      rt.global()
          .getPropertyAsFunction(rt, "__kuitoLinkFail")
          .call(rt, call, jsi::String::createFromUtf8(rt, code), jsi::String::createFromUtf8(rt, message));
    };
    if (auto failure = std::get_if<LinkFailure>(&result)) return fail(failure->code, failure->message);
    jsi::Value settled = jsi::Value::null();
    try {
      const auto* signature = linkSignatures_.find(id);
      if (!signature) throw LinkMismatch("ERR_FUNCTION_NOT_FOUND", "is not linked into this shell");
      settled = jsiValue(rt, std::get<LinkValue>(result), signature->result);
    } catch (const LinkMismatch& mismatch) { return fail(mismatch.code, mismatch.what()); }
    rt.global().getPropertyAsFunction(rt, "__kuitoLinkSettle").call(rt, call, settled);
  });
}

std::string kuito::Runtime::recording() const {
  if (!recorder_) throw std::logic_error("This runtime does not record; development builds do");
  return recorder_->file();
}

void kuito::Runtime::flushMutations() {
  countWork();
  views_.settle();
  if (recorder_) recorder_->settle();
  auto changes = pending_.take();
  if (!changes.empty()) sink_(std::move(changes), commits_, std::move(job_));
  commits_ = 0;
  releaseLinkCalls();
}

// A job that throws loses its mutations, but the calls it made were promised.
void kuito::Runtime::discardMutations() {
  countWork();
  views_.discard();
  if (recorder_) recorder_->discard();
  pending_.clear();
  commits_ = 0;
  releaseLinkCalls();
}

// The performance monitor's JSON counters (docs/performance.md#json-at-the-boundary).
void kuito::Runtime::countWork() { work_->read(*runtime_); }

// A call the platform could not start fails alone; the others still start.
void kuito::Runtime::releaseLinkCalls() {
  auto calls = std::move(linkCalls_);
  linkCalls_.clear();
  std::vector<std::pair<int, std::string>> failed;
  for (auto& [call, start] : calls) {
    try {
      start();
    } catch (const std::exception& error) { failed.emplace_back(call, error.what()); }
  }
  for (const auto& [call, message] : failed) settleLinkCall(call, LinkFailure{"ERR_NATIVE", message});
}
