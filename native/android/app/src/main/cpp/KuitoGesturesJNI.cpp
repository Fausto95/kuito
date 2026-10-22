// JNI binding of the shared gesture arbitration (native/shared/gestures) for
// GestureTable.kt and GestureArbiter.kt.
#include "gestures/GestureArbiter.h"
#include <jni.h>
#include <exception>
#include <memory>
#include <string>
#include <stdexcept>
#include <vector>

namespace gestures = kuito::gestures;

namespace {

// The UI thread's environment for the call in progress: every arbiter
// callback runs inside a call from Kotlin, on that thread.
thread_local JNIEnv* callEnv = nullptr;

// A Kotlin callback threw: unwinds the C++ to the JNI entry, which returns
// with the Java exception still pending.
struct JavaThrew {};

// The table and the number of arbiters reading it, which must reach zero
// before the table goes.
struct Table {
  gestures::GestureTable table;
  int arbiters = 0;
};

Table& tableOf(jlong handle) { return *reinterpret_cast<Table*>(handle); }

// Calls GestureArbiter.kt's on* methods: what only the views and recognizers know.
class Host final : public gestures::GestureHost {
public:
  Host(JNIEnv* env, jobject owner) {
    jclass type = env->GetObjectClass(owner);
    sharePointers_ = method(env, type, "onSharePointers", "(II)Z");
    inside_ = method(env, type, "onInside", "(II)Z");
    cancelling_ = method(env, type, "onCancelling", "(I)V");
    changed_ = method(env, type, "onChanged", "(III)V");
    send_ = method(env, type, "onSend", "(III)V");
    reset_ = method(env, type, "onReset", "(I)V");
    env->DeleteLocalRef(type);
    owner_ = env->NewGlobalRef(owner);
  }
  ~Host() { callEnv->DeleteGlobalRef(owner_); }
  Host(const Host&) = delete;
  Host& operator=(const Host&) = delete;

  bool sharePointers(int a, int b) override {
    return checked(callEnv->CallBooleanMethod(owner_, sharePointers_, a, b));
  }
  bool inside(int gesture, int other) override {
    return checked(callEnv->CallBooleanMethod(owner_, inside_, gesture, other));
  }
  void cancelling(int tag) override {
    callEnv->CallVoidMethod(owner_, cancelling_, tag);
    checked(true);
  }
  void changed(int tag, gestures::State now, gestures::State before) override {
    callEnv->CallVoidMethod(owner_, changed_, tag, static_cast<jint>(now), static_cast<jint>(before));
    checked(true);
  }
  void send(int tag, gestures::State now, gestures::State before) override {
    callEnv->CallVoidMethod(owner_, send_, tag, static_cast<jint>(now), static_cast<jint>(before));
    checked(true);
  }
  void reset(int tag) override {
    callEnv->CallVoidMethod(owner_, reset_, tag);
    checked(true);
  }

private:
  // A callback GestureArbiter.kt lacks; JNI allows no call with its
  // NoSuchMethodError pending, so it is cleared and reported as C++.
  static jmethodID method(JNIEnv* env, jclass type, const char* name, const char* signature) {
    jmethodID id = env->GetMethodID(type, name, signature);
    if (id) return id;
    env->ExceptionClear();
    env->DeleteLocalRef(type);
    throw std::runtime_error(std::string("KUITO_GESTURES_BIND: GestureArbiter lacks ") + name);
  }

  static bool checked(jboolean result) {
    if (callEnv->ExceptionCheck()) throw JavaThrew{};
    return result;
  }

  jobject owner_ = nullptr;
  jmethodID sharePointers_;
  jmethodID inside_;
  jmethodID cancelling_;
  jmethodID changed_;
  jmethodID send_;
  jmethodID reset_;
};

struct Arbiter {
  Arbiter(JNIEnv* env, Table& table, jobject owner) : table(table), host(env, owner), arbiter(table.table, host) {
    ++table.arbiters;
  }
  ~Arbiter() { --table.arbiters; }

  Table& table;
  Host host;
  gestures::GestureArbiter arbiter;
};

Arbiter& arbiterOf(jlong handle) { return *reinterpret_cast<Arbiter*>(handle); }

std::vector<int> tags(JNIEnv* env, jintArray values) {
  std::vector<int> result(static_cast<std::size_t>(env->GetArrayLength(values)));
  env->GetIntArrayRegion(values, 0, static_cast<jsize>(result.size()), reinterpret_cast<jint*>(result.data()));
  return result;
}

// Runs one call from Kotlin: a Kotlin callback's exception stays pending,
// a C++ one becomes an IllegalStateException.
template <typename Body>
auto guarded(JNIEnv* env, Body body, decltype(body()) fallback) -> decltype(body()) {
  JNIEnv* outer = callEnv;
  callEnv = env;
  try {
    auto result = body();
    callEnv = outer;
    return result;
  } catch (const JavaThrew&) {
  } catch (const std::exception& error) {
    if (!env->ExceptionCheck())
      if (jclass type = env->FindClass("java/lang/IllegalStateException")) env->ThrowNew(type, error.what());
  }
  callEnv = outer;
  return fallback;
}

template <typename Body>
void guardedVoid(JNIEnv* env, Body body) {
  guarded(
      env,
      [&] {
        body();
        return true;
      },
      false);
}

} // namespace

#define TABLE(name) Java_dev_kuito_runtime_renderer_gestures_GestureTable_##name
#define ARBITER(name) Java_dev_kuito_runtime_renderer_gestures_GestureArbiter_##name

extern "C" JNIEXPORT jlong JNICALL TABLE(nativeCreate)(JNIEnv*, jobject) {
  return reinterpret_cast<jlong>(new Table());
}

extern "C" JNIEXPORT jboolean JNICALL TABLE(nativeDestroy)(JNIEnv*, jobject, jlong handle) {
  if (tableOf(handle).arbiters != 0) return false;
  delete reinterpret_cast<Table*>(handle);
  return true;
}

extern "C" JNIEXPORT void JNICALL TABLE(nativeSetRelations)(JNIEnv* env, jobject, jlong handle, jint tag,
                                                            jintArray waitFor, jintArray simultaneous,
                                                            jintArray blocks) {
  guardedVoid(env, [&] {
    tableOf(handle).table.relations.set(tag, {tags(env, waitFor), tags(env, simultaneous), tags(env, blocks)});
  });
}

extern "C" JNIEXPORT jboolean JNICALL TABLE(nativeWaitsFor)(JNIEnv*, jobject, jlong handle, jint gesture, jint other) {
  return tableOf(handle).table.relations.waitsFor(gesture, other);
}

extern "C" JNIEXPORT jboolean JNICALL TABLE(nativeSimultaneous)(JNIEnv*, jobject, jlong handle, jint a, jint b) {
  return tableOf(handle).table.relations.simultaneous(a, b);
}

extern "C" JNIEXPORT jint JNICALL TABLE(nativeState)(JNIEnv*, jobject, jlong handle, jint tag) {
  return static_cast<jint>(tableOf(handle).table.state(tag));
}

// The guarded changes, by number: 0 begin, 1 activate, 2 end, 3 fail, 4 cancel.
extern "C" JNIEXPORT void JNICALL TABLE(nativeChange)(JNIEnv* env, jobject, jlong handle, jint tag, jint change) {
  guardedVoid(env, [&] {
    gestures::GestureTable& table = tableOf(handle).table;
    switch (change) {
    case 0: table.begin(tag); break;
    case 1: table.activate(tag); break;
    case 2: table.end(tag); break;
    case 3: table.fail(tag); break;
    case 4: table.cancel(tag); break;
    default: throw std::invalid_argument("KUITO_GESTURES_CHANGE: no change numbered " + std::to_string(change));
    }
  });
}

extern "C" JNIEXPORT void JNICALL TABLE(nativeDrop)(JNIEnv* env, jobject, jlong handle, jint tag) {
  guardedVoid(env, [&] { tableOf(handle).table.drop(tag); });
}

extern "C" JNIEXPORT jlong JNICALL ARBITER(nativeCreate)(JNIEnv* env, jobject owner, jlong table) {
  return guarded(env, [&] { return reinterpret_cast<jlong>(new Arbiter(env, tableOf(table), owner)); }, jlong{0});
}

extern "C" JNIEXPORT void JNICALL ARBITER(nativeDestroy)(JNIEnv* env, jobject, jlong handle) {
  guardedVoid(env, [&] {
    std::unique_ptr<Arbiter> arbiter(reinterpret_cast<Arbiter*>(handle));
    arbiter->arbiter.clear();
  });
}

extern "C" JNIEXPORT void JNICALL ARBITER(nativeRecord)(JNIEnv* env, jobject, jlong handle, jint tag) {
  guardedVoid(env, [&] { arbiterOf(handle).arbiter.record(tag); });
}

extern "C" JNIEXPORT jboolean JNICALL ARBITER(nativeRecorded)(JNIEnv* env, jobject, jlong handle, jint tag) {
  return guarded(env, [&] { return static_cast<jboolean>(arbiterOf(handle).arbiter.recorded(tag)); }, jboolean{false});
}

extern "C" JNIEXPORT jintArray JNICALL ARBITER(nativeOrder)(JNIEnv* env, jobject, jlong handle) {
  return guarded(
      env,
      [&] {
        const std::vector<int> order = arbiterOf(handle).arbiter.order();
        jintArray result = env->NewIntArray(static_cast<jsize>(order.size()));
        if (!result) throw std::runtime_error("KUITO_GESTURES_ORDER: allocating the delivery order failed");
        env->SetIntArrayRegion(result, 0, static_cast<jsize>(order.size()),
                               reinterpret_cast<const jint*>(order.data()));
        return result;
      },
      static_cast<jintArray>(nullptr));
}

extern "C" JNIEXPORT jboolean JNICALL ARBITER(nativeAwaiting)(JNIEnv* env, jobject, jlong handle, jint tag) {
  return guarded(env, [&] { return static_cast<jboolean>(arbiterOf(handle).arbiter.awaiting(tag)); }, jboolean{false});
}

extern "C" JNIEXPORT jboolean JNICALL ARBITER(nativeActive)(JNIEnv* env, jobject, jlong handle, jint tag) {
  return guarded(env, [&] { return static_cast<jboolean>(arbiterOf(handle).arbiter.active(tag)); }, jboolean{false});
}

extern "C" JNIEXPORT jboolean JNICALL ARBITER(nativeTakeResetProgress)(JNIEnv* env, jobject, jlong handle, jint tag) {
  return guarded(
      env, [&] { return static_cast<jboolean>(arbiterOf(handle).arbiter.takeResetProgress(tag)); }, jboolean{false});
}

extern "C" JNIEXPORT jboolean JNICALL ARBITER(nativeAnyActive)(JNIEnv* env, jobject, jlong handle) {
  return guarded(env, [&] { return static_cast<jboolean>(arbiterOf(handle).arbiter.anyActive()); }, jboolean{false});
}

extern "C" JNIEXPORT void JNICALL ARBITER(nativeBeginTouch)(JNIEnv* env, jobject, jlong handle) {
  guardedVoid(env, [&] { arbiterOf(handle).arbiter.beginTouch(); });
}

extern "C" JNIEXPORT void JNICALL ARBITER(nativeEndTouch)(JNIEnv* env, jobject, jlong handle) {
  guardedVoid(env, [&] { arbiterOf(handle).arbiter.endTouch(); });
}

extern "C" JNIEXPORT void JNICALL ARBITER(nativeCancelAll)(JNIEnv* env, jobject, jlong handle) {
  guardedVoid(env, [&] { arbiterOf(handle).arbiter.cancelAll(); });
}

extern "C" JNIEXPORT void JNICALL ARBITER(nativeCancelApp)(JNIEnv* env, jobject, jlong handle) {
  guardedVoid(env, [&] { arbiterOf(handle).arbiter.cancelApp(); });
}
