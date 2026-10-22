// Cost replay (docs/devtools.md#cost-replay), in debug builds only: a
// recording's batches as the renderer tests apply them, with no runtime.
#include "../../../../../shared/Recording.h"
#include "JavaValues.h"
#include <jni.h>

/// Calls `into.onNativeBatch` with each batch of `file`, a `.krec`, decoded and
/// checked in order, its sent time the milliseconds since the recording's
/// runtime started. On the main thread, as every batch sent to Kotlin.
extern "C" JNIEXPORT void JNICALL
Java_dev_kuito_runtime_devtools_KuitoReplayBatch_decode(JNIEnv* env, jclass, jbyteArray file, jobject into) {
  kuito::jniEntry(env, [&] {
    kuito::JavaLocal<jclass> type(env, env->GetObjectClass(into));
    jmethodID batch = kuito::javaMethod(env, type.get(), "onNativeBatch", kuito::kBatchSignature);
    for (const auto& replay : kuito::replayBatches(kuito::javaBytes(env, file)))
      kuito::sendBatch(env, into, batch, replay.mutations, 1, replay.ms, "Replaying a recording");
  });
}
