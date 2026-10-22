#include "UIRuntime.h"
#include "Ablation.h"
#include "Inspector.h"
#include "JSIHelpers.h"
#include "LinkJSI.h"
#include "UIKernel.h"

#include <hermes/hermes.h>
#include <jsi/jsi.h>
#include <algorithm>
#include <chrono>
#include <exception>
#include <utility>

namespace kuito {
namespace jsi = facebook::jsi;

namespace {
jsi::Function kernelFunction(jsi::Runtime& rt, const char* name) {
  return rt.global().getPropertyAsObject(rt, "__kuitoUI").getPropertyAsFunction(rt, name);
}
} // namespace

UIRuntime::UIRuntime(UIHost host, std::shared_ptr<MotionMirror> mirror, std::shared_ptr<FrameHandoff> handoff)
    : host_(std::move(host)), mirror_(std::move(mirror)), handoff_(std::move(handoff)),
      runtime_(
          facebook::hermes::makeHermesRuntime(::hermes::vm::RuntimeConfig::Builder().withMicrotaskQueue(true).build())),
      work_(std::make_unique<WorkReader>("__kuitoUI")), events_(std::make_unique<EventSender>("__kuitoUI")),
      linkSignatures_(host_.linkSignature) {
  // A new session's motion values start from the JS thread's own values.
  mirror_->clear();
  auto& rt = *runtime_;
  // Typed as the JS thread's writes are: a driven number reaches the setter as a double.
  installHost(rt, "__kuitoUISetProp", 3, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    if (count != 3 || !args[1].isString()) throw jsi::JSError(rt, "setProp expects (view, prop, value)");
    props_.push(propMutation(viewId(rt, args[0]), args[1].asString(rt).utf8(rt), rawValue(rt, args[2])));
  });
  installHost(rt, "__kuitoUISendEvent", 1, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    if (count != 1 || !args[0].isObject()) throw jsi::JSError(rt, "sendEvent expects a message object");
    if (host_.sendEvent) host_.sendEvent(plainValue(rt, args[0]));
  });
  installHost(rt, "__kuitoUIMirror", 3, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    if (count != 3 || !args[0].isString() || !args[2].isNumber())
      throw jsi::JSError(rt, "mirror expects (id, value, js)");
    mirror_->write(args[0].asString(rt).utf8(rt), plainValue(rt, args[1]), args[2].asNumber());
  });
  installHost(rt, "__kuitoUIMirrorNumber", 3, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    if (count != 3 || !args[0].isString() || !args[1].isNumber() || !args[2].isNumber())
      throw jsi::JSError(rt, "mirrorNumber expects (id, value, js)");
    mirror_->writeNumber(args[0].asString(rt).utf8(rt), args[1].asNumber(), args[2].asNumber());
  });
  installHost(rt, "__kuitoUIRequestFrame", 0, [this](jsi::Runtime&, const jsi::Value*, size_t) {
    frameDue_ = true;
    host_.requestFrame();
  });
  // What dev builds time UI-thread code with (src/ui-thread/budget.ts).
  auto now = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "__kuitoUINow"), 0,
      [](jsi::Runtime&, const jsi::Value&, const jsi::Value*, size_t) -> jsi::Value {
        const std::chrono::duration<double, std::milli> since = std::chrono::steady_clock::now().time_since_epoch();
        return jsi::Value(since.count());
      });
  rt.global().setProperty(rt, "__kuitoUINow", std::move(now));
  installHost(rt, "__kuitoUILog", 3, [this](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
    if (count != 3) throw jsi::JSError(rt, "log expects (level, message, stack)");
    if (host_.log) host_.log(scalarText(rt, args[0]), scalarText(rt, args[1]), scalarText(rt, args[2]));
  });
  if (host_.callLinked) {
    auto call = jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "__kuitoUIHostCall"), 1,
        [this](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
          if (count < 1 || !args[0].isNumber()) throw jsi::JSError(rt, "call expects (id, ...arguments)");
          const auto id = static_cast<int>(args[0].asNumber());
          LinkResult result;
          try {
            const auto* signature = linkSignatures_.find(id);
            result = host_.callLinked(id, linkArguments(rt, args, 1, count, signature, host_.linkAllocate));
            if (auto value = std::get_if<LinkValue>(&result)) {
              if (!signature) throw LinkMismatch("ERR_FUNCTION_NOT_FOUND", "is not linked into this shell");
              return jsiValue(rt, *value, signature->result);
            }
          } catch (const LinkMismatch& mismatch) {
            throw jsi::JSError(rt, mismatch.code + ": " + mismatch.what());
          } catch (const std::exception& error) { throw jsi::JSError(rt, error.what()); }
          const auto& failure = std::get<LinkFailure>(result);
          throw jsi::JSError(rt, failure.code + ": " + failure.message);
        });
    rt.global().setProperty(rt, "__kuitoUIHostCall", std::move(call));
  }
  if (host_.inspector) inspected_ = host_.inspector->attach("ui", "UI thread", rt, host_.wakeInspector);
}

UIRuntime::~UIRuntime() {
  if (inspected_) host_.inspector->detach(inspected_);
}

template <class Work>
bool UIRuntime::run(const char* what, Work&& work) {
  const auto guarded = [&](const char* stage, auto&& step) {
    try {
      return step();
    } catch (const jsi::JSError& error) {
      if (host_.log)
        host_.log("error", std::string("UI thread ") + stage + ": " + error.getMessage(), error.getStack());
    } catch (const std::exception& error) {
      if (host_.log) host_.log("error", std::string("UI thread ") + stage + ": " + error.what(), "");
    }
    return false;
  };
  // Entries made while props are applied run inside applyProps: the drain
  // after it settles their microtasks.
  const auto apply = [&](std::vector<Mutation> props) {
    guarded("props", [&] {
      if (host_.applyProps) host_.applyProps(props);
      runtime_->drainMicrotasks();
      return true;
    });
  };
  const bool result = guarded(what, [&] {
    return props_.run(
        [&](bool outermost) {
          const bool result = work();
          if (outermost) runtime_->drainMicrotasks();
          return result;
        },
        apply);
  });
  work_->read(*runtime_);
  return result;
}

void UIRuntime::load(std::string bytecode, const std::string& hash) {
  loaded_ = true;
  run("kernel", [&] {
    checkUIKernel(bytecode, hash);
    runtime_->evaluateJavaScript(std::make_shared<jsi::StringBuffer>(std::move(bytecode)), "kuito://ui-kernel");
    booted_ = true;
    return true;
  });
  if (!booted_) return;
  auto early = std::move(early_);
  early_.clear();
  for (auto& [member, value] : early) platform(member, std::move(value));
}

void UIRuntime::evaluate(const std::string& source, const std::string& url) {
  // Its bundle needs the UI kernel, whose failure to load was already reported.
  if (loaded_ && !booted_) return;
  run("script", [&] {
    runtime_->evaluateJavaScript(std::make_shared<jsi::StringBuffer>(source), url);
    return true;
  });
}

void UIRuntime::loadBundle(std::string bytecode, const std::string& hash, const std::string& url) {
  if (loaded_ && !booted_) return;
  run("script", [&] {
    checkUIBundle(bytecode, hash);
    runtime_->evaluateJavaScript(std::make_shared<jsi::StringBuffer>(std::move(bytecode)), url);
    return true;
  });
}

void UIRuntime::platform(int member, LinkValue value) {
  if (!booted_) {
    early_.erase(
        std::remove_if(early_.begin(), early_.end(), [member](const auto& entry) { return entry.first == member; }),
        early_.end());
    early_.emplace_back(member, std::move(value));
    return;
  }
  run("motion value", [&] {
    auto& rt = *runtime_;
    const auto* signature = linkSignatures_.find(member);
    if (!signature) throw std::runtime_error("Member " + std::to_string(member) + " is not linked into this shell");
    kernelFunction(rt, "platform").call(rt, static_cast<double>(member), jsiValue(rt, value, signature->result));
    return true;
  });
}

void UIRuntime::receive(std::size_t index) {
  if (!booted_) {
    // A UI kernel that failed to load was reported once: what it cannot run adds nothing.
    if (!loaded_ && host_.log) host_.log("error", "UI thread operations arrived before the UI kernel", "");
    return;
  }
  const auto found =
      std::find_if(operations_.begin(), operations_.end(), [index](const auto& entry) { return entry.first == index; });
  if (found == operations_.end()) {
    if (host_.log) host_.log("error", "No UI operations at record " + std::to_string(index) + " of the batch", "");
    return;
  }
  const PlainValue& operations = found->second;
  run("operation", [&] {
    auto& rt = *runtime_;
    kernelFunction(rt, "receive").call(rt, jsiValue(rt, operations));
    return true;
  });
}

bool UIRuntime::event(std::uint32_t handle, const std::string& event, const EventRecord& record) {
  if (!booted_) return false;
  // Elided, the event goes to the JS thread as if no UI-thread handler read it.
  return ablated(
      Subsystem::UIEvent, [&] { return timed(Work::UIEvent, [&] { return offer(handle, event, record); }); },
      [] { return false; });
}

bool UIRuntime::offer(std::uint32_t handle, const std::string& event, const EventRecord& record) {
  return run("event", [&] {
    auto& rt = *runtime_;
    auto type = jsi::String::createFromUtf8(rt, event);
    auto handled =
        record.layout == kJsonEvent
            ? kernelFunction(rt, "event")
                  .call(rt, static_cast<double>(handle), std::move(type), jsi::String::createFromUtf8(rt, record.json))
            : kernelFunction(rt, "eventRecord")
                  .call(rt, static_cast<double>(handle), std::move(type), static_cast<double>(record.layout),
                        events_->write(rt, record));
    return handled.isBool() && handled.getBool();
  });
}

void UIRuntime::inspect() {
  if (!inspected_) return;
  run("debugger", [&] {
    inspected_->drain();
    return true;
  });
}

void UIRuntime::drain(double now, double budgetMs) {
  // An input's drain runs on its display frame's time (FrameClock.h): one frame.
  if (now != lastDrain_) ++wireWork().frames;
  lastDrain_ = now;
  const bool wasBusy = handoff_->busy();
  const auto deadline =
      std::chrono::steady_clock::now() + std::chrono::duration_cast<std::chrono::steady_clock::duration>(
                                             std::chrono::duration<double, std::milli>(budgetMs));
  timed(Work::Drain, [&] { drainBatches(deadline); });
  // After the batches, so the UI kernel's frame sees the views they made.
  if (frameDue_) {
    frameDue_ = false;
    frame(now);
  }
  const bool pending = handoff_->pending();
  if (pending || frameDue_) host_.requestFrame();
  if (!pending) host_.framesCommitted();
  if (wasBusy && !handoff_->busy()) host_.idle();
}

void UIRuntime::drainBatches(std::chrono::steady_clock::time_point deadline) {
  handoff_->drain([&] { return std::chrono::steady_clock::now() >= deadline; },
                  [&](Batch& batch) {
                    // The renderer parses each JSON value it applies: a module view's object props.
                    wireWork().jsonParses += jsonValues(batch.mutations);
                    // The platform may take the batch's mutations: its UI
                    // records' operations wait here for receive(). A batch an
                    // exception C++ cannot catch cut short leaves none behind.
                    operations_.clear();
                    for (std::size_t i = 0; i < batch.mutations.size(); ++i)
                      if (batch.mutations[i].op == Op::UI)
                        operations_.emplace_back(i, std::move(batch.mutations[i].plain));
                    const auto records = static_cast<std::uint32_t>(batch.mutations.size());
                    const std::uint64_t job = batch.cause.job;
                    frameLedger().applying(batch.cause);
                    // One batch failing to apply does not cost the frame the rest.
                    // The switchboard slows a batch at most: the views take every one.
                    ablated(
                        Subsystem::ApplyBatch,
                        [&] {
                          timed(Work::ApplyBatch,
                                [&] {
                                  try {
                                    host_.applyBatch(batch);
                                  } catch (const std::exception& error) {
                                    if (host_.log)
                                      host_.log("error", std::string("Applying a batch failed: ") + error.what(), "");
                                  }
                                },
                                job, {records, 0, 0, 0});
                        },
                        [] {});
                    operations_.clear();
                  });
}

void UIRuntime::frame(double now) {
  if (!booted_) return;
  ablated(
      Subsystem::UIFrame,
      [&] {
        timed(Work::UIFrame, [&] {
          run("frame", [&] {
            auto& rt = *runtime_;
            kernelFunction(rt, "frame").call(rt, now);
            return true;
          });
        });
      },
      [] {});
}

} // namespace kuito
