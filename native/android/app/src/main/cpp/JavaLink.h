#pragma once
// Link values (native/shared/Link.h) as Kotlin's linker reads them
// (dev.kuito.runtime.link): null, Double, Boolean, String, a direct
// ByteBuffer for bytes, Object[] for a list or a spec's struct (its fields in
// declared order) and KuitoEntries for string-keyed entries; a result may
// also be a KuitoLinkFailure.
#include "../../../../../shared/Link.h"
#include "JavaValues.h"
#include <jni.h>
#include <cstdint>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace kuito {

/// `member`'s signature from the receiver's `onLinkSignature`, empty for one the shell does not link.
inline std::string linkSignature(JNIEnv* env, jobject receiver, jmethodID method, int member) {
  JavaLocal<jstring> signature(env, static_cast<jstring>(env->CallObjectMethod(receiver, method, member)));
  rethrowJavaException(env, "Native module signature");
  return signature.get() ? javaString(env, signature.get()) : std::string();
}

/// A direct ByteBuffer's bytes, from position 0 to its limit: `buffer` is a
/// slice of its own, so no one's position moves what the ArrayBuffer shares,
/// held until the ArrayBuffer and every call holding it let go.
class JavaBytes final : public LinkBuffer {
 public:
  JavaBytes(JNIEnv* env, jobject buffer, std::uint8_t* data, std::size_t size)
      : buffer_(env->NewGlobalRef(buffer)), data_(data), size_(size) {
    requireJava(env, buffer_, "Holding a module's bytes");
    env->GetJavaVM(&vm_);
  }

  // The garbage collector may free the ArrayBuffer on a thread of its own,
  // unknown to the VM: it attaches to let the buffer go.
  ~JavaBytes() override {
    JNIEnv* env = nullptr;
    if (vm_->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK &&
        vm_->AttachCurrentThreadAsDaemon(&env, nullptr) != JNI_OK)
      return;
    env->DeleteGlobalRef(buffer_);
  }

  std::uint8_t* data() override { return data_; }
  std::size_t size() const override { return size_; }
  jobject buffer() const { return buffer_; }

 private:
  JavaVM* vm_ = nullptr;
  jobject buffer_;
  std::uint8_t* data_;
  std::size_t size_;
};

class JavaLink {
 public:
  explicit JavaLink(JNIEnv* env)
      : number_(global(env, "java/lang/Number")), double_(global(env, "java/lang/Double")),
        boolean_(global(env, "java/lang/Boolean")), string_(global(env, "java/lang/String")),
        object_(global(env, "java/lang/Object")), objects_(global(env, "[Ljava/lang/Object;")),
        entries_(global(env, "dev/kuito/runtime/link/KuitoEntries")), buffer_(global(env, "java/nio/ByteBuffer")),
        failure_(global(env, "dev/kuito/runtime/link/KuitoLinkFailure")) {
    doubleOf_ = staticMethod(env, double_, "valueOf", "(D)Ljava/lang/Double;");
    booleanOf_ = staticMethod(env, boolean_, "valueOf", "(Z)Ljava/lang/Boolean;");
    doubleValue_ = method(env, number_, "doubleValue", "()D");
    booleanValue_ = method(env, boolean_, "booleanValue", "()Z");
    entriesInit_ = method(env, entries_, "<init>", "([Ljava/lang/String;[Ljava/lang/Object;)V");
    allocateDirect_ = staticMethod(env, buffer_, "allocateDirect", "(I)Ljava/nio/ByteBuffer;");
    slice_ = method(env, buffer_, "slice", "()Ljava/nio/ByteBuffer;");
    duplicate_ = method(env, buffer_, "duplicate", "()Ljava/nio/ByteBuffer;");
    remaining_ = method(env, buffer_, "remaining", "()I");
    entriesKeys_ = field(env, entries_, "keys", "[Ljava/lang/String;");
    entriesValues_ = field(env, entries_, "values", "[Ljava/lang/Object;");
    failureCode_ = field(env, failure_, "code", "Ljava/lang/String;");
    failureMessage_ = field(env, failure_, "message", "Ljava/lang/String;");
  }

  /// The global references go with the bridge, on a thread attached to the VM.
  void release(JNIEnv* env) {
    for (jclass type : {number_, double_, boolean_, string_, object_, objects_, entries_, buffer_, failure_})
      env->DeleteGlobalRef(type);
  }

  JavaLocal<jobject> arguments(JNIEnv* env, const std::vector<LinkValue>& values) const {
    return array(env, values, "Creating a module function's arguments");
  }

  /// Room for `size` bytes JavaScript made, in a direct ByteBuffer Kotlin reads as it is.
  std::shared_ptr<LinkBuffer> allocate(JNIEnv* env, std::size_t size) const {
    if (size > static_cast<std::size_t>(INT32_MAX)) throw std::runtime_error("An ArrayBuffer over 2 GB cannot cross");
    JavaLocal<jobject> made(env, env->CallStaticObjectMethod(buffer_, allocateDirect_, static_cast<jint>(size)));
    requireJava(env, made.get(), "Allocating a module's bytes");
    return std::make_shared<JavaBytes>(env, made.get(), static_cast<std::uint8_t*>(env->GetDirectBufferAddress(made.get())),
                                       size);
  }

  LinkResult result(JNIEnv* env, jobject value) const {
    if (value && env->IsInstanceOf(value, failure_)) {
      return LinkFailure{text(env, value, failureCode_), text(env, value, failureMessage_)};
    }
    return read(env, value);
  }

 private:
  static jclass global(JNIEnv* env, const char* name) {
    JavaLocal<jclass> local(env, env->FindClass(name));
    requireJava(env, local.get(), name);
    auto type = static_cast<jclass>(env->NewGlobalRef(local.get()));
    requireJava(env, type, name);
    return type;
  }

  static jmethodID method(JNIEnv* env, jclass type, const char* name, const char* signature) {
    jmethodID id = env->GetMethodID(type, name, signature);
    requireJava(env, id, name);
    return id;
  }

  static jmethodID staticMethod(JNIEnv* env, jclass type, const char* name, const char* signature) {
    jmethodID id = env->GetStaticMethodID(type, name, signature);
    requireJava(env, id, name);
    return id;
  }

  static jfieldID field(JNIEnv* env, jclass type, const char* name, const char* signature) {
    jfieldID id = env->GetFieldID(type, name, signature);
    requireJava(env, id, name);
    return id;
  }

  static std::string text(JNIEnv* env, jobject owner, jfieldID id) {
    JavaLocal<jstring> value(env, static_cast<jstring>(env->GetObjectField(owner, id)));
    rethrowJavaException(env, "Reading a module function's result");
    return javaString(env, value.get());
  }

  JavaLocal<jobject> array(JNIEnv* env, const std::vector<LinkValue>& values, const char* what) const {
    JavaLocal<jobject> made(env, env->NewObjectArray(static_cast<jsize>(values.size()), object_, nullptr));
    requireJava(env, made.get(), what);
    for (size_t i = 0; i < values.size(); ++i) {
      auto value = object(env, values[i]);
      env->SetObjectArrayElement(static_cast<jobjectArray>(made.get()), static_cast<jsize>(i), value.get());
      rethrowJavaException(env, what);
    }
    return made;
  }

  JavaLocal<jobject> object(JNIEnv* env, const LinkValue& value) const {
    constexpr const char* what = "Creating a module function's argument";
    jobject made = nullptr;
    switch (value.kind) {
    case LinkValue::Kind::Null: return {env, nullptr};
    case LinkValue::Kind::Boolean: made = env->CallStaticObjectMethod(boolean_, booleanOf_, value.flag); break;
    case LinkValue::Kind::Number: made = env->CallStaticObjectMethod(double_, doubleOf_, value.number); break;
    case LinkValue::Kind::Text: made = env->NewStringUTF(value.text.c_str()); break;
    case LinkValue::Kind::Bytes: {
      auto java = std::dynamic_pointer_cast<JavaBytes>(value.bytes);
      if (!java) {
        java = std::static_pointer_cast<JavaBytes>(allocate(env, value.bytes->size()));
        if (value.bytes->size()) std::memcpy(java->data(), value.bytes->data(), value.bytes->size());
      }
      // Its own position and limit, as every argument has.
      made = env->CallObjectMethod(java->buffer(), duplicate_);
      break;
    }
    case LinkValue::Kind::List: return array(env, value.items, what);
    case LinkValue::Kind::Entries: {
      const auto count = static_cast<jsize>(value.keys.size());
      JavaLocal<jobjectArray> keys(env, env->NewObjectArray(count, string_, nullptr));
      requireJava(env, keys.get(), what);
      for (jsize i = 0; i < count; ++i) {
        auto key = newJavaString(env, value.keys[static_cast<size_t>(i)]);
        env->SetObjectArrayElement(keys.get(), i, key.get());
        rethrowJavaException(env, what);
      }
      auto values = array(env, value.items, what);
      made = env->NewObject(entries_, entriesInit_, keys.get(), values.get());
      break;
    }
    }
    rethrowJavaException(env, what);
    return {env, made};
  }

  std::vector<LinkValue> items(JNIEnv* env, jobjectArray array) const {
    const jsize count = env->GetArrayLength(array);
    std::vector<LinkValue> read;
    read.reserve(static_cast<size_t>(count));
    for (jsize i = 0; i < count; ++i) {
      JavaLocal<jobject> item(env, env->GetObjectArrayElement(array, i));
      rethrowJavaException(env, "Reading a module function's result");
      read.push_back(this->read(env, item.get()));
    }
    return read;
  }

  // KuitoCrossing let only these through.
  LinkValue read(JNIEnv* env, jobject value) const {
    if (!value) return {};
    if (env->IsInstanceOf(value, boolean_)) {
      bool flag = env->CallBooleanMethod(value, booleanValue_) == JNI_TRUE;
      rethrowJavaException(env, "Reading a module function's result");
      return LinkValue::boolean(flag);
    }
    if (env->IsInstanceOf(value, number_)) {
      double number = env->CallDoubleMethod(value, doubleValue_);
      rethrowJavaException(env, "Reading a module function's result");
      return LinkValue::numeric(number);
    }
    if (env->IsInstanceOf(value, string_)) return LinkValue::string(javaString(env, static_cast<jstring>(value)));
    if (env->IsInstanceOf(value, buffer_)) {
      // From its position to its limit, as a buffer of its own; KuitoCrossing hands over writable direct ones.
      JavaLocal<jobject> slice(env, env->CallObjectMethod(value, slice_));
      requireJava(env, slice.get(), "Reading a module function's result");
      auto* address = static_cast<std::uint8_t*>(env->GetDirectBufferAddress(slice.get()));
      const jint remaining = env->CallIntMethod(slice.get(), remaining_);
      rethrowJavaException(env, "Reading a module function's result");
      if (!address && remaining > 0) throw LinkMismatch("ERR_ENCODE", "the result's ByteBuffer is not direct");
      return LinkValue::buffer(
          std::make_shared<JavaBytes>(env, slice.get(), address, static_cast<std::size_t>(remaining)));
    }
    if (env->IsInstanceOf(value, objects_)) return LinkValue::list(items(env, static_cast<jobjectArray>(value)));
    if (env->IsInstanceOf(value, entries_)) {
      JavaLocal<jobjectArray> keys(env, static_cast<jobjectArray>(env->GetObjectField(value, entriesKeys_)));
      JavaLocal<jobjectArray> values(env, static_cast<jobjectArray>(env->GetObjectField(value, entriesValues_)));
      requireJava(env, keys.get(), "Reading a module function's result");
      requireJava(env, values.get(), "Reading a module function's result");
      const jsize count = env->GetArrayLength(keys.get());
      std::vector<std::string> names;
      names.reserve(static_cast<size_t>(count));
      for (jsize i = 0; i < count; ++i) {
        JavaLocal<jstring> key(env, static_cast<jstring>(env->GetObjectArrayElement(keys.get(), i)));
        rethrowJavaException(env, "Reading a module function's result");
        names.push_back(javaString(env, key.get()));
      }
      return LinkValue::entries(std::move(names), items(env, values.get()));
    }
    throw LinkMismatch("ERR_ENCODE", "the result is not plain data");
  }

  jclass number_, double_, boolean_, string_, object_, objects_, entries_, buffer_, failure_;
  jmethodID doubleOf_, booleanOf_, doubleValue_, booleanValue_, entriesInit_, allocateDirect_, slice_, duplicate_,
      remaining_;
  jfieldID entriesKeys_, entriesValues_, failureCode_, failureMessage_;
};

} // namespace kuito
