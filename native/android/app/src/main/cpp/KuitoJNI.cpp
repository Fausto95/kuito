#include "../../../../../shared/EventRecord.h"
#include "../../../../../shared/FrameClock.h"
#include "../../../../../shared/FrameHandoff.h"
#include "../../../../../shared/KuitoRuntime.h"
#include "../../../../../shared/UIRuntime.h"
#include "../../../../../shared/WireWork.h"
#include "KuitoInspectorJNI.h"
#include "JavaException.h"
#include "JavaLink.h"
#include "JavaValues.h"
#include <android/trace.h>
#include <jni.h>
#include <ctime>
#include <exception>
#include <stdexcept>
#include <memory>
#include <string>
#include <vector>

namespace {
/// SystemClock.uptimeMillis's clock, as KuitoCommitStats reads it.
double uptimeMs() {
  timespec now{};
  clock_gettime(CLOCK_MONOTONIC, &now);
  return static_cast<double>(now.tv_sec) * 1000.0 + static_cast<double>(now.tv_nsec) / 1e6;
}

using kuito::javaBytes;
using kuito::kBatchSignature;
using kuito::javaMethod;
using kuito::javaString;
using kuito::jniEntry;
using kuito::newJavaString;

/// A native event's payload as KuitoEventRecord.kt holds it (docs/events.md#typed-events):
/// JSON text when `json` is non-null, else `layout` and the first `count` numbers and the strings,
/// checked against the layout before either runtime reads it.
kuito::EventRecord eventRecord(JNIEnv* env, jint layout, jdoubleArray numbers, jint count, jobjectArray strings,
                                jstring json) {
  if (json) return kuito::jsonRecord(javaString(env, json));
  kuito::EventRecord record;
  record.layout = layout;
  const jsize capacity = numbers ? env->GetArrayLength(numbers) : 0;
  if (count < 0 || count > capacity)
    throw std::invalid_argument("KUITO_EVENT_LAYOUT: " + std::to_string(count) + " numbers in a record of " +
                                std::to_string(capacity));
  record.numbers.resize(static_cast<std::size_t>(count));
  if (count > 0) {
    env->GetDoubleArrayRegion(numbers, 0, count, record.numbers.data());
    kuito::rethrowJavaException(env, "Reading an event's numbers");
  }
  record.strings = kuito::javaStrings(env, strings);
  kuito::checkRecord(record);
  return record;
}

/// JavaScript that threw while evaluating: a KuitoScriptError with its stack.
/// When the JVM cannot build one, the error it raised instead is what Kotlin gets.
void throwScript(JNIEnv* env, const kuito::ScriptError& error) {
  kuito::JavaLocal<jclass> type(env, env->FindClass("dev/kuito/runtime/KuitoScriptError"));
  if (!type.get()) return;
  jmethodID init = env->GetMethodID(type.get(), "<init>", "(Ljava/lang/String;Ljava/lang/String;)V");
  if (!init) return;
  kuito::JavaLocal<jstring> message(env, env->NewStringUTF(error.what()));
  if (!message.get()) return;
  kuito::JavaLocal<jstring> stack(env, env->NewStringUTF(error.stack.c_str()));
  if (!stack.get()) return;
  kuito::JavaLocal<jthrowable> thrown(
      env, static_cast<jthrowable>(env->NewObject(type.get(), init, message.get(), stack.get())));
  if (thrown.get()) env->Throw(thrown.get());
}

struct Bridge {
  JavaVM* vm;
  jobject receiver;
  jmethodID frameWanted;
  jmethodID scheduleTimer;
  jmethodID cancelTimer;
  jmethodID httpStart;
  jmethodID httpStream;
  jmethodID httpCancel;
  jmethodID socketOpen;
  jmethodID socketSend;
  jmethodID socketClose;
  jmethodID linkCall;
  jmethodID linkCallAsync;
  jmethodID linkObserve;
  jmethodID linkSignature;
  jmethodID log;
  jmethodID inspectorWake;
  jmethodID chunkLoad;
  /// Null without a linker: a runtime that calls no module functions.
  std::unique_ptr<kuito::JavaLink> link;
  std::unique_ptr<kuito::Runtime> runtime;
  Bridge(JNIEnv* env, jobject thiz, bool withLink, std::shared_ptr<kuito::MotionMirror> mirror,
         std::shared_ptr<kuito::FrameHandoff> handoff, std::shared_ptr<kuito::InspectorDevice> inspector) {
    if (env->GetJavaVM(&vm) != JNI_OK) throw std::runtime_error("JNI has no Java VM");
    {
      kuito::JavaLocal<jclass> type(env, env->GetObjectClass(thiz));
      auto clazz = type.get();
      frameWanted = javaMethod(env, clazz, "onFrameWanted", "()V");
      scheduleTimer = javaMethod(env, clazz, "onNativeTimerSchedule", "(ID)V");
      cancelTimer = javaMethod(env, clazz, "onNativeTimerCancel", "(I)V");
      httpStart = javaMethod(env, clazz, "onNativeHttpStart",
                             "(ILjava/lang/String;Ljava/lang/String;[Ljava/lang/String;[BLjava/lang/String;[BLjava/lang/String;I)V");
      httpStream = javaMethod(env, clazz, "onNativeHttpStream", "(I)V");
      httpCancel = javaMethod(env, clazz, "onNativeHttpCancel", "(I)V");
      socketOpen = javaMethod(env, clazz, "onNativeSocketOpen", "(ILjava/lang/String;[Ljava/lang/String;)V");
      socketSend = javaMethod(env, clazz, "onNativeSocketSend", "(IZ[B)V");
      socketClose = javaMethod(env, clazz, "onNativeSocketClose", "(IILjava/lang/String;)V");
      linkCall = javaMethod(env, clazz, "onLinkCall", "(I[Ljava/lang/Object;)Ljava/lang/Object;");
      linkCallAsync = javaMethod(env, clazz, "onLinkCallAsync", "(II[Ljava/lang/Object;)V");
      linkObserve = javaMethod(env, clazz, "onLinkObserve", "(IZ)V");
      linkSignature = javaMethod(env, clazz, "onLinkSignature", "(I)Ljava/lang/String;");
      log = javaMethod(env, clazz, "onNativeLog", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V");
      inspectorWake = javaMethod(env, clazz, "onInspectorWake", "()V");
      chunkLoad = javaMethod(env, clazz, "onNativeLoadChunk", "(Ljava/lang/String;)[B");
    }
    // Last: a constructor that throws runs no destructor to release it.
    receiver = env->NewGlobalRef(thiz);
    kuito::requireJava(env, receiver, "Holding the native runtime's receiver");
    kuito::AsyncHost services;
#if KUITO_INSPECTOR
    services.record = true;
#endif
    services.scheduleTimer = [this](int id, double ms) {
      auto e = attached("Timer scheduling");
      e->CallVoidMethod(receiver, scheduleTimer, id, ms);
      kuito::rethrowJavaException(e, "Timer scheduling");
    };
    services.cancelTimer = [this](int id) {
      if (auto e = attachedOrNull()) {
        e->CallVoidMethod(receiver, cancelTimer, id);
        kuito::rethrowJavaException(e, "Timer cancel");
      }
    };
    services.http.start = [this](int id, kuito::HttpRequest request) {
      auto e = attached("HTTP request");
      std::vector<std::string> flat;
      flat.reserve(request.headers.size() * 2);
      for (auto& [name, value] : request.headers) flat.push_back(name), flat.push_back(value);
      auto url = newJavaString(e, request.url);
      auto method = newJavaString(e, request.method);
      auto headers = kuito::newJavaStrings(e, flat);
      auto body = kuito::newJavaBytes(e, request.body);
      auto bodyFile = newJavaString(e, request.bodyFile);
      auto suffix = kuito::newJavaBytes(e, request.bodySuffix);
      auto saveTo = newJavaString(e, request.saveTo);
      // KuitoHttpClient's SEND and RECEIVE.
      jint progress = request.progress == kuito::HttpProgress::Send      ? 1
                      : request.progress == kuito::HttpProgress::Receive ? 2
                                                                          : 0;
      e->CallVoidMethod(receiver, httpStart, id, url.get(), method.get(), headers.get(), body.get(), bodyFile.get(),
                        suffix.get(), saveTo.get(), progress);
      kuito::rethrowJavaException(e, "HTTP request");
    };
    services.http.stream = [this](int id) {
      auto e = attached("HTTP stream");
      e->CallVoidMethod(receiver, httpStream, id);
      kuito::rethrowJavaException(e, "HTTP stream");
    };
    services.http.cancel = [this](int id) {
      if (auto e = attachedOrNull()) {
        e->CallVoidMethod(receiver, httpCancel, id);
        kuito::rethrowJavaException(e, "HTTP cancel");
      }
    };
    services.sockets.open = [this](int id, std::string url, std::vector<std::string> protocols) {
      auto e = attached("WebSocket open");
      auto address = newJavaString(e, url);
      auto names = kuito::newJavaStrings(e, protocols);
      e->CallVoidMethod(receiver, socketOpen, id, address.get(), names.get());
      kuito::rethrowJavaException(e, "WebSocket open");
    };
    services.sockets.send = [this](int id, kuito::SocketMessage message) {
      auto e = attached("WebSocket send");
      auto bytes = kuito::newJavaBytes(e, message.bytes);
      e->CallVoidMethod(receiver, socketSend, id, static_cast<jboolean>(message.binary), bytes.get());
      kuito::rethrowJavaException(e, "WebSocket send");
    };
    services.sockets.close = [this](int id, int code, std::string reason) {
      auto e = attached("WebSocket close");
      auto text = newJavaString(e, reason);
      e->CallVoidMethod(receiver, socketClose, id, code, text.get());
      kuito::rethrowJavaException(e, "WebSocket close");
    };
    if (withLink) installLink(env, services.link);
    services.log = [this](const std::string& level, const std::string& message, const std::string& stack) {
      auto e = attached("Log delivery");
      auto l = newJavaString(e, level);
      auto m = newJavaString(e, message);
      auto s = newJavaString(e, stack);
      e->CallVoidMethod(receiver, log, l.get(), m.get(), s.get());
      kuito::rethrowJavaException(e, "Log delivery");
    };
    services.readMotion = [mirror](const std::string& id) { return mirror->read(id); };
    services.readMotionNumber = [mirror](const std::string& id, double version) {
      return mirror->readNumber(id, version);
    };
    services.busy = [handoff]() { return handoff->busy(); };
    services.loadChunk = [this](const std::string& name) {
      auto e = attached("Chunk load");
      auto n = newJavaString(e, name);
      kuito::JavaLocal<jbyteArray> bytes(e, static_cast<jbyteArray>(e->CallObjectMethod(receiver, chunkLoad, n.get())));
      kuito::rethrowJavaException(e, "Chunk load");
      return bytes.get() ? javaBytes(e, bytes.get()) : std::string();
    };
    // `Kuito evaluate <url>`, beside the `Kuito evaluate` KuitoTrace.kt marks for the script.
    services.traceEvaluate = [](const std::string& url, const std::function<void()>& evaluate) {
      ATrace_beginSection(("Kuito evaluate " + url).c_str());
      try {
        evaluate();
      } catch (...) {
        ATrace_endSection();
        throw;
      }
      ATrace_endSection();
    };
    services.inspector = std::move(inspector);
    services.wakeInspector = [this]() {
      if (auto e = inspectorEnv(vm)) {
        e->CallVoidMethod(receiver, inspectorWake);
        if (e->ExceptionCheck()) e->ExceptionClear();
      }
    };
    try {
      runtime = std::make_unique<kuito::Runtime>(
          [this, handoff](std::vector<kuito::Mutation> changes, std::size_t calls, kuito::JobCause job) {
            const kuito::EffectSummary effects = kuito::summarize(changes);
            if (!handoff->push({std::move(changes), uptimeMs(), calls, std::move(job), effects})) return;
            auto e = attached("Android batch dispatch");
            e->CallVoidMethod(receiver, frameWanted);
            kuito::rethrowJavaException(e, "Android batch dispatch");
          },
          std::move(services));
    } catch (...) {
      if (link) link->release(env);
      env->DeleteGlobalRef(receiver);
      throw;
    }
  }
  JNIEnv* attachedOrNull() {
    JNIEnv* env = nullptr;
    return vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) == JNI_OK ? env : nullptr;
  }
  JNIEnv* attached(const char* what) {
    if (auto env = attachedOrNull()) return env;
    throw std::runtime_error(std::string(what) + " called on an unattached thread");
  }

  /// Module functions by id, their arguments and results as Kotlin values (JavaLink.h).
  void installLink(JNIEnv* env, kuito::LinkHost& host) {
    link = std::make_unique<kuito::JavaLink>(env);
    host.call = [this](int function, std::vector<kuito::LinkValue> values) {
      auto env = attached("Native module call");
      auto arguments = link->arguments(env, values);
      kuito::JavaLocal<jobject> result(env, env->CallObjectMethod(receiver, linkCall, function, arguments.get()));
      kuito::rethrowJavaException(env, "Native module call");
      return link->result(env, result.get());
    };
    host.signature = [this](int member) {
      return kuito::linkSignature(attached("Native module signature"), receiver, linkSignature, member);
    };
    host.allocate = [this](std::size_t size) { return link->allocate(attached("Native module bytes"), size); };
    host.observe = [this](int member, bool observing) {
      auto env = attached("Native module observe");
      env->CallVoidMethod(receiver, linkObserve, member, static_cast<jboolean>(observing));
      kuito::rethrowJavaException(env, "Native module observe");
    };
    host.callAsync = [this](int function, int call, std::vector<kuito::LinkValue> values) {
      auto env = attached("Native module call");
      auto arguments = link->arguments(env, values);
      env->CallVoidMethod(receiver, linkCallAsync, function, call, arguments.get());
      kuito::rethrowJavaException(env, "Native module call");
    };
  }

  ~Bridge() {
    // The runtime calls back into Kotlin while it goes (the debugger hands
    // its work back), so it goes before the receiver's reference.
    runtime.reset();
    if (auto env = attachedOrNull()) {
      if (link) link->release(env);
      env->DeleteGlobalRef(receiver);
    }
  }
};
/// The UI runtime (docs/motion.md), owned and called on the main thread.
struct UIBridge {
  JavaVM* vm;
  jobject receiver;
  jmethodID batch;
  jmethodID framesCommitted;
  jmethodID idle;
  jmethodID props;
  jmethodID event;
  jmethodID log;
  jmethodID requestFrame;
  jmethodID inspectorWake;
  jmethodID linkCallOnMain;
  jmethodID linkSignature;
  std::unique_ptr<kuito::JavaLink> link;
  std::unique_ptr<kuito::UIRuntime> runtime;
  UIBridge(JNIEnv* env, jobject thiz, std::shared_ptr<kuito::MotionMirror> mirror,
           std::shared_ptr<kuito::FrameHandoff> handoff, std::shared_ptr<kuito::InspectorDevice> inspector) {
    if (env->GetJavaVM(&vm) != JNI_OK) throw std::runtime_error("JNI has no Java VM");
    {
      kuito::JavaLocal<jclass> type(env, env->GetObjectClass(thiz));
      auto clazz = type.get();
      batch = javaMethod(env, clazz, "onNativeBatch", kBatchSignature);
      framesCommitted = javaMethod(env, clazz, "onUIFramesCommitted", "()V");
      idle = javaMethod(env, clazz, "onHostIdle", "()V");
      props = javaMethod(env, clazz, "onUIProps", kBatchSignature);
      event = javaMethod(env, clazz, "onUIEvent", "(J)V");
      log = javaMethod(env, clazz, "onNativeLog", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V");
      requestFrame = javaMethod(env, clazz, "onUIRequestFrame", "()V");
      inspectorWake = javaMethod(env, clazz, "onUIInspectorWake", "()V");
      linkCallOnMain = javaMethod(env, clazz, "onLinkCallOnMain", "(I[Ljava/lang/Object;)Ljava/lang/Object;");
      linkSignature = javaMethod(env, clazz, "onLinkSignature", "(I)Ljava/lang/String;");
    }
    // Last: a constructor that throws runs no destructor to release it.
    receiver = env->NewGlobalRef(thiz);
    kuito::requireJava(env, receiver, "Holding the UI runtime's receiver");
    kuito::UIHost host;
    host.applyBatch = [this](kuito::Batch& job) {
      kuito::sendBatch(attached(), receiver, batch, job.mutations, static_cast<jint>(job.hostCalls), job.sentAt,
                        "Frame commit");
    };
    host.framesCommitted = [this]() {
      JNIEnv* e = attached();
      e->CallVoidMethod(receiver, framesCommitted);
      kuito::rethrowJavaException(e, "Frames committed");
    };
    host.idle = [this]() {
      JNIEnv* e = attached();
      e->CallVoidMethod(receiver, idle);
      kuito::rethrowJavaException(e, "Host idle");
    };
    host.applyProps = [this](const std::vector<kuito::Mutation>& changes) {
      kuito::sendBatch(attached(), receiver, props, changes, 0, 0, "UI props dispatch");
    };
    // The message stays plain data on its hop to the JS thread: Kotlin holds
    // it by address and hands it to dispatchUIMessage, which frees it. Once
    // Kotlin has the address it owns it, even if the call then throws.
    host.sendEvent = [this](kuito::PlainValue message) {
      JNIEnv* e = attached();
      auto held = reinterpret_cast<jlong>(new kuito::PlainValue(std::move(message)));
      e->CallVoidMethod(receiver, event, held);
      kuito::rethrowJavaException(e, "UI event dispatch");
    };
    host.log = [this](const std::string& level, const std::string& message, const std::string& stack) {
      JNIEnv* e = attached();
      auto l = newJavaString(e, level);
      auto m = newJavaString(e, message);
      auto st = newJavaString(e, stack);
      e->CallVoidMethod(receiver, log, l.get(), m.get(), st.get());
      kuito::rethrowJavaException(e, "UI log delivery");
    };
    host.requestFrame = [this]() {
      JNIEnv* e = attached();
      e->CallVoidMethod(receiver, requestFrame);
      kuito::rethrowJavaException(e, "UI frame request");
    };
    link = std::make_unique<kuito::JavaLink>(env);
    host.linkSignature = [this](int member) {
      return kuito::linkSignature(attached(), receiver, linkSignature, member);
    };
    host.linkAllocate = [this](std::size_t size) { return link->allocate(attached(), size); };
    host.callLinked = [this](int function, std::vector<kuito::LinkValue> values) {
      JNIEnv* e = attached();
      auto arguments = link->arguments(e, values);
      kuito::JavaLocal<jobject> result(e, e->CallObjectMethod(receiver, linkCallOnMain, function, arguments.get()));
      kuito::rethrowJavaException(e, "Native module call");
      return link->result(e, result.get());
    };
    host.inspector = std::move(inspector);
    // Any thread: the main thread runs the work.
    host.wakeInspector = [this]() {
      if (auto e = inspectorEnv(vm)) {
        e->CallVoidMethod(receiver, inspectorWake);
        if (e->ExceptionCheck()) e->ExceptionClear();
      }
    };
    try {
      runtime = std::make_unique<kuito::UIRuntime>(std::move(host), std::move(mirror), std::move(handoff));
    } catch (...) {
      link->release(env);
      env->DeleteGlobalRef(receiver);
      throw;
    }
  }
  JNIEnv* attached() {
    JNIEnv* env = nullptr;
    if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK)
      throw std::runtime_error("UI runtime called off the main thread");
    return env;
  }
  ~UIBridge() {
    runtime.reset();
    JNIEnv* env = nullptr;
    if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) == JNI_OK) {
      link->release(env);
      env->DeleteGlobalRef(receiver);
    }
  }
};

using Mirror = std::shared_ptr<kuito::MotionMirror>;
using Handoff = std::shared_ptr<kuito::FrameHandoff>;

Bridge& bridge(jlong handle) { return *reinterpret_cast<Bridge*>(handle); }
kuito::UIRuntime& ui(jlong handle) { return *reinterpret_cast<UIBridge*>(handle)->runtime; }
} // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_createMirror(JNIEnv*, jobject) {
  return reinterpret_cast<jlong>(new Mirror(std::make_shared<kuito::MotionMirror>()));
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_destroyMirror(JNIEnv*, jobject, jlong mirror) {
  delete reinterpret_cast<Mirror*>(mirror);
}

extern "C" JNIEXPORT jlong JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_createHandoff(JNIEnv*, jobject) {
  return reinterpret_cast<jlong>(new Handoff(std::make_shared<kuito::FrameHandoff>()));
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_destroyHandoff(JNIEnv*, jobject, jlong handoff) {
  delete reinterpret_cast<Handoff*>(handoff);
}

/// Main thread: batches the app sent wait for a frame.
extern "C" JNIEXPORT jboolean JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_pending(JNIEnv*, jobject, jlong handoff) {
  return (*reinterpret_cast<Handoff*>(handoff))->pending() ? JNI_TRUE : JNI_FALSE;
}

/// A press's or a change's job, which the UI thread may wait for; 0 for any other event.
extern "C" JNIEXPORT jlong JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_expectInput(JNIEnv* env, jobject, jlong handoff, jstring event) {
  return static_cast<jlong>((*reinterpret_cast<Handoff*>(handoff))->expectInput(javaString(env, event)));
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_inputDone(JNIEnv*, jobject, jlong handoff, jlong job) {
  (*reinterpret_cast<Handoff*>(handoff))->inputDone(static_cast<std::uint64_t>(job));
}

/// Main thread: whether input job `job` ended within the input budget (FrameHandoff::INPUT_BUDGET).
extern "C" JNIEXPORT jboolean JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_awaitInput(JNIEnv*, jobject, jlong handoff, jlong job) {
  return (*reinterpret_cast<Handoff*>(handoff))->awaitInput(static_cast<std::uint64_t>(job)) ? JNI_TRUE : JNI_FALSE;
}

/// The commit log's frame gauge: `pending=<batches> mirror=<motion values>`,
/// then the JSON counters since launch (native/shared/WireWork.h).
extern "C" JNIEXPORT jstring JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_frameGauge(JNIEnv* env, jobject, jlong handoff, jlong mirror) {
  const auto& work = kuito::wireWork();
  const std::string gauge = "pending=" + std::to_string((*reinterpret_cast<Handoff*>(handoff))->size()) +
                            " mirror=" + std::to_string((*reinterpret_cast<Mirror*>(mirror))->size()) +
                            " frames=" + std::to_string(work.frames.load()) +
                            " json=" + std::to_string(work.jsonParses.load()) +
                            " stringified=" + std::to_string(work.bytesStringified.load());
  return env->NewStringUTF(gauge.c_str());
}

/// [frames, jsonParses, bytesStringified], as KuitoWireWork reads them.
extern "C" JNIEXPORT jlongArray JNICALL
Java_dev_kuito_runtime_devtools_KuitoWireWork_counters(JNIEnv* env, jclass) {
  const auto& work = kuito::wireWork();
  const jlong counters[] = {static_cast<jlong>(work.frames.load()), static_cast<jlong>(work.jsonParses.load()),
                            static_cast<jlong>(work.bytesStringified.load())};
  jlongArray array = env->NewLongArray(3);
  if (array) env->SetLongArrayRegion(array, 0, 3, counters);
  return array;
}

/// A runtime that goes drops what it sent.
extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_clearHandoff(JNIEnv*, jobject, jlong handoff) {
  (*reinterpret_cast<Handoff*>(handoff))->clear();
}

extern "C" JNIEXPORT jlong JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_create(JNIEnv* env, jobject thiz, jboolean withLink,
                                                   jlong mirror, jlong handoff, jlong inspector) {
  return jniEntry(env, jlong{0}, [&] {
    return reinterpret_cast<jlong>(new Bridge(env, thiz, withLink == JNI_TRUE,
                                              *reinterpret_cast<Mirror*>(mirror),
                                              *reinterpret_cast<Handoff*>(handoff), inspectorDevice(inspector)));
  });
}

extern "C" JNIEXPORT jlong JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiCreate(JNIEnv* env, jobject thiz, jlong mirror, jlong handoff,
                                                     jlong inspector) {
  return jniEntry(env, jlong{0}, [&] {
    return reinterpret_cast<jlong>(new UIBridge(env, thiz, *reinterpret_cast<Mirror*>(mirror),
                                                *reinterpret_cast<Handoff*>(handoff), inspectorDevice(inspector)));
  });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiLoad(JNIEnv* env, jobject, jlong handle, jbyteArray bytecode,
                                                   jstring hash) {
  if (!handle) return;
  jniEntry(env, [&] { ui(handle).load(javaBytes(env, bytecode), javaString(env, hash)); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiEvaluate(JNIEnv* env, jobject, jlong handle, jstring source, jstring url) {
  if (!handle) return;
  jniEntry(env, [&] { ui(handle).evaluate(javaString(env, source), javaString(env, url)); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiLoadBundle(JNIEnv* env, jobject, jlong handle, jbyteArray bytecode,
                                                         jstring hash, jstring url) {
  if (!handle) return;
  jniEntry(env, [&] { ui(handle).loadBundle(javaBytes(env, bytecode), javaString(env, hash), javaString(env, url)); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiReceive(JNIEnv* env, jobject, jlong handle, jint index) {
  if (!handle) return;
  jniEntry(env, [&] { ui(handle).receive(static_cast<std::size_t>(index)); });
}

/// A module's motion value the platform set (docs/native-modules.md#motion-values).
extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiPlatform(JNIEnv* env, jobject, jlong handle, jint member, jobject value) {
  if (!handle) return;
  jniEntry(env, [&] {
    auto& owner = *reinterpret_cast<UIBridge*>(handle);
    auto result = owner.link->result(env, value);
    if (auto failure = std::get_if<kuito::LinkFailure>(&result)) throw std::runtime_error(failure->message);
    owner.runtime->platform(member, std::get<kuito::LinkValue>(result));
  });
}

/// A native event (docs/events.md): true when a UI-thread handler ran it.
extern "C" JNIEXPORT jboolean JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiEvent(JNIEnv* env, jobject, jlong handle, jint view, jstring event,
                                                    jint layout, jdoubleArray numbers, jint count,
                                                    jobjectArray strings, jstring json) {
  if (!handle) return JNI_FALSE;
  return jniEntry(env, jboolean{JNI_FALSE}, [&] {
    const auto record = eventRecord(env, layout, numbers, count, strings, json);
    return ui(handle).event(static_cast<std::uint32_t>(view), javaString(env, event), record) ? jboolean{JNI_TRUE}
                                                                                              : jboolean{JNI_FALSE};
  });
}

/// The display frame (docs/native-scheduling.md): the JS thread's batches within `budget` ms, then the UI kernel's.
extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiDrain(JNIEnv* env, jobject, jlong handle, jdouble now, jdouble budget) {
  if (!handle) return;
  jniEntry(env, [&] { ui(handle).drain(now, budget); });
}

/// The input drain's clock (docs/native-scheduling.md#input), shared with iOS.
extern "C" JNIEXPORT jdouble JNICALL
Java_dev_kuito_runtime_KuitoFrameClock_latestFrame(JNIEnv*, jclass, jdouble now, jdouble timestamp, jdouble interval) {
  return kuito::latestFrame(now, timestamp, interval);
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiInspect(JNIEnv* env, jobject, jlong handle) {
  if (!handle) return;
  jniEntry(env, [&] { ui(handle).inspect(); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_inspect(JNIEnv* env, jobject, jlong handle) {
  if (!handle) return;
  jniEntry(env, [&] { bridge(handle).runtime->inspect(); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_uiDestroy(JNIEnv*, jobject, jlong handle) {
  delete reinterpret_cast<UIBridge*>(handle);
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_evaluate(JNIEnv* env, jobject, jlong handle, jbyteArray script, jstring url) {
  if (!handle) return;
  jniEntry(env, [&] {
    try { bridge(handle).runtime->evaluate(javaBytes(env, script), javaString(env, url)); }
    catch (const kuito::ScriptError& error) { throwScript(env, error); }
  });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_dispatch(JNIEnv* env, jobject, jlong handle, jint view, jstring event,
                                                     jint layout, jdoubleArray numbers, jint count,
                                                     jobjectArray strings, jstring json) {
  if (!handle) return;
  jniEntry(env, [&] {
    const auto record = eventRecord(env, layout, numbers, count, strings, json);
    bridge(handle).runtime->dispatch(static_cast<std::uint32_t>(view), javaString(env, event), record);
  });
}

/// The UI thread's message (UIHost::sendEvent) as the app's `ui` event; frees
/// it, delivered or not. A zero handle only frees it: the runtime is gone.
extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_dispatchUIMessage(JNIEnv* env, jobject, jlong handle, jlong message) {
  std::unique_ptr<kuito::PlainValue> held(reinterpret_cast<kuito::PlainValue*>(message));
  if (!handle || !held) return;
  jniEntry(env, [&] { bridge(handle).runtime->dispatch(0, "ui", kuito::valueRecord(std::move(*held))); });
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_recordingOf(JNIEnv* env, jobject, jlong handle) {
  if (!handle) return nullptr;
  return kuito::jniEntry(env, static_cast<jbyteArray>(nullptr), [&] {
    const auto file = bridge(handle).runtime->recording();
    jbyteArray out = env->NewByteArray(static_cast<jsize>(file.size()));
    kuito::requireJava(env, out, "Allocating the recording");
    env->SetByteArrayRegion(out, 0, static_cast<jsize>(file.size()), reinterpret_cast<const jbyte*>(file.data()));
    return out;
  });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_destroy(JNIEnv*, jobject, jlong handle) {
  delete reinterpret_cast<Bridge*>(handle);
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_fireTimer(JNIEnv* env, jobject, jlong handle, jint id) {
  if (!handle) return;
  jniEntry(env, [&] { bridge(handle).runtime->fireTimer(id); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_httpHead(
    JNIEnv* env, jobject, jlong handle, jint id, jint status, jstring url, jobjectArray headers) {
  if (!handle) return;
  jniEntry(env, [&] {
    auto flat = kuito::javaStrings(env, headers);
    kuito::HttpHeaders pairs;
    for (size_t at = 0; at + 1 < flat.size(); at += 2) pairs.emplace_back(flat[at], flat[at + 1]);
    bridge(handle).runtime->httpHead(id, status, javaString(env, url), pairs);
  });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_httpChunk(JNIEnv* env, jobject, jlong handle, jint id, jbyteArray chunk) {
  if (!handle) return;
  jniEntry(env, [&] { bridge(handle).runtime->httpChunk(id, kuito::javaByteVector(env, chunk)); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_httpProgress(
    JNIEnv* env, jobject, jlong handle, jint id, jdouble bytes, jdouble total) {
  if (!handle) return;
  jniEntry(env, [&] { bridge(handle).runtime->httpProgress(id, bytes, total); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_httpEnd(
    JNIEnv* env, jobject, jlong handle, jint id, jbyteArray body, jstring error) {
  if (!handle) return;
  jniEntry(env, [&] {
    bridge(handle).runtime->httpEnd(id, kuito::javaByteVector(env, body), javaString(env, error));
  });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_socketOpen(JNIEnv* env, jobject, jlong handle, jint id, jstring protocol) {
  if (!handle) return;
  jniEntry(env, [&] { bridge(handle).runtime->socketOpen(id, javaString(env, protocol)); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_socketMessage(
    JNIEnv* env, jobject, jlong handle, jint id, jboolean binary, jbyteArray data) {
  if (!handle) return;
  jniEntry(env, [&] {
    bridge(handle).runtime->socketMessage(id, {binary == JNI_TRUE, kuito::javaByteVector(env, data)});
  });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_socketError(JNIEnv* env, jobject, jlong handle, jint id, jstring message) {
  if (!handle) return;
  jniEntry(env, [&] { bridge(handle).runtime->socketError(id, javaString(env, message)); });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_socketClose(
    JNIEnv* env, jobject, jlong handle, jint id, jint code, jstring reason, jboolean clean) {
  if (!handle) return;
  jniEntry(env, [&] {
    bridge(handle).runtime->socketClose(id, code, javaString(env, reason), clean == JNI_TRUE);
  });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_settleLinkCall(JNIEnv* env, jobject, jlong handle, jint call, jobject result) {
  if (!handle) return;
  jniEntry(env, [&] {
    auto& owner = bridge(handle);
    kuito::LinkResult settled;
    try {
      settled = owner.link->result(env, result);
    } catch (const kuito::LinkMismatch& mismatch) {
      settled = kuito::LinkFailure{mismatch.code, mismatch.what()};
    } catch (const std::exception& error) { settled = kuito::LinkFailure{"ERR_NATIVE", error.what()}; }
    owner.runtime->settleLinkCall(call, settled);
  });
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_KuitoNativeRuntime_emitLinkEvent(JNIEnv* env, jobject, jlong handle, jint member, jobject value) {
  if (!handle) return;
  jniEntry(env, [&] {
    auto& owner = bridge(handle);
    auto result = owner.link->result(env, value);
    if (auto failure = std::get_if<kuito::LinkFailure>(&result)) throw std::runtime_error(failure->message);
    owner.runtime->emitLinkEvent(member, std::get<kuito::LinkValue>(result));
  });
}
