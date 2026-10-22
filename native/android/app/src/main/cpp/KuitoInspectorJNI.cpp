// The device side of `kuito dev`'s debugger proxy (docs/devtools.md) for
// dev.kuito.runtime.devtools.KuitoInspector: frames in from its socket,
// frames out through its onFrame, from any thread.
#include "KuitoInspectorJNI.h"
#include "../../../../../shared/Inspector.h"
#include <string>

namespace {
/// Kotlin's side of the socket. Shared by the device's send function, which
/// can outlive the handle while a runtime still holds the device.
struct Sink {
  JavaVM* vm;
  jobject receiver;
  jmethodID frame;
  ~Sink() {
    if (auto env = inspectorEnv(vm)) env->DeleteGlobalRef(receiver);
  }
};

struct Handle {
  std::shared_ptr<kuito::InspectorDevice> device;
};

// Frames cross as UTF-8 bytes: JNI strings are modified UTF-8, which differs
// from the JSON's UTF-8 for characters outside the BMP.
std::string bytes(JNIEnv* env, jbyteArray value) {
  if (!value) return "";
  std::string result(static_cast<size_t>(env->GetArrayLength(value)), '\0');
  env->GetByteArrayRegion(value, 0, static_cast<jsize>(result.size()), reinterpret_cast<jbyte*>(result.data()));
  return result;
}
} // namespace

JNIEnv* inspectorEnv(JavaVM* vm) {
  JNIEnv* env = nullptr;
  if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) == JNI_OK) return env;
  return vm->AttachCurrentThreadAsDaemon(&env, nullptr) == JNI_OK ? env : nullptr;
}

std::shared_ptr<kuito::InspectorDevice> inspectorDevice(jlong handle) {
  return handle ? reinterpret_cast<Handle*>(handle)->device : nullptr;
}

extern "C" JNIEXPORT jlong JNICALL
Java_dev_kuito_runtime_devtools_KuitoInspector_nativeCreate(JNIEnv* env, jobject thiz) {
  auto sink = std::make_shared<Sink>();
  env->GetJavaVM(&sink->vm);
  sink->receiver = env->NewGlobalRef(thiz);
  auto clazz = env->GetObjectClass(thiz);
  sink->frame = env->GetMethodID(clazz, "onFrame", "([B)V");
  env->DeleteLocalRef(clazz);
  auto device = std::make_shared<kuito::InspectorDevice>([sink](const std::string& frame) {
    auto env = inspectorEnv(sink->vm);
    if (!env) return;
    auto value = env->NewByteArray(static_cast<jsize>(frame.size()));
    if (!value) return;
    env->SetByteArrayRegion(value, 0, static_cast<jsize>(frame.size()), reinterpret_cast<const jbyte*>(frame.data()));
    env->CallVoidMethod(sink->receiver, sink->frame, value);
    env->DeleteLocalRef(value);
    if (env->ExceptionCheck()) env->ExceptionClear();
  });
  return reinterpret_cast<jlong>(new Handle{std::move(device)});
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_devtools_KuitoInspector_nativeReceive(JNIEnv* env, jobject, jlong handle, jbyteArray frame) {
  if (auto device = inspectorDevice(handle)) device->receive(bytes(env, frame));
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_devtools_KuitoInspector_nativeOpened(JNIEnv*, jobject, jlong handle) {
  if (auto device = inspectorDevice(handle)) device->opened();
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_devtools_KuitoInspector_nativeClosed(JNIEnv*, jobject, jlong handle) {
  if (auto device = inspectorDevice(handle)) device->closed();
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_devtools_KuitoInspector_nativeDestroy(JNIEnv*, jobject, jlong handle) {
  delete reinterpret_cast<Handle*>(handle);
}
