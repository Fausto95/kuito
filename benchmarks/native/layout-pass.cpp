// The engine alone on demo/text-rows.tsx's tree: 100 rows of two labels too
// wide for them, every label retitled before each pass. Measuring is a few
// arithmetic operations here, so the time is the C++ engine's, which the
// compiler's optimization level changes, and not the platform's text layout.
// benchmarks/frame-drops.md#native-optimization builds it at each level:
//
//   c++ -std=c++17 -O2 -I native/shared native/shared/layout/*.cpp \
//     benchmarks/native/layout-pass.cpp -o /tmp/layout-pass && /tmp/layout-pass
#include "layout/FlexLayout.h"
#include "layout/KuitoLayoutStyle.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <memory>
#include <string>
#include <vector>

using namespace kuito::layout;

namespace {

constexpr int ROWS = 100;
constexpr int WARMUP = 20;
constexpr int PASSES = 200;

struct Tree {
  std::vector<std::unique_ptr<Node>> nodes;
  std::vector<Node*> labels;

  Node& make(const std::string& kind, Node* parent) {
    nodes.push_back(std::make_unique<Node>());
    Node& node = *nodes.back();
    node.style = kindLayout(kind).style;
    if (parent) parent->insert(node, parent->children().size());
    return node;
  }

  static void set(Node& node, const char* name, double value) {
    const auto key = kuito::propKey(name);
    setLayoutProperty(node.style, node.style, *key, LayoutValue::of(value));
  }

  // A label of `characters` 8-point characters in 6-character words and
  // 18-point lines, as a platform's text measure answers.
  Node& label(Node& row, float characters) {
    Node& node = make("Text", &row);
    node.measure = [characters](float width, MeasureMode mode, float, MeasureMode) {
      const float full = characters * 8;
      float line = full;
      if (mode == MeasureMode::MinContent) line = 6 * 8;
      else if (mode != MeasureMode::Undefined) line = std::min(full, width);
      const float lines = std::ceil(full / std::max(line, 1.0f));
      return Size{line, 18 * lines};
    };
    labels.push_back(&node);
    return node;
  }
};

} // namespace

int main() {
  Tree tree;
  Node& root = tree.make("VStack", nullptr);
  Tree::set(root, "padding", 12);
  Tree::set(root, "gap", 8);

  for (int index = 0; index < ROWS; ++index) {
    Node& row = tree.make("HStack", &root);
    Tree::set(row, "gap", 8);
    tree.label(row, 60);
    tree.label(row, 52);
  }

  std::vector<double> times;
  for (int pass = 0; pass < WARMUP + PASSES; ++pass) {
    for (Node* label : tree.labels) label->markDirty();
    const auto start = std::chrono::steady_clock::now();
    root.calculate(402, std::nullopt, 3);
    const std::chrono::duration<double, std::milli> elapsed = std::chrono::steady_clock::now() - start;
    if (pass >= WARMUP) times.push_back(elapsed.count());
  }

  std::sort(times.begin(), times.end());
  // The height shows the labels wrapped as on a device; it is the same at every
  // level.
  std::printf("height=%.1f passes=%d p50=%.3f ms p90=%.3f ms\n", root.layout().height, PASSES, times[PASSES / 2],
              times[PASSES * 9 / 10]);
  return 0;
}
