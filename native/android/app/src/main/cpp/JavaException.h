#pragma once

#include <jni.h>
#include <stdexcept>
#include <string>

namespace kuito {

/// After every upcall into Kotlin: a pending Java exception becomes a C++ error
/// that says what threw. JNI must not be called again while one is pending (the
/// VM aborts the app), so it is cleared before anything else. Thrown inside a
/// host function, the error reaches JavaScript and, uncaught, the LogBox.
inline void rethrowJavaException(JNIEnv* env, const char* what) {
  if (!env->ExceptionCheck()) return;
  jthrowable thrown = env->ExceptionOccurred();
  env->ExceptionClear();
  std::string message = std::string(what) + " threw in Kotlin";
  if (!thrown) throw std::runtime_error(message);
  jclass type = env->GetObjectClass(thrown);
  jmethodID toString = env->GetMethodID(type, "toString", "()Ljava/lang/String;");
  auto description = toString ? static_cast<jstring>(env->CallObjectMethod(thrown, toString)) : nullptr;
  if (env->ExceptionCheck()) env->ExceptionClear();
  if (description) {
    if (const char* chars = env->GetStringUTFChars(description, nullptr)) {
      message += std::string(": ") + chars;
      env->ReleaseStringUTFChars(description, chars);
    }
    env->DeleteLocalRef(description);
  }
  env->DeleteLocalRef(type);
  env->DeleteLocalRef(thrown);
  throw std::runtime_error(message);
}

/// A C++ error leaving a JNI entry point, as an IllegalStateException for the
/// Kotlin caller. A Java exception already pending is the one Kotlin gets: no
/// other JNI call is allowed until it is handled.
inline void throwJava(JNIEnv* env, const char* message) {
  if (env->ExceptionCheck()) return;
  jclass type = env->FindClass("java/lang/IllegalStateException");
  if (!type) return; // FindClass left its own error pending.
  env->ThrowNew(type, message);
  env->DeleteLocalRef(type);
}

/// The body of a JNI entry point. An error escaping into the VM aborts the app,
/// so every one, of any type, becomes a Java exception and `fallback` is returned.
template <class Result, class Work>
Result jniEntry(JNIEnv* env, Result fallback, Work&& work) noexcept {
  try { return work(); }
  catch (const std::exception& error) { throwJava(env, error.what()); }
  catch (...) { throwJava(env, "Kuito native code threw a non-standard error"); }
  return fallback;
}

template <class Work>
void jniEntry(JNIEnv* env, Work&& work) noexcept {
  jniEntry(env, 0, [&] { work(); return 0; });
}

} // namespace kuito
