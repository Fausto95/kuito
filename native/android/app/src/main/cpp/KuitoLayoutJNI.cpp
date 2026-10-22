// JNI binding of the shared flexbox engine for KuitoLayoutNode.kt.
#include "LayoutReceipts.h"
#include "layout/KuitoLayoutStyle.h"
#include <jni.h>
#include <cmath>
#include <cstdint>
#include <optional>
#include <cstring>
#include <exception>
#include <stdexcept>
#include <string>
#include <vector>

namespace layout = kuito::layout;

namespace {

JavaVM* javaVM = nullptr;

// KuitoLayoutNode's members the engine reaches, looked up once: the class
// stays loaded while any node lives, so the ids stay valid.
struct NodeClass {
  jmethodID measureLeaf = nullptr;
  jfieldID frames = nullptr;
  jfieldID slot = nullptr;
};
NodeClass nodeClass;

// Each node's box in a pass's frames: x, y, width, height, content width,
// content height, then the content inset top, right, bottom, left.
constexpr int kFrameSize = 10;

// The boxes a node last published for its subtree (a pass from it as the
// root, or a relayout from it), held by a global reference until
// nativeDestroy. `id` is never reused, unlike a global reference's value.
struct Frames {
  jdoubleArray array = nullptr;
  jsize size = 0;
  std::uint64_t id = 0;
  std::uint64_t structure = 0;
};

// Bumped whenever a node joins or leaves a tree, in any tree (an insert, a
// remove, a node destroyed in place): frames filled at the same structure
// hold the same nodes at the same slots.
std::uint64_t structure = 0;
std::uint64_t lastFramesId = 0;
// Kotlin fields publish has set, for tests: none for a pass over a tree
// whose structure is unchanged.
std::int64_t fieldWrites = 0;

// A node and the Kotlin object that owns it, held by a global reference
// until nativeDestroy, with the frames its owner reads (by id) and where.
struct Handle {
  layout::Node node;
  const layout::KindLayout* kind;
  jobject owner;
  Frames published;
  std::uint64_t readsFrom = 0;
  jint slot = 0;
};

Handle* handleOf(jlong handle) { return reinterpret_cast<Handle*>(handle); }

// Java's own UTF-16, encoded here: GetStringUTFChars would make the VM
// build a modified-UTF-8 copy of every prop name and value first.
std::string stringOf(JNIEnv* env, jstring value) {
  const jsize length = env->GetStringLength(value);
  const jchar* chars = env->GetStringChars(value, nullptr);
  if (!chars) throw std::runtime_error("JNI string access failed");
  std::string result;
  result.reserve(static_cast<std::size_t>(length));
  for (jsize i = 0; i < length; ++i) {
    std::uint32_t code = chars[i];
    if (code >= 0xd800 && code < 0xdc00 && i + 1 < length && chars[i + 1] >= 0xdc00 && chars[i + 1] < 0xe000)
      code = 0x10000 + ((code - 0xd800) << 10) + (chars[++i] - 0xdc00);
    if (code < 0x80) {
      result += static_cast<char>(code);
    } else if (code < 0x800) {
      result += static_cast<char>(0xc0 | code >> 6);
      result += static_cast<char>(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      result += static_cast<char>(0xe0 | code >> 12);
      result += static_cast<char>(0x80 | (code >> 6 & 0x3f));
      result += static_cast<char>(0x80 | (code & 0x3f));
    } else {
      result += static_cast<char>(0xf0 | code >> 18);
      result += static_cast<char>(0x80 | (code >> 12 & 0x3f));
      result += static_cast<char>(0x80 | (code >> 6 & 0x3f));
      result += static_cast<char>(0x80 | (code & 0x3f));
    }
  }
  env->ReleaseStringChars(value, chars);
  return result;
}

void bindNodeClass(JNIEnv* env, jobject node) {
  if (nodeClass.measureLeaf) return;
  jclass type = env->GetObjectClass(node);
  nodeClass.measureLeaf = env->GetMethodID(type, "measureLeaf", "(FIFI)J");
  nodeClass.frames = env->GetFieldID(type, "frames", "[D");
  nodeClass.slot = env->GetFieldID(type, "slot", "I");
  env->DeleteLocalRef(type);
  if (!nodeClass.measureLeaf || !nodeClass.frames || !nodeClass.slot)
    throw std::runtime_error("KUITO_LAYOUT_BIND: KuitoLayoutNode lacks measureLeaf, frames or slot");
}

void writeBox(const layout::Node& node, jdouble* out) {
  const layout::Layout& box = node.layout();
  const layout::Edges& padding = node.contentInset();
  const jdouble values[kFrameSize] = {box.x, box.y, box.width, box.height, box.content.width, box.content.height,
                                      padding.top, padding.right, padding.bottom, padding.left};
  std::memcpy(out, values, sizeof(values));
}

// Every box of `root`'s subtree in one array, read by each node from its slot
// until the next pass: one crossing, not one per node per measure and layout.
// While no tree's structure changes the array is filled again in place, and
// each node already reads from its slot there: a pass sets no field. After a
// change it is a new array, so a removed node (a view leaving with an exit
// animation) keeps reading the boxes it last had. Returns the nodes, breadth
// first from `root`.
std::vector<const layout::Node*> publish(JNIEnv* env, const layout::Node& root) {
  std::vector<const layout::Node*> nodes{&root};
  for (std::size_t i = 0; i < nodes.size(); ++i)
    for (const layout::Node* child : nodes[i]->children()) nodes.push_back(child);
  std::vector<jdouble> values(nodes.size() * kFrameSize);
  for (std::size_t i = 0; i < nodes.size(); ++i) writeBox(*nodes[i], values.data() + i * kFrameSize);
  const auto size = static_cast<jsize>(values.size());
  Frames& frames = static_cast<Handle*>(root.context)->published;
  if (!frames.array || frames.size != size || frames.structure != structure) {
    jdoubleArray local = env->NewDoubleArray(size);
    if (!local) throw std::runtime_error("KUITO_LAYOUT_FRAMES: allocating a pass's frames failed");
    auto held = static_cast<jdoubleArray>(env->NewGlobalRef(local));
    env->DeleteLocalRef(local);
    if (!held) throw std::runtime_error("KUITO_LAYOUT_FRAMES: keeping a pass's frames failed");
    if (frames.array) env->DeleteGlobalRef(frames.array);
    frames = {held, size, ++lastFramesId, structure};
  }
  env->SetDoubleArrayRegion(frames.array, 0, size, values.data());
  for (std::size_t i = 0; i < nodes.size(); ++i) {
    auto* handle = static_cast<Handle*>(nodes[i]->context);
    const auto slot = static_cast<jint>(i * kFrameSize);
    if (handle->readsFrom == frames.id && handle->slot == slot) continue;
    env->SetObjectField(handle->owner, nodeClass.frames, frames.array);
    env->SetIntField(handle->owner, nodeClass.slot, slot);
    handle->readsFrom = frames.id;
    handle->slot = slot;
    fieldWrites += 2;
  }
  return nodes;
}

// A pending Java exception (from a measure call) propagates as is.
void throwJava(JNIEnv* env, const std::exception& error) {
  if (env->ExceptionCheck()) return;
  if (auto type = env->FindClass("java/lang/IllegalArgumentException")) env->ThrowNew(type, error.what());
}

template <typename Body>
auto guarded(JNIEnv* env, Body body, decltype(body()) fallback) -> decltype(body()) {
  try {
    return body();
  } catch (const std::exception& error) {
    throwJava(env, error);
    return fallback;
  }
}

layout::Size measureOwner(jobject owner, float width, layout::MeasureMode widthMode, float height,
                          layout::MeasureMode heightMode) {
  JNIEnv* env = nullptr;
  if (javaVM->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK)
    throw std::runtime_error("KUITO_LAYOUT_MEASURE: measured off the UI thread");
  const jlong packed = env->CallLongMethod(owner, nodeClass.measureLeaf, width, static_cast<jint>(widthMode), height,
                                           static_cast<jint>(heightMode));
  if (env->ExceptionCheck()) throw std::runtime_error("KUITO_LAYOUT_MEASURE: measureLeaf threw");
  const auto bits = static_cast<std::uint64_t>(packed);
  const auto first = static_cast<std::uint32_t>(bits >> 32);
  const auto second = static_cast<std::uint32_t>(bits & 0xffffffffu);
  float measuredWidth;
  float measuredHeight;
  static_assert(sizeof(float) == sizeof(std::uint32_t), "packed floats");
  std::memcpy(&measuredWidth, &first, sizeof(float));
  std::memcpy(&measuredHeight, &second, sizeof(float));
  return {measuredWidth, measuredHeight};
}

} // namespace

#define KUITO_LAYOUT(name) Java_dev_kuito_runtime_renderer_layout_KuitoLayoutNode_##name

extern "C" {

JNIEXPORT jlong JNICALL KUITO_LAYOUT(nativeCreate)(JNIEnv* env, jobject thiz, jstring kind) {
  return guarded(env, [&]() -> jlong {
    if (!javaVM) env->GetJavaVM(&javaVM);
    bindNodeClass(env, thiz);
    const layout::KindLayout& defaults = layout::kindLayout(stringOf(env, kind));
    auto* handle = new Handle{{}, &defaults, env->NewGlobalRef(thiz)};
    handle->node.style = defaults.style;
    handle->node.context = handle;
    if (defaults.measured) {
      jobject owner = handle->owner;
      handle->node.measure = [owner, last = std::optional<layout::Size>()](
                                 float width, layout::MeasureMode widthMode, float height,
                                 layout::MeasureMode heightMode) mutable {
        return kuito::measureLeaf(last, [&] { return measureOwner(owner, width, widthMode, height, heightMode); });
      };
    }
    return reinterpret_cast<jlong>(handle);
  }, 0);
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeDestroy)(JNIEnv* env, jobject, jlong handle) {
  Handle* node = handleOf(handle);
  // ~Node unlinks the node from its parent and orphans its children.
  if (node->node.parent() || !node->node.children().empty()) ++structure;
  if (node->published.array) env->DeleteGlobalRef(node->published.array);
  env->DeleteGlobalRef(node->owner);
  delete node;
}

JNIEXPORT jboolean JNICALL KUITO_LAYOUT(nativeMeasured)(JNIEnv*, jobject, jlong handle) {
  return handleOf(handle)->kind->measured ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeInsert)(JNIEnv* env, jobject, jlong parent, jlong child, jint index) {
  guarded(env, [&]() -> bool {
    handleOf(parent)->node.insert(handleOf(child)->node, static_cast<std::size_t>(index < 0 ? 0 : index));
    ++structure;
    return true;
  }, false);
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeRemoveFromParent)(JNIEnv*, jobject, jlong handle) {
  layout::Node& node = handleOf(handle)->node;
  if (layout::Node* parent = node.parent()) {
    parent->remove(node);
    ++structure;
  }
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeInheritFrom)(JNIEnv*, jobject, jlong handle, jlong host) {
  handleOf(handle)->node.inheritFrom(host ? &handleOf(host)->node : nullptr);
}

JNIEXPORT jboolean JNICALL KUITO_LAYOUT(nativeRightToLeft)(JNIEnv*, jobject, jlong handle) {
  return handleOf(handle)->node.style.direction == layout::Direction::Rtl ? JNI_TRUE : JNI_FALSE;
}

// `kind` is LayoutValue::Kind's; only a length's text crosses as a string.
// Without `dirty` the node is left for nativeRelayout.
JNIEXPORT void JNICALL KUITO_LAYOUT(nativeSet)(JNIEnv* env, jobject, jlong handle, jint key, jint kind,
                                                jdouble number, jint index, jstring text, jboolean dirty) {
  guarded(env, [&]() -> bool {
    Handle* node = handleOf(handle);
    const std::string written = text ? stringOf(env, text) : std::string();
    const layout::LayoutValue value{static_cast<layout::LayoutValue::Kind>(kind), number, index, written};
    layout::setLayoutProperty(node->node.style, node->kind->style, static_cast<kuito::PropKey>(key), value);
    if (dirty) node->node.markDirty();
    return true;
  }, false);
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeSetDirection)(JNIEnv* env, jobject, jlong handle, jboolean rightToLeft) {
  static constexpr auto ltr = kuito::enumValue(kuito::PropKey::Direction, "ltr");
  static constexpr auto rtl = kuito::enumValue(kuito::PropKey::Direction, "rtl");
  static_assert(ltr && rtl, "direction takes ltr and rtl");
  guarded(env, [&]() -> bool {
    Handle* node = handleOf(handle);
    layout::setLayoutProperty(node->node.style, node->kind->style, kuito::PropKey::Direction,
                              layout::LayoutValue::choice(rightToLeft ? *rtl : *ltr));
    node->node.markDirty();
    return true;
  }, false);
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeCalculate)(JNIEnv* env, jobject, jlong handle, jfloat width,
                                                      jfloat height, jfloat scale) {
  guarded(env, [&]() -> bool {
    // A NaN side is unconstrained: the node wraps its content along it.
    const auto side = [](jfloat value) { return std::isnan(value) ? std::optional<float>() : std::optional<float>(value); };
    layout::Node& root = handleOf(handle)->node;
    kuito::calculateRoot(root, [&] {
      root.calculate(side(width), side(height), scale);
      publish(env, root);
    });
    return true;
  }, false);
}

// After a set without `dirty`: lays out the smallest subtree the change can
// move (Node::relayout) and returns its nodes, breadth first from its root;
// null when the tree's root must calculate again.
JNIEXPORT jobjectArray JNICALL KUITO_LAYOUT(nativeRelayout)(JNIEnv* env, jobject thiz, jlong handle) {
  return guarded(env, [&]() -> jobjectArray {
    const layout::Node* changed = handleOf(handle)->node.relayout();
    if (!changed) return nullptr;
    const std::vector<const layout::Node*> nodes = publish(env, *changed);
    jclass type = env->GetObjectClass(thiz);
    jobjectArray result = env->NewObjectArray(static_cast<jsize>(nodes.size()), type, nullptr);
    env->DeleteLocalRef(type);
    if (!result) throw std::runtime_error("KUITO_LAYOUT_FRAMES: allocating a relayout's nodes failed");
    for (std::size_t i = 0; i < nodes.size(); ++i)
      env->SetObjectArrayElement(result, static_cast<jsize>(i), static_cast<Handle*>(nodes[i]->context)->owner);
    return result;
  }, nullptr);
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeSetInset)(JNIEnv*, jobject, jlong handle, jfloat top, jfloat right,
                                                     jfloat bottom, jfloat left) {
  layout::Node& node = handleOf(handle)->node;
  const layout::Edges inset{top, right, bottom, left};
  if (node.style.extraPadding == inset) return;
  node.style.extraPadding = inset;
  node.markDirty();
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeMarkDirty)(JNIEnv*, jobject, jlong handle) {
  handleOf(handle)->node.markDirty();
}

JNIEXPORT void JNICALL KUITO_LAYOUT(nativeMarkContentDirty)(JNIEnv*, jobject, jlong handle) {
  handleOf(handle)->node.markContentDirty();
}

JNIEXPORT jboolean JNICALL KUITO_LAYOUT(nativeDirty)(JNIEnv*, jobject, jlong handle) {
  return handleOf(handle)->node.dirty() ? JNI_TRUE : JNI_FALSE;
}

// The node's box as the running pass has it, for a measure inside that pass.
JNIEXPORT void JNICALL KUITO_LAYOUT(nativeLayout)(JNIEnv* env, jobject, jlong handle, jdoubleArray out) {
  jdouble values[kFrameSize];
  writeBox(handleOf(handle)->node, values);
  env->SetDoubleArrayRegion(out, 0, kFrameSize, values);
}

JNIEXPORT jlong JNICALL KUITO_LAYOUT(nativeFieldWrites)(JNIEnv*, jobject) { return fieldWrites; }

// The engine's work since launch (layout::LayoutCost): nodes laid out,
// measure calls and wasted measures, for KuitoCost.
JNIEXPORT jlongArray JNICALL KUITO_LAYOUT(nativeCost)(JNIEnv* env, jclass) {
  const layout::LayoutCost& cost = layout::layoutCost();
  const jlong values[3] = {static_cast<jlong>(cost.nodesLaidOut), static_cast<jlong>(cost.measureCalls),
                           static_cast<jlong>(cost.wastedMeasures)};
  jlongArray out = env->NewLongArray(3);
  if (out) env->SetLongArrayRegion(out, 0, 3, values);
  return out;
}

JNIEXPORT jobject JNICALL KUITO_LAYOUT(nativeParent)(JNIEnv*, jobject, jlong handle) {
  layout::Node* parent = handleOf(handle)->node.parent();
  return parent ? static_cast<Handle*>(parent->context)->owner : nullptr;
}

JNIEXPORT jobjectArray JNICALL KUITO_LAYOUT(nativeChildren)(JNIEnv* env, jobject thiz, jlong handle) {
  const auto& children = handleOf(handle)->node.children();
  jclass type = env->GetObjectClass(thiz);
  jobjectArray result = env->NewObjectArray(static_cast<jsize>(children.size()), type, nullptr);
  env->DeleteLocalRef(type);
  if (!result) return nullptr;
  for (std::size_t i = 0; i < children.size(); ++i) {
    env->SetObjectArrayElement(result, static_cast<jsize>(i), static_cast<Handle*>(children[i]->context)->owner);
  }
  return result;
}

} // extern "C"
