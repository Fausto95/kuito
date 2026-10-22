// The main thread's frame receipts (native/shared/FrameLedger.h) for Kotlin:
// dev.kuito.runtime.renderer.KuitoFrameLedger. Main thread only.
#include "FrameLedger.h"
#include <jni.h>
#include <cstdio>
#include <string>
#include <unordered_map>

#define KUITO_LEDGER(name) Java_dev_kuito_runtime_renderer_KuitoFrameLedger_##name

extern "C" {

JNIEXPORT jdouble JNICALL KUITO_LEDGER(now)(JNIEnv*, jobject) { return kuito::FrameLedger::now(); }

JNIEXPORT void JNICALL KUITO_LEDGER(recordFrames)(JNIEnv*, jobject, jdouble start, jint framed, jint wasted) {
  kuito::frameLedger().record(kuito::Work::Layout, start, kuito::FrameLedger::now(),
                               {0, 0, static_cast<std::uint32_t>(framed), static_cast<std::uint32_t>(wasted)});
}

JNIEXPORT void JNICALL KUITO_LEDGER(addRedraw)(JNIEnv*, jobject, jdouble seconds) {
  kuito::frameLedger().add(kuito::Work::Redraw, seconds);
}

JNIEXPORT void JNICALL KUITO_LEDGER(woke)(JNIEnv*, jobject) {
  kuito::frameLedger().woke(kuito::FrameLedger::now());
}

JNIEXPORT void JNICALL KUITO_LEDGER(slept)(JNIEnv*, jobject) {
  kuito::frameLedger().slept(kuito::FrameLedger::now());
}

// The verdict as {work in seconds, frames dropped}.
JNIEXPORT jdoubleArray JNICALL KUITO_LEDGER(frame)(JNIEnv* env, jobject, jdouble vsync, jdouble interval) {
  const kuito::FrameVerdict verdict = kuito::frameLedger().frame(kuito::FrameLedger::now(), vsync, interval);
  const jdouble values[2] = {verdict.work, static_cast<jdouble>(verdict.dropped)};
  jdoubleArray out = env->NewDoubleArray(2);
  if (out) env->SetDoubleArrayRegion(out, 0, 2, values);
  return out;
}

JNIEXPORT jlong JNICALL KUITO_LEDGER(dropSequence)(JNIEnv*, jobject) {
  return static_cast<jlong>(kuito::frameLedger().lastDrop().sequence);
}

JNIEXPORT jboolean JNICALL KUITO_LEDGER(lastDropReceipted)(JNIEnv*, jobject) {
  return kuito::receipted(kuito::frameLedger().lastDrop()) ? JNI_TRUE : JNI_FALSE;
}

// The views the last drop's causes name, for describeLastDrop's names.
JNIEXPORT jintArray JNICALL KUITO_LEDGER(lastDropViews)(JNIEnv* env, jobject) {
  const kuito::FrameLedger& ledger = kuito::frameLedger();
  std::vector<jint> views;
  const kuito::FrameLedger::Drop& drop = ledger.lastDrop();
  for (std::size_t f = 0; f < drop.count; ++f)
    for (std::size_t r = 0; r < drop.frames[f].count; ++r)
      if (const kuito::JobCause* cause = ledger.causeOf(drop.frames[f].receipts[r].cause))
        if (cause->handle) views.push_back(static_cast<jint>(cause->handle));
  jintArray out = env->NewIntArray(static_cast<jsize>(views.size()));
  if (out) env->SetIntArrayRegion(out, 0, static_cast<jsize>(views.size()), views.data());
  return out;
}

// The last drop as one line; `views` and `names` pair each view with its name.
JNIEXPORT jstring JNICALL KUITO_LEDGER(describeLastDrop)(JNIEnv* env, jobject, jintArray views, jobjectArray names) {
  std::unordered_map<std::uint32_t, std::string> named;
  const jsize count = env->GetArrayLength(views);
  std::vector<jint> ids(static_cast<std::size_t>(count));
  env->GetIntArrayRegion(views, 0, count, ids.data());
  for (jsize i = 0; i < count; ++i) {
    auto name = static_cast<jstring>(env->GetObjectArrayElement(names, i));
    const char* chars = env->GetStringUTFChars(name, nullptr);
    named[static_cast<std::uint32_t>(ids[static_cast<std::size_t>(i)])] = chars;
    env->ReleaseStringUTFChars(name, chars);
    env->DeleteLocalRef(name);
  }
  const kuito::FrameLedger& ledger = kuito::frameLedger();
  const std::string line = kuito::describeDrop(ledger, ledger.lastDrop(), [&](std::uint32_t handle) {
    const auto found = named.find(handle);
    return found == named.end() ? "view " + std::to_string(handle) : found->second;
  });
  return env->NewStringUTF(line.c_str());
}

JNIEXPORT void JNICALL KUITO_LEDGER(reset)(JNIEnv*, jobject) { kuito::frameLedger().reset(); }

JNIEXPORT void JNICALL KUITO_LEDGER(applyJob)(JNIEnv* env, jobject, jlong job, jstring event, jint view) {
  const char* chars = env->GetStringUTFChars(event, nullptr);
  kuito::JobCause cause{static_cast<std::uint64_t>(job), kuito::JobCause::Entry::Event,
                         static_cast<std::uint32_t>(view), chars};
  env->ReleaseStringUTFChars(event, chars);
  kuito::frameLedger().applying(cause);
  const double now = kuito::FrameLedger::now();
  kuito::frameLedger().record(kuito::Work::ApplyBatch, now, now, {1, 0, 0, 0}, static_cast<std::uint64_t>(job));
}

// The last drop's receipts, oldest first: "kind ms cause count count count count".
JNIEXPORT jobjectArray JNICALL KUITO_LEDGER(lastDropReceipts)(JNIEnv* env, jobject) {
  std::vector<std::string> lines;
  const kuito::FrameLedger::Drop& drop = kuito::frameLedger().lastDrop();
  for (std::size_t f = 0; f < drop.count; ++f)
    for (std::size_t r = 0; r < drop.frames[f].count; ++r) {
      const kuito::Receipt& receipt = drop.frames[f].receipts[r];
      char line[160];
      std::snprintf(line, sizeof line, "%s %.3f %llu %u %u %u %u", kuito::workName(receipt.kind),
                    (receipt.t1 - receipt.t0) * 1000, static_cast<unsigned long long>(receipt.cause),
                    receipt.counts[0], receipt.counts[1], receipt.counts[2], receipt.counts[3]);
      lines.emplace_back(line);
    }
  jobjectArray out = env->NewObjectArray(static_cast<jsize>(lines.size()), env->FindClass("java/lang/String"), nullptr);
  for (std::size_t i = 0; i < lines.size(); ++i) {
    jstring text = env->NewStringUTF(lines[i].c_str());
    env->SetObjectArrayElement(out, static_cast<jsize>(i), text);
    env->DeleteLocalRef(text);
  }
  return out;
}

} // extern "C"
