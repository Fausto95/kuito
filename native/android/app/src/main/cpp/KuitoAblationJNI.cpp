// The what-if switchboard (native/shared/Ablation.h) for Kotlin:
// dev.kuito.runtime.renderer.KuitoAblation.
#include "Ablation.h"
#include <jni.h>

#define KUITO_ABLATION(name) Java_dev_kuito_runtime_renderer_KuitoAblation_##name

extern "C" {

JNIEXPORT jboolean JNICALL KUITO_ABLATION(elides)(JNIEnv*, jobject, jint subsystem) {
  return kuito::ablation()[static_cast<kuito::Subsystem>(subsystem)].elide ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL KUITO_ABLATION(slow)(JNIEnv*, jobject, jint subsystem) {
  kuito::ablated(static_cast<kuito::Subsystem>(subsystem), [] {}, [] {});
}

JNIEXPORT jstring JNICALL KUITO_ABLATION(setting)(JNIEnv* env, jobject) {
  return env->NewStringUTF(kuito::ablation().describe().c_str());
}

JNIEXPORT jstring JNICALL KUITO_ABLATION(error)(JNIEnv* env, jobject) {
  return env->NewStringUTF(kuito::ablationError().c_str());
}

} // extern "C"
