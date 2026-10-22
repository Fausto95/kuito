#pragma once

#include <jni.h>
#include <memory>

namespace kuito { class InspectorDevice; }

/// The InspectorDevice behind a KuitoInspector's handle; null for 0.
std::shared_ptr<kuito::InspectorDevice> inspectorDevice(jlong handle);

/// The calling thread's JNIEnv, attaching it if the VM does not know it yet:
/// the inspector calls back from whichever thread delivered a command.
JNIEnv* inspectorEnv(JavaVM* vm);
