// JNI binding of the shared ThumbHash decoder (native/shared/ThumbHash.h) for
// KuitoThumbHash.kt.
#include "ThumbHash.h"
#include <jni.h>
#include <string>

namespace {

std::string utf8(JNIEnv* env, jstring text) {
  const char* chars = env->GetStringUTFChars(text, nullptr);
  std::string result = chars ? chars : "";
  if (chars) env->ReleaseStringUTFChars(text, chars);
  return result;
}

} // namespace

extern "C" JNIEXPORT jboolean JNICALL Java_dev_kuito_runtime_renderer_images_KuitoThumbHash_valid(JNIEnv* env, jclass,
                                                                                                      jstring text) {
  return kuito::ThumbHash::parse(utf8(env, text)).has_value();
}

// The preview as [width, height, then each pixel as ARGB], the colors
// Bitmap.createBitmap takes: not premultiplied, as the decoder's are.
extern "C" JNIEXPORT jintArray JNICALL
Java_dev_kuito_runtime_renderer_images_KuitoThumbHash_decode(JNIEnv* env, jclass, jstring text) {
  auto hash = kuito::ThumbHash::parse(utf8(env, text));
  if (!hash) return nullptr;

  auto preview = hash->decode();
  std::vector<jint> packed{preview.width, preview.height};
  for (size_t i = 0; i < preview.rgba.size(); i += 4) {
    auto* p = &preview.rgba[i];
    packed.push_back(jint((uint32_t(p[3]) << 24) | (uint32_t(p[0]) << 16) | (uint32_t(p[1]) << 8) | p[2]));
  }

  jintArray result = env->NewIntArray(jsize(packed.size()));
  if (result) env->SetIntArrayRegion(result, 0, jsize(packed.size()), packed.data());
  return result;
}
