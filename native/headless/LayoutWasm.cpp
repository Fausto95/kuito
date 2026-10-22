// WebAssembly binding of the shared flexbox engine for the headless host
// (src/tests/layout.ts), shaped like the Android one (KuitoLayoutJNI.cpp):
// a node per view, props by key, and every box of a pass in one array.
// Built into layout.wasm by scripts/build-layout-wasm.ts.
#include "layout/KuitoLayoutStyle.h"
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <optional>
#include <string>
#include <vector>

namespace layout = kuito::layout;

// The host measures a leaf: it writes the content size to `out` (width, then height).
extern "C" __attribute__((import_module("kuito"), import_name("measure"))) void
kuitoMeasure(std::uint32_t node, float width, int widthMode, float height, int heightMode, float* out);

namespace {

// Each node's box in a pass's frames: x, y, width, height, content width,
// content height, then the content inset top, right, bottom, left.
constexpr int kFrameSize = 10;

struct Handle {
  layout::Node node;
  const layout::KindLayout* kind;
};

Handle* handleOf(std::uint32_t handle) { return reinterpret_cast<Handle*>(static_cast<std::uintptr_t>(handle)); }

// The last failure's message, read by the host after a call returns false.
std::string lastError;
// The last pass's frames, breadth first from the root.
std::vector<double> frames;

template <typename Body>
bool guarded(Body body) {
  try {
    body();
    return true;
  } catch (const std::exception& error) {
    lastError = error.what();
    return false;
  }
}

void writeBox(const layout::Node& node, double* out) {
  const layout::Layout& box = node.layout();
  const layout::Edges& padding = node.contentInset();
  const double values[kFrameSize] = {
      box.x,       box.y,         box.width,      box.height,  box.content.width, box.content.height,
      padding.top, padding.right, padding.bottom, padding.left};
  std::memcpy(out, values, sizeof(values));
}

std::string text(const char* chars, std::uint32_t length) { return std::string(chars, length); }

// Every box of `root`'s subtree into `frames`, breadth first, each after its handle.
void publish(const layout::Node& root) {
  std::vector<const layout::Node*> nodes{&root};
  for (std::size_t i = 0; i < nodes.size(); ++i)
    for (const layout::Node* child : nodes[i]->children()) nodes.push_back(child);
  frames.assign(nodes.size() * (kFrameSize + 1), 0);
  for (std::size_t i = 0; i < nodes.size(); ++i) {
    double* slot = frames.data() + i * (kFrameSize + 1);
    slot[0] = static_cast<double>(reinterpret_cast<std::uintptr_t>(nodes[i]->context));
    writeBox(*nodes[i], slot + 1);
  }
}

} // namespace

#define KUITO_EXPORT(name) __attribute__((export_name(#name)))

extern "C" {

KUITO_EXPORT(alloc) void* kuitoAlloc(std::uint32_t size) { return std::malloc(size); }
KUITO_EXPORT(release) void kuitoRelease(void* pointer) { std::free(pointer); }

KUITO_EXPORT(errorMessage) const char* kuitoErrorMessage() { return lastError.c_str(); }
KUITO_EXPORT(errorLength) std::uint32_t kuitoErrorLength() { return lastError.size(); }

// 0 when `kind` is not a Kuito kind; the error says which.
KUITO_EXPORT(create) std::uint32_t kuitoCreate(const char* kind, std::uint32_t length) {
  Handle* created = nullptr;
  guarded([&] {
    const layout::KindLayout& defaults = layout::kindLayout(text(kind, length));
    created = new Handle{{}, &defaults};
    created->node.style = defaults.style;
    created->node.context = created;
    if (defaults.measured) {
      created->node.measure = [created](float width, layout::MeasureMode widthMode, float height,
                                        layout::MeasureMode heightMode) {
        float size[2] = {0, 0};
        kuitoMeasure(static_cast<std::uint32_t>(reinterpret_cast<std::uintptr_t>(created)), width,
                      static_cast<int>(widthMode), height, static_cast<int>(heightMode), size);
        return layout::Size{size[0], size[1]};
      };
    }
  });
  return static_cast<std::uint32_t>(reinterpret_cast<std::uintptr_t>(created));
}

KUITO_EXPORT(destroy) void kuitoDestroy(std::uint32_t handle) {
  Handle* node = handleOf(handle);
  if (layout::Node* parent = node->node.parent()) parent->remove(node->node);
  for (layout::Node* child : std::vector<layout::Node*>(node->node.children())) node->node.remove(*child);
  delete node;
}

KUITO_EXPORT(measured) bool kuitoMeasured(std::uint32_t handle) { return handleOf(handle)->kind->measured; }

KUITO_EXPORT(insert) bool kuitoInsert(std::uint32_t parent, std::uint32_t child, std::uint32_t index) {
  return guarded([&] { handleOf(parent)->node.insert(handleOf(child)->node, index); });
}

KUITO_EXPORT(removeFromParent) void kuitoRemoveFromParent(std::uint32_t handle) {
  layout::Node& node = handleOf(handle)->node;
  if (layout::Node* parent = node.parent()) parent->remove(node);
}

// 0 for `host` stops inheriting.
KUITO_EXPORT(inheritFrom) void kuitoInheritFrom(std::uint32_t handle, std::uint32_t host) {
  handleOf(handle)->node.inheritFrom(host ? &handleOf(host)->node : nullptr);
}

KUITO_EXPORT(isLayoutProperty) bool kuitoIsLayoutProperty(std::uint32_t key) {
  return layout::isLayoutProperty(static_cast<kuito::PropKey>(key));
}

// `kind` is LayoutValue::Kind's: null resets the prop to the kind's default,
// a number, a length's text, or an enum's index among the manifest's values.
KUITO_EXPORT(set)
bool kuitoSet(std::uint32_t handle, std::uint32_t key, std::uint32_t kind, double number, std::int32_t index,
               const char* text, std::uint32_t textLength) {
  return guarded([&] {
    Handle* node = handleOf(handle);
    const layout::LayoutValue value{static_cast<layout::LayoutValue::Kind>(kind), number, index,
                                    std::string_view(text, textLength)};
    layout::setLayoutProperty(node->node.style, node->kind->style, static_cast<kuito::PropKey>(key), value);
    node->node.markDirty();
  });
}

KUITO_EXPORT(setInset)
void kuitoSetInset(std::uint32_t handle, float top, float right, float bottom, float left) {
  layout::Node& node = handleOf(handle)->node;
  const layout::Edges inset{top, right, bottom, left};
  if (node.style.extraPadding == inset) return;
  node.style.extraPadding = inset;
  node.markDirty();
}

KUITO_EXPORT(markDirty) void kuitoMarkDirty(std::uint32_t handle) { handleOf(handle)->node.markDirty(); }

KUITO_EXPORT(markContentDirty) void kuitoMarkContentDirty(std::uint32_t handle) {
  handleOf(handle)->node.markContentDirty();
}

KUITO_EXPORT(dirty) bool kuitoDirty(std::uint32_t handle) { return handleOf(handle)->node.dirty(); }

// 0 when the node is a root. The handle is the node's context (create stores it).
KUITO_EXPORT(parent) std::uint32_t kuitoParent(std::uint32_t handle) {
  layout::Node* parent = handleOf(handle)->node.parent();
  return parent ? static_cast<std::uint32_t>(reinterpret_cast<std::uintptr_t>(parent->context)) : 0;
}

// A NaN side is unconstrained: the node wraps its content along it. On
// success `frames` holds every box of the tree, breadth first, and the
// host reads them through framesPointer and nodeAt.
KUITO_EXPORT(calculate) bool kuitoCalculate(std::uint32_t handle, float width, float height, float scale) {
  return guarded([&] {
    const auto side = [](float value) {
      return std::isnan(value) ? std::optional<float>() : std::optional<float>(value);
    };
    layout::Node& root = handleOf(handle)->node;
    root.calculate(side(width), side(height), scale);
    publish(root);
  });
}

// A number prop that moves every frame: sets it and lays out at once only
// the subtree it can change (Node::relayout), whose boxes `frames` then
// holds. Without one, `frames` is empty and the tree's root must calculate.
KUITO_EXPORT(drive) bool kuitoDrive(std::uint32_t handle, std::uint32_t key, double value) {
  return guarded([&] {
    Handle* node = handleOf(handle);
    layout::setLayoutProperty(node->node.style, node->kind->style, static_cast<kuito::PropKey>(key),
                              layout::LayoutValue::of(value));
    if (const layout::Node* changed = node->node.relayout()) publish(*changed);
    else frames.clear();
  });
}

// The engine's work since the module loaded (layout::LayoutCost), for the
// host's cost counters.
KUITO_EXPORT(nodesLaidOut) double kuitoNodesLaidOut() { return static_cast<double>(layout::layoutCost().nodesLaidOut); }
KUITO_EXPORT(measureCalls) double kuitoMeasureCalls() { return static_cast<double>(layout::layoutCost().measureCalls); }
KUITO_EXPORT(wastedMeasures) double kuitoWastedMeasures() {
  return static_cast<double>(layout::layoutCost().wastedMeasures);
}

// The last pass's frames: per node, its handle and then its kFrameSize values.
KUITO_EXPORT(framesPointer) const double* kuitoFramesPointer() { return frames.data(); }
KUITO_EXPORT(framesLength) std::uint32_t kuitoFramesLength() { return frames.size(); }

} // extern "C"
