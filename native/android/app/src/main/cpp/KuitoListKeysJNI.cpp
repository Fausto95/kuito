// JNI binding of the shared key editor (native/shared/ListKeys.h) for
// views/KuitoListKeys.kt.
#include "JavaValues.h"
#include "ListKeys.h"
#include <jni.h>
#include <string>
#include <vector>

namespace {

/// The reason as the Kotlin caller's KuitoRenderError.Rejection, which the
/// renderer reports as an unsupported `keys` value.
void reject(JNIEnv* env, const char* reason) {
  kuito::JavaLocal<jclass> type(env, env->FindClass("dev/kuito/runtime/renderer/KuitoRenderError$Rejection"));
  kuito::requireJava(env, type.get(), "Finding KuitoRenderError.Rejection");
  env->ThrowNew(type.get(), reason);
}

} // namespace

// `edits` holds each edit's op (KeyEdit::Op) and index, `editKeys` its key.
// Returns the keys' count, the order of their sources, then each edit's op,
// from and to.
extern "C" JNIEXPORT jintArray JNICALL Java_dev_kuito_runtime_renderer_views_KuitoListKeys_edit(
    JNIEnv* env, jclass, jobjectArray keys, jintArray edits, jobjectArray editKeys) {
  return kuito::jniEntry(env, jintArray(nullptr), [&]() -> jintArray {
    std::vector<kuito::KeyEdit> parsed;
    auto texts = kuito::javaStrings(env, editKeys);
    std::vector<jint> numbers(static_cast<size_t>(env->GetArrayLength(edits)));
    env->GetIntArrayRegion(edits, 0, static_cast<jsize>(numbers.size()), numbers.data());
    kuito::rethrowJavaException(env, "Reading key edits");
    if (numbers.size() != texts.size() * 2)
      throw std::invalid_argument("Each key edit needs an op, an index and a key");
    parsed.reserve(texts.size());
    for (size_t n = 0; n < texts.size(); ++n) {
      if (numbers[n * 2] < 0 || numbers[n * 2] > static_cast<jint>(kuito::KeyEdit::Op::Move))
        throw std::invalid_argument("No key edit op " + std::to_string(numbers[n * 2]));
      parsed.push_back({static_cast<kuito::KeyEdit::Op>(numbers[n * 2]), numbers[n * 2 + 1], std::move(texts[n])});
    }

    kuito::EditedKeys result;
    try {
      result = kuito::editKeys(kuito::javaStrings(env, keys), parsed);
    } catch (const kuito::KeyEditError& error) {
      reject(env, error.what());
      return nullptr;
    }

    std::vector<jint> packed;
    packed.reserve(1 + result.order.size() + result.changes.size() * 3);
    packed.push_back(static_cast<jint>(result.order.size()));
    packed.insert(packed.end(), result.order.begin(), result.order.end());
    for (const auto& change : result.changes) {
      packed.insert(packed.end(), {static_cast<jint>(change.op), change.from, change.to});
    }
    jintArray array = env->NewIntArray(static_cast<jsize>(packed.size()));
    kuito::requireJava(env, array, "Allocating the edited keys");
    env->SetIntArrayRegion(array, 0, static_cast<jsize>(packed.size()), packed.data());
    return array;
  });
}
