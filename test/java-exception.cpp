// A fake JNIEnv: the function table JNI calls go through, recording each call.
#include "JavaException.h"
#include "JavaValues.h"

#include <cstdarg>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

namespace {
using Table = std::remove_const_t<std::remove_pointer_t<decltype(std::declval<JNIEnv>().functions)>>;

struct Fake {
  bool pending = false;
  bool toStringThrows = false;
  /// The call that fails, once: it returns null and leaves a Java exception pending.
  std::string failing;
  std::string description;
  std::vector<std::string> calls;
  std::vector<std::string> thrown;
  int localRefs = 0;
};
Fake fake;

jobject ref() { ++fake.localRefs; return reinterpret_cast<jobject>(&fake); }

/// A call the VM forbids while an exception is pending; true when it fails.
bool call(const std::string& name) {
  fake.calls.push_back(fake.pending ? name + " while pending" : name);
  if (name != fake.failing) return false;
  fake.failing.clear();
  fake.pending = true;
  return true;
}

Table table() {
  Table t{};
  t.ExceptionCheck = [](JNIEnv*) -> jboolean {
    fake.calls.push_back("ExceptionCheck");
    return fake.pending ? JNI_TRUE : JNI_FALSE;
  };
  t.ExceptionOccurred = [](JNIEnv*) -> jthrowable {
    fake.calls.push_back("ExceptionOccurred");
    return fake.pending ? static_cast<jthrowable>(ref()) : nullptr;
  };
  t.ExceptionClear = [](JNIEnv*) {
    fake.calls.push_back("ExceptionClear");
    fake.pending = false;
  };
  t.GetObjectClass = [](JNIEnv*, jobject) -> jclass {
    call("GetObjectClass");
    return static_cast<jclass>(ref());
  };
  t.FindClass = [](JNIEnv*, const char* name) -> jclass {
    return call(std::string("FindClass ") + name) ? nullptr : static_cast<jclass>(ref());
  };
  t.ThrowNew = [](JNIEnv*, jclass, const char* message) -> jint {
    call("ThrowNew");
    fake.thrown.push_back(message);
    fake.pending = true;
    return 0;
  };
  t.GetMethodID = [](JNIEnv*, jclass, const char* name, const char*) -> jmethodID {
    return call(std::string("GetMethodID ") + name) ? nullptr : reinterpret_cast<jmethodID>(&fake);
  };
  t.CallObjectMethodV = [](JNIEnv*, jobject, jmethodID, va_list) -> jobject {
    call("toString");
    if (fake.toStringThrows) { fake.pending = true; return nullptr; }
    return ref();
  };
  t.CallVoidMethodV = [](JNIEnv*, jobject, jmethodID, va_list) { call("CallVoidMethod"); };
  t.GetStringUTFChars = [](JNIEnv*, jstring, jboolean*) -> const char* {
    return call("GetStringUTFChars") ? nullptr : fake.description.c_str();
  };
  t.ReleaseStringUTFChars = [](JNIEnv*, jstring, const char*) {};
  t.NewStringUTF = [](JNIEnv*, const char*) -> jstring {
    return call("NewStringUTF") ? nullptr : static_cast<jstring>(ref());
  };
  t.NewObjectArray = [](JNIEnv*, jsize, jclass, jobject) -> jobjectArray {
    return call("NewObjectArray") ? nullptr : static_cast<jobjectArray>(ref());
  };
  t.SetObjectArrayElement = [](JNIEnv*, jobjectArray, jsize, jobject) { call("SetObjectArrayElement"); };
  t.GetArrayLength = [](JNIEnv*, jarray) -> jsize {
    call("GetArrayLength");
    return 4;
  };
  t.GetByteArrayRegion = [](JNIEnv*, jbyteArray, jsize, jsize, jbyte*) { call("GetByteArrayRegion"); };
  t.NewIntArray = [](JNIEnv*, jsize) -> jintArray {
    return call("NewIntArray") ? nullptr : static_cast<jintArray>(ref());
  };
  t.SetIntArrayRegion = [](JNIEnv*, jintArray, jsize, jsize, const jint*) { call("SetIntArrayRegion"); };
  t.NewDoubleArray = [](JNIEnv*, jsize) -> jdoubleArray {
    return call("NewDoubleArray") ? nullptr : static_cast<jdoubleArray>(ref());
  };
  t.SetDoubleArrayRegion = [](JNIEnv*, jdoubleArray, jsize, jsize, const jdouble*) { call("SetDoubleArrayRegion"); };
  t.DeleteLocalRef = [](JNIEnv*, jobject) { --fake.localRefs; };
  // A global reference outlives the call: it is not a local one to release.
  t.NewGlobalRef = [](JNIEnv*, jobject) -> jobject {
    return call("NewGlobalRef") ? nullptr : reinterpret_cast<jobject>(&fake);
  };
  return t;
}

int failures = 0;
void expect(bool condition, const std::string& message) {
  if (!condition) { ++failures; std::cerr << "FAIL: " << message << "\n"; }
}

/// What the VM sees after `work`: an error it threw in C++, and the JNI rules kept.
template <class Work>
std::string failure(const std::string& name, Work&& work) {
  std::string error;
  try { work(); }
  catch (const std::runtime_error& e) { error = e.what(); }
  for (const auto& made : fake.calls)
    expect(made.find(" while pending") == std::string::npos, name + ": no JNI call while pending (" + made + ")");
  expect(!fake.pending, name + ": the Java exception is cleared");
  expect(fake.localRefs == 0, name + ": local references are released");
  return error;
}

std::string rethrown(JNIEnv* env) {
  try { kuito::rethrowJavaException(env, "Network request"); }
  catch (const std::runtime_error& error) { return error.what(); }
  return "";
}

std::vector<kuito::Mutation> batch() {
  kuito::Mutation change;
  change.op = kuito::Op::Prop;
  change.id = 1;
  change.key = kuito::PropKey::Text;
  change.kind = kuito::Value::Text;
  change.text = "Ada";
  return {change, change};
}

jobject receiver() { return reinterpret_cast<jobject>(&fake); }
jmethodID callback() { return reinterpret_cast<jmethodID>(&fake); }
} // namespace

int main() {
  const Table functions = table();
  JNIEnv env{};
  env.functions = &functions;

  fake = Fake{};
  expect(rethrown(&env).empty(), "no pending exception: nothing is thrown");
  expect(fake.calls == std::vector<std::string>{"ExceptionCheck"}, "no pending exception: only checks");

  fake = Fake{};
  fake.pending = true;
  fake.description = "java.lang.IllegalArgumentException: Expected URL scheme 'http' or 'https'";
  expect(rethrown(&env) ==
             "Network request threw in Kotlin: java.lang.IllegalArgumentException: Expected URL scheme 'http' or 'https'",
         "a pending exception is rethrown with its description");
  expect(!fake.pending, "the Java exception is cleared");
  for (const auto& call : fake.calls) expect(call != "GetObjectClass while pending", "no JNI call while pending");
  expect(fake.localRefs == 0, "local references are released");

  fake = Fake{};
  fake.pending = true;
  fake.toStringThrows = true;
  expect(rethrown(&env) == "Network request threw in Kotlin", "an undescribable exception still fails the call");
  expect(!fake.pending, "an exception from toString is cleared too");
  expect(fake.localRefs == 0, "local references are released when toString throws");

  // Java values: a JNI call that fails leaves an exception pending; it becomes a C++ error.
  fake = Fake{};
  fake.description = "Ada";
  expect(kuito::javaString(&env, static_cast<jstring>(receiver())) == "Ada", "a Java string's text");
  expect(kuito::javaString(&env, nullptr).empty(), "a null Java string is empty");

  fake = Fake{};
  fake.failing = "GetStringUTFChars";
  expect(failure("javaString", [&] { kuito::javaString(&env, static_cast<jstring>(receiver())); }) != "",
         "a string the VM cannot copy fails the call");

  fake = Fake{};
  fake.failing = "GetByteArrayRegion";
  expect(failure("javaBytes", [&] { kuito::javaBytes(&env, static_cast<jbyteArray>(receiver())); }) != "",
         "bytes the VM cannot copy fail the call");

  fake = Fake{};
  fake.failing = "GetMethodID onNativeBatch";
  expect(failure("javaMethod", [&] {
           kuito::javaMethod(&env, static_cast<jclass>(receiver()), "onNativeBatch", "([I[D)V");
         }).find("onNativeBatch") != std::string::npos,
         "a missing Kotlin callback fails by name");

  // The classes a batch names are found once, for the process: finding one can fail only there.
  for (const char* step : {"FindClass java/lang/String", "FindClass [D", "NewGlobalRef"}) {
    fake = Fake{};
    fake.failing = step;
    expect(failure(step, [&] { kuito::JavaBatchCache cache(&env); }) != "",
           std::string("the batch cache fails when ") + step + " throws");
  }

  for (const char* step : {"NewIntArray", "SetIntArrayRegion", "NewDoubleArray", "SetDoubleArrayRegion",
                           "NewObjectArray", "NewStringUTF", "SetObjectArrayElement", "CallVoidMethod"}) {
    fake = Fake{};
    fake.failing = step;
    expect(failure(step, [&] { kuito::sendBatch(&env, receiver(), callback(), batch(), 1, 0, "Batch dispatch"); }) != "",
           std::string("a batch fails when ") + step + " throws");
  }

  fake = Fake{};
  failure("sendBatch", [&] { kuito::sendBatch(&env, receiver(), callback(), batch(), 1, 0, "Batch dispatch"); });
  expect(fake.calls.back() == "ExceptionCheck", "a delivered batch is checked for a Kotlin exception");

  // A create's kind is made once for the process; each label is its own.
  std::vector<kuito::Mutation> creates(2);
  for (std::size_t i = 0; i < creates.size(); ++i) {
    creates[i].op = kuito::Op::Create;
    creates[i].id = static_cast<std::uint32_t>(i + 1);
    creates[i].text = "module:Interned";
    creates[i].name = "view" + std::to_string(i);
  }
  const auto made = [] {
    std::size_t strings = 0;
    for (const auto& name : fake.calls) strings += name == "NewStringUTF";
    return strings;
  };
  fake = Fake{};
  kuito::sendBatch(&env, receiver(), callback(), creates, 1, 0, "Batch dispatch");
  expect(made() == 3, "a first batch makes its kind once and each label: " + std::to_string(made()));
  fake = Fake{};
  kuito::sendBatch(&env, receiver(), callback(), creates, 1, 0, "Batch dispatch");
  expect(made() == 2, "a later batch makes only its labels: " + std::to_string(made()));

  // Entry points: no C++ error crosses into the VM.
  fake = Fake{};
  expect(kuito::jniEntry(&env, 0, [] { return 7; }) == 7, "an entry point returns its result");
  expect(fake.thrown.empty(), "a successful entry point throws nothing");

  fake = Fake{};
  expect(kuito::jniEntry(&env, -1, []() -> int { throw std::runtime_error("Hermes failed"); }) == -1,
         "a failing entry point returns its fallback");
  expect(fake.thrown == std::vector<std::string>{"Hermes failed"}, "the C++ error reaches Kotlin");
  expect(fake.localRefs == 0, "throwing to Kotlin releases its class");

  fake = Fake{};
  kuito::jniEntry(&env, [] { throw 42; });
  expect(fake.thrown.size() == 1, "an error of any type reaches Kotlin");

  fake = Fake{};
  kuito::jniEntry(&env, [] {
    fake.pending = true;
    throw std::runtime_error("after a Kotlin exception");
  });
  expect(fake.thrown.empty() && fake.pending, "a pending Java exception is what Kotlin gets");
  for (const auto& made : fake.calls)
    expect(made.find(" while pending") == std::string::npos, "no JNI call while pending (" + made + ")");

  if (failures) return 1;
  std::cout << "KUITO_JAVA_EXCEPTION_PASS\n";
  return 0;
}
