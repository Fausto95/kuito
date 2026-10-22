#pragma once

#include <jni.h>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>
#include "JavaException.h"
#include "Mutation.h"
#include <cstdint>

namespace kuito {

/// A local reference, deleted when it goes out of scope, error or not: the JS
/// thread stays attached for the app's life, so a leaked one is never freed.
template <class Ref>
class JavaLocal {
 public:
  JavaLocal(JNIEnv* env, Ref ref) : env_(env), ref_(ref) {}
  ~JavaLocal() { if (ref_) env_->DeleteLocalRef(ref_); }
  JavaLocal(JavaLocal&& other) noexcept : env_(other.env_), ref_(std::exchange(other.ref_, nullptr)) {}
  JavaLocal(const JavaLocal&) = delete;
  JavaLocal& operator=(const JavaLocal&) = delete;
  Ref get() const { return ref_; }

 private:
  JNIEnv* env_;
  Ref ref_;
};

/// A JNI call returned null: the Java exception it left pending, as a C++ error.
inline void requireJava(JNIEnv* env, const void* result, const char* what) {
  rethrowJavaException(env, what);
  if (!result) throw std::runtime_error(std::string(what) + " failed in the JVM");
}

/// A Java string's text; empty for null.
inline std::string javaString(JNIEnv* env, jstring value) {
  if (!value) return "";
  const char* chars = env->GetStringUTFChars(value, nullptr);
  requireJava(env, chars, "Reading a Java string");
  std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

/// A script's bytes: UTF-8 source or Hermes bytecode, which evaluateJavaScript tells apart.
inline std::string javaBytes(JNIEnv* env, jbyteArray value) {
  if (!value) return "";
  std::string result(static_cast<size_t>(env->GetArrayLength(value)), '\0');
  env->GetByteArrayRegion(value, 0, static_cast<jsize>(result.size()), reinterpret_cast<jbyte*>(result.data()));
  rethrowJavaException(env, "Reading a Java byte array");
  return result;
}

inline JavaLocal<jstring> newJavaString(JNIEnv* env, const std::string& value) {
  jstring result = env->NewStringUTF(value.c_str());
  requireJava(env, result, "Creating a Java string");
  return {env, result};
}

/// A byte array's contents, as the HTTP host passes bodies; empty for null.
inline std::vector<std::uint8_t> javaByteVector(JNIEnv* env, jbyteArray value) {
  if (!value) return {};
  std::vector<std::uint8_t> result(static_cast<size_t>(env->GetArrayLength(value)));
  env->GetByteArrayRegion(value, 0, static_cast<jsize>(result.size()), reinterpret_cast<jbyte*>(result.data()));
  rethrowJavaException(env, "Reading a Java byte array");
  return result;
}

inline JavaLocal<jbyteArray> newJavaBytes(JNIEnv* env, const std::vector<std::uint8_t>& bytes) {
  JavaLocal<jbyteArray> array(env, env->NewByteArray(static_cast<jsize>(bytes.size())));
  requireJava(env, array.get(), "Allocating a Java byte array");
  env->SetByteArrayRegion(array.get(), 0, static_cast<jsize>(bytes.size()), reinterpret_cast<const jbyte*>(bytes.data()));
  rethrowJavaException(env, "Filling a Java byte array");
  return array;
}

inline std::vector<std::string> javaStrings(JNIEnv* env, jobjectArray value) {
  std::vector<std::string> result;
  if (!value) return result;
  const auto size = env->GetArrayLength(value);
  result.reserve(static_cast<size_t>(size));
  for (jsize i = 0; i < size; ++i) {
    JavaLocal<jstring> text(env, static_cast<jstring>(env->GetObjectArrayElement(value, i)));
    rethrowJavaException(env, "Reading a Java string array");
    result.push_back(javaString(env, text.get()));
  }
  return result;
}

/// `texts` as a Java String[], of `stringClass` (java.lang.String) found once by the caller.
inline JavaLocal<jobjectArray> newJavaStrings(JNIEnv* env, const std::vector<std::string>& texts, jclass stringClass) {
  JavaLocal<jobjectArray> array(env, env->NewObjectArray(static_cast<jsize>(texts.size()), stringClass, nullptr));
  requireJava(env, array.get(), "Allocating a Java string array");
  for (size_t i = 0; i < texts.size(); ++i) {
    env->SetObjectArrayElement(array.get(), static_cast<jsize>(i), newJavaString(env, texts[i]).get());
    rethrowJavaException(env, "Filling a Java string array");
  }
  return array;
}

inline JavaLocal<jobjectArray> newJavaStrings(JNIEnv* env, const std::vector<std::string>& texts) {
  JavaLocal<jclass> stringClass(env, env->FindClass("java/lang/String"));
  requireJava(env, stringClass.get(), "Finding java.lang.String");
  return newJavaStrings(env, texts, stringClass.get());
}

/// A Kotlin callback the native host calls; a missing one fails by name.
inline jmethodID javaMethod(JNIEnv* env, jclass type, const char* name, const char* signature) {
  jmethodID method = env->GetMethodID(type, name, signature);
  requireJava(env, method, (std::string("Kotlin callback ") + name).c_str());
  return method;
}

/// What every batch names again, found or made once for the process and
/// held by global references: the array classes, and the strings a batch
/// repeats from a small, fixed set (a view's kind, a command's name).
/// Batches go out on the main thread; the cache is that thread's alone.
class JavaBatchCache {
public:
  explicit JavaBatchCache(JNIEnv* env)
      : string_(global(env, "java/lang/String")), ints_(global(env, "[I")), strings_(global(env, "[Ljava/lang/String;")),
        doubles_(global(env, "[D")), thread_(std::this_thread::get_id()) {}

  /// A batch sent from another thread than the first is a bug in its caller.
  void requireThread() const {
    if (std::this_thread::get_id() != thread_)
      throw std::logic_error("KUITO_BATCH_THREAD: a batch went to Kotlin off the main thread");
  }

  jclass string() const { return string_; }
  jclass ints() const { return ints_; }
  jclass strings() const { return strings_; }
  jclass doubles() const { return doubles_; }

  /// `text` as a Java string made the first time it is asked for.
  jstring interned(JNIEnv* env, const std::string& text) {
    const auto found = interned_.find(text);
    if (found != interned_.end()) return found->second;
    auto made = newJavaString(env, text);
    auto held = static_cast<jstring>(env->NewGlobalRef(made.get()));
    requireJava(env, held, "Keeping a Java string");
    return interned_.emplace(text, held).first->second;
  }

private:
  static jclass global(JNIEnv* env, const char* name) {
    JavaLocal<jclass> local(env, env->FindClass(name));
    requireJava(env, local.get(), (std::string("Finding ") + name).c_str());
    auto held = static_cast<jclass>(env->NewGlobalRef(local.get()));
    requireJava(env, held, (std::string("Keeping ") + name).c_str());
    return held;
  }

  jclass string_, ints_, strings_, doubles_;
  std::thread::id thread_;
  std::unordered_map<std::string, jstring> interned_;
};

inline JavaBatchCache& javaBatchCache(JNIEnv* env) {
  static JavaBatchCache cache(env);
  return cache;
}

/// The Kotlin callback sendBatch calls: the batch's mutation arrays, then its
/// host calls and sent time (KuitoMutations.kt).
inline constexpr const char* kBatchSignature =
    "([I[I[I[I[I[I[D[Ljava/lang/String;[Ljava/lang/String;[[I[[Ljava/lang/String;[[D[[Ljava/lang/String;ID)V";

/// Calls `callback` on `receiver` with the batch as parallel arrays, record
/// i at index i of each (KuitoMutations.kt): op, value kind, prop key, id,
/// parent, an int (a move's index, a create's or flatten's flattened, a
/// color, an enum's index), a number, text and name (null when empty), a
/// Keys value's edits as each edit's op and index in turn and as its keys
/// (null for other records), a Struct value's record as its numbers and its
/// strings (null for other records, and where the record has none), then how
/// many `__kuitoHostCommit` calls carried the job's batch and when the JS
/// thread sent it (uptime milliseconds).
inline void sendBatch(JNIEnv* env, jobject receiver, jmethodID callback, const std::vector<Mutation>& changes,
                      jint hostCalls, jdouble sentAt, const char* what) {
  if (changes.empty()) return;
  const auto size = static_cast<jsize>(changes.size());
  std::vector<jint> ops(changes.size()), kinds(changes.size()), keys(changes.size()), ids(changes.size()),
      parents(changes.size()), ints(changes.size());
  std::vector<jdouble> numbers(changes.size());
  for (size_t i = 0; i < changes.size(); ++i) {
    const Mutation& m = changes[i];
    ops[i] = static_cast<jint>(m.op);
    kinds[i] = static_cast<jint>(m.kind);
    keys[i] = static_cast<jint>(static_cast<std::uint16_t>(m.key));
    ids[i] = static_cast<jint>(m.id);
    parents[i] = static_cast<jint>(m.parent);
    ints[i] = m.op == Op::Move                                   ? m.index
              : m.op == Op::Create || m.op == Op::Flatten        ? (m.flattened ? 1 : 0)
              : m.kind == Value::Color                           ? static_cast<jint>(m.color)
              : m.kind == Value::Enum                            ? m.enumValue
                                                                 : 0;
    numbers[i] = m.number;
  }
  const auto ints32 = [&](const std::vector<jint>& values) {
    JavaLocal<jintArray> array(env, env->NewIntArray(size));
    requireJava(env, array.get(), "Allocating a batch");
    env->SetIntArrayRegion(array.get(), 0, size, values.data());
    rethrowJavaException(env, "Filling a batch");
    return array;
  };
  JavaBatchCache& cache = javaBatchCache(env);
  cache.requireThread();
  const auto javaStrings = [&](const std::vector<std::string>& texts) { return newJavaStrings(env, texts, cache.string()); };
  // A create's kind and a command's name come from a fixed set: each is made
  // once. Labels, texts and a module prop's name are each record's own.
  const auto strings = [&](std::string Mutation::*field, auto repeats) {
    JavaLocal<jobjectArray> array(env, env->NewObjectArray(size, cache.string(), nullptr));
    requireJava(env, array.get(), "Allocating a batch");
    for (jsize i = 0; i < size; ++i) {
      const Mutation& m = changes[static_cast<size_t>(i)];
      const std::string& text = m.*field;
      if (text.empty()) continue;
      if (repeats(m)) env->SetObjectArrayElement(array.get(), i, cache.interned(env, text));
      else env->SetObjectArrayElement(array.get(), i, newJavaString(env, text).get());
      rethrowJavaException(env, "Filling a batch");
    }
    return array;
  };
  auto opArray = ints32(ops), kindArray = ints32(kinds), keyArray = ints32(keys), idArray = ints32(ids),
       parentArray = ints32(parents), intArray = ints32(ints);
  JavaLocal<jdoubleArray> numberArray(env, env->NewDoubleArray(size));
  requireJava(env, numberArray.get(), "Allocating a batch");
  env->SetDoubleArrayRegion(numberArray.get(), 0, size, numbers.data());
  rethrowJavaException(env, "Filling a batch");
  auto texts = strings(&Mutation::text, [](const Mutation& m) { return m.op == Op::Create; });
  auto names = strings(&Mutation::name, [](const Mutation& m) { return m.op == Op::Command; });
  JavaLocal<jobjectArray> edits(env, env->NewObjectArray(size, cache.ints(), nullptr));
  requireJava(env, edits.get(), "Allocating a batch");
  JavaLocal<jobjectArray> editKeys(env, env->NewObjectArray(size, cache.strings(), nullptr));
  requireJava(env, editKeys.get(), "Allocating a batch");
  for (jsize i = 0; i < size; ++i) {
    const Mutation& m = changes[static_cast<size_t>(i)];
    if (m.kind != Value::Keys) continue;
    std::vector<jint> numbers;
    std::vector<std::string> keys;
    numbers.reserve(m.edits.size() * 2);
    keys.reserve(m.edits.size());
    for (const KeyEdit& edit : m.edits) {
      numbers.push_back(static_cast<jint>(edit.op));
      numbers.push_back(edit.index);
      keys.push_back(edit.key);
    }
    JavaLocal<jintArray> editNumbers(env, env->NewIntArray(static_cast<jsize>(numbers.size())));
    requireJava(env, editNumbers.get(), "Allocating a batch");
    env->SetIntArrayRegion(editNumbers.get(), 0, static_cast<jsize>(numbers.size()), numbers.data());
    env->SetObjectArrayElement(edits.get(), i, editNumbers.get());
    env->SetObjectArrayElement(editKeys.get(), i, javaStrings(keys).get());
    rethrowJavaException(env, "Filling a batch");
  }
  JavaLocal<jobjectArray> recordNumbers(env, env->NewObjectArray(size, cache.doubles(), nullptr));
  requireJava(env, recordNumbers.get(), "Allocating a batch");
  JavaLocal<jobjectArray> recordStrings(env, env->NewObjectArray(size, cache.strings(), nullptr));
  requireJava(env, recordStrings.get(), "Allocating a batch");
  for (jsize i = 0; i < size; ++i) {
    const Mutation& m = changes[static_cast<size_t>(i)];
    if (m.kind != Value::Struct) continue;
    if (!m.record.numbers.empty()) {
      const auto count = static_cast<jsize>(m.record.numbers.size());
      JavaLocal<jdoubleArray> values(env, env->NewDoubleArray(count));
      requireJava(env, values.get(), "Allocating a batch");
      env->SetDoubleArrayRegion(values.get(), 0, count, m.record.numbers.data());
      env->SetObjectArrayElement(recordNumbers.get(), i, values.get());
    }
    if (!m.record.strings.empty())
      env->SetObjectArrayElement(recordStrings.get(), i, javaStrings(m.record.strings).get());
    rethrowJavaException(env, "Filling a batch");
  }
  env->CallVoidMethod(receiver, callback, opArray.get(), kindArray.get(), keyArray.get(), idArray.get(),
                      parentArray.get(), intArray.get(), numberArray.get(), texts.get(), names.get(), edits.get(),
                      editKeys.get(), recordNumbers.get(), recordStrings.get(), hostCalls, sentAt);
  rethrowJavaException(env, what);
}

} // namespace kuito
