// JNI binding of the shared path data parser (native/shared/PathData.h) for
// KuitoPathData.kt.
#include "PathData.h"
#include <jni.h>
#include <string>
#include <vector>

// The path as [verb, then its points] for each verb in order, the verb as
// its index in kuito::path::Verb. Malformed data throws
// IllegalArgumentException with the parser's KUITO_PATH message.
extern "C" JNIEXPORT jfloatArray JNICALL Java_dev_kuito_runtime_renderer_drawing_KuitoPathData_parse(JNIEnv* env,
                                                                                                       jclass,
                                                                                                       jstring text) {
  const char* chars = env->GetStringUTFChars(text, nullptr);
  // Out of memory: the OutOfMemoryError it left pending reaches Kotlin.
  if (!chars) return nullptr;
  const std::string data = chars;
  env->ReleaseStringUTFChars(text, chars);

  kuito::path::Path path;
  try {
    path = kuito::path::parse(data);
  } catch (const std::invalid_argument& error) {
    jclass illegal = env->FindClass("java/lang/IllegalArgumentException");
    if (illegal) env->ThrowNew(illegal, error.what());
    return nullptr;
  }

  std::vector<jfloat> packed;
  packed.reserve(path.verbs.size() + path.points.size());
  std::size_t point = 0;
  for (kuito::path::Verb verb : path.verbs) {
    packed.push_back(static_cast<jfloat>(verb));
    for (std::size_t i = 0; i < kuito::path::pointCount(verb); ++i) packed.push_back(path.points[point++]);
  }

  jfloatArray result = env->NewFloatArray(static_cast<jsize>(packed.size()));
  if (result) env->SetFloatArrayRegion(result, 0, static_cast<jsize>(packed.size()), packed.data());
  return result;
}
