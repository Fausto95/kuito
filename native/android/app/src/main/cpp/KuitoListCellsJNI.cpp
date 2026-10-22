// JNI binding of the shared cell table (native/shared/ListCells.h) for
// views/KuitoListCells.kt, which owns one per list through `handle`.
#include "JavaValues.h"
#include "ListCells.h"
#include <jni.h>
#include <string>
#include <vector>

namespace {

kuito::ListCells& cells(jlong handle) { return *reinterpret_cast<kuito::ListCells*>(handle); }

} // namespace

extern "C" JNIEXPORT jlong JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_create(JNIEnv* env, jclass,
                                                                                                 jstring list) {
  return kuito::jniEntry(
      env, jlong(0), [&] { return reinterpret_cast<jlong>(new kuito::ListCells(kuito::javaString(env, list))); });
}

extern "C" JNIEXPORT void JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_destroy(JNIEnv*, jclass,
                                                                                                 jlong handle) {
  delete reinterpret_cast<kuito::ListCells*>(handle);
}

extern "C" JNIEXPORT void JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_setWindow(JNIEnv* env, jclass,
                                                                                                   jlong handle,
                                                                                                   jobjectArray keys) {
  kuito::jniEntry(env, [&] { cells(handle).setWindow(kuito::javaStrings(env, keys)); });
}

extern "C" JNIEXPORT jint JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_find(JNIEnv* env, jclass,
                                                                                              jlong handle,
                                                                                              jstring key) {
  return kuito::jniEntry(env, jint(-1), [&] { return cells(handle).find(kuito::javaString(env, key)); });
}

extern "C" JNIEXPORT jint JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_place(JNIEnv* env, jclass,
                                                                                               jlong handle,
                                                                                               jstring key,
                                                                                               jintArray held) {
  return kuito::jniEntry(env, jint(-1), [&] {
    std::vector<std::int32_t> shown(static_cast<size_t>(env->GetArrayLength(held)));
    env->GetIntArrayRegion(held, 0, static_cast<jsize>(shown.size()), reinterpret_cast<jint*>(shown.data()));
    kuito::rethrowJavaException(env, "Reading the cells on screen");
    return cells(handle).place(kuito::javaString(env, key), shown);
  });
}

extern "C" JNIEXPORT jint JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_adopt(JNIEnv* env, jclass,
                                                                                               jlong handle,
                                                                                               jstring id) {
  return kuito::jniEntry(env, jint(-1), [&] { return cells(handle).adopt(kuito::javaString(env, id)); });
}

extern "C" JNIEXPORT jboolean JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_join(JNIEnv* env, jclass,
                                                                                                  jlong handle,
                                                                                                  jint slot,
                                                                                                  jstring key) {
  return kuito::jniEntry(env, jboolean(false),
                          [&] { return jboolean(cells(handle).join(slot, kuito::javaString(env, key))); });
}

extern "C" JNIEXPORT void JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_remove(JNIEnv* env, jclass,
                                                                                                jlong handle,
                                                                                                jint slot) {
  kuito::jniEntry(env, [&] { cells(handle).remove(slot); });
}

extern "C" JNIEXPORT jstring JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListCells_id(JNIEnv* env, jclass,
                                                                                               jlong handle,
                                                                                               jint slot) {
  return kuito::jniEntry(env, jstring(nullptr), [&] {
    jstring id = env->NewStringUTF(cells(handle).id(slot).c_str());
    kuito::requireJava(env, id, "Creating a cell id");
    return id;
  });
}
