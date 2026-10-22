// Runs Taffy's flexbox fixtures (test/fixtures/taffy) through Kuito's layout
// engine. Reads trees from stdin, one per test:
//
//   test <name>
//   viewport <width> <height>      // a length or max-content / min-content
//   rounding <0|1>
//   node <depth> <attribute>=<value>\t...   (text=<content> for text leaves)
//   end
//
// and prints each node's box in preorder, "<x> <y> <width> <height>", after a
// "test <name>" line. The test file compares them with the fixtures' expectations.
//
// With --relayout it changes each node in turn (width, height, padding, flex
// grow), laying out again with Node::relayout alone, frame after frame, and
// prints "<same|differs> <full|partial> <name> <node> <change>": whether every
// box matches a twin tree laid out from scratch, and whether relayout laid out
// a subtree or left the whole tree to calculate.
#include "layout/FlexLayout.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace kuito::layout;

namespace {

std::string trim(const std::string& s) {
  const auto begin = s.find_first_not_of(" \t\r\n");
  if (begin == std::string::npos) return "";
  return s.substr(begin, s.find_last_not_of(" \t\r\n") - begin + 1);
}

std::vector<std::string> words(const std::string& s) {
  std::istringstream in(s);
  std::vector<std::string> out;
  for (std::string w; in >> w;) out.push_back(w);
  return out;
}

bool endsWith(const std::string& s, const std::string& suffix) {
  return s.size() >= suffix.size() && s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

float number(const std::string& s) { return std::stof(s); }

Dimension dimension(const std::string& raw) {
  const std::string v = trim(raw);
  if (v == "auto") return {};
  if (v == "min-content") return {Dimension::MinContent, 0};
  if (v == "max-content") return {Dimension::MaxContent, 0};
  if (v == "fit-content") return {Dimension::FitContent, 0};
  if (v == "stretch") return {Dimension::Stretch, 0};
  if (v == "content") return {Dimension::Content, 0};
  if (v.rfind("fit-content(", 0) == 0) {
    const std::string inner = v.substr(12, v.size() - 13);
    if (endsWith(inner, "%")) return {Dimension::FitContentPercent, number(inner) / 100};
    return {Dimension::FitContentPoints, number(inner)};
  }
  if (endsWith(v, "%")) return Dimension::percent(number(v) / 100);
  return Dimension::points(number(v));
}

LengthPercentage lengthPercentage(const std::string& v) {
  if (endsWith(v, "%")) return {true, number(v) / 100};
  return {false, number(v)};
}

std::pair<Safety, std::string> safety(const std::string& raw) {
  const std::vector<std::string> parts = words(raw);
  if (parts.size() == 2) return {parts[0] == "safe" ? Safety::Safe : Safety::Unsafe, parts[1]};
  return {Safety::Default, parts.empty() ? "" : parts[0]};
}

AlignItems alignItems(const std::string& raw) {
  static const std::map<std::string, AlignItems::Keyword> keywords{
      {"normal", AlignItems::Normal},       {"start", AlignItems::Start},       {"end", AlignItems::End},
      {"flex-start", AlignItems::FlexStart}, {"flex-end", AlignItems::FlexEnd}, {"center", AlignItems::Center},
      {"baseline", AlignItems::Baseline},   {"stretch", AlignItems::Stretch},   {"self-start", AlignItems::SelfStart},
      {"self-end", AlignItems::SelfEnd},
  };
  const auto [s, keyword] = safety(raw);
  return {keywords.at(keyword), s};
}

AlignContent alignContent(const std::string& raw) {
  static const std::map<std::string, AlignContent::Keyword> keywords{
      {"normal", AlignContent::Normal},           {"start", AlignContent::Start},
      {"end", AlignContent::End},                 {"flex-start", AlignContent::FlexStart},
      {"flex-end", AlignContent::FlexEnd},        {"center", AlignContent::Center},
      {"stretch", AlignContent::Stretch},         {"space-between", AlignContent::SpaceBetween},
      {"space-around", AlignContent::SpaceAround}, {"space-evenly", AlignContent::SpaceEvenly},
  };
  const auto [s, keyword] = safety(raw);
  return {keywords.at(keyword), s};
}

Overflow overflow(const std::string& v) {
  if (v == "hidden") return Overflow::Hidden;
  if (v == "scroll") return Overflow::Scroll;
  if (v == "clip") return Overflow::Clip;
  return Overflow::Visible;
}

void apply(Style& s, const std::string& key, const std::string& v) {
  if (key == "display") s.display = v == "none" ? Display::None : Display::Flex;
  else if (key == "position") s.position = v == "absolute" ? Position::Absolute : Position::Relative;
  else if (key == "direction") s.ownDirection = v == "rtl" ? Direction::Rtl : Direction::Ltr;
  else if (key == "box-sizing") s.boxSizing = v == "content-box" ? BoxSizing::ContentBox : BoxSizing::BorderBox;
  else if (key == "overflow-x") s.overflow.x = overflow(v);
  else if (key == "overflow-y") s.overflow.y = overflow(v);
  else if (key == "scrollbar-width") s.scrollbarWidth = number(v);
  else if (key == "width") s.size.width = dimension(v);
  else if (key == "height") s.size.height = dimension(v);
  else if (key == "min-width") s.minSize.width = dimension(v);
  else if (key == "min-height") s.minSize.height = dimension(v);
  else if (key == "max-width") s.maxSize.width = dimension(v);
  else if (key == "max-height") s.maxSize.height = dimension(v);
  else if (key == "aspect-ratio") s.aspectRatio = number(v);
  else if (key == "top") s.inset.top = dimension(v);
  else if (key == "right") s.inset.right = dimension(v);
  else if (key == "bottom") s.inset.bottom = dimension(v);
  else if (key == "left") s.inset.left = dimension(v);
  else if (key == "margin-top") s.margin.top = dimension(v);
  else if (key == "margin-right") s.margin.right = dimension(v);
  else if (key == "margin-bottom") s.margin.bottom = dimension(v);
  else if (key == "margin-left") s.margin.left = dimension(v);
  else if (key == "padding-top") s.padding.top = lengthPercentage(v);
  else if (key == "padding-right") s.padding.right = lengthPercentage(v);
  else if (key == "padding-bottom") s.padding.bottom = lengthPercentage(v);
  else if (key == "padding-left") s.padding.left = lengthPercentage(v);
  else if (key == "border-top") s.border.top = lengthPercentage(v);
  else if (key == "border-right") s.border.right = lengthPercentage(v);
  else if (key == "border-bottom") s.border.bottom = lengthPercentage(v);
  else if (key == "border-left") s.border.left = lengthPercentage(v);
  else if (key == "column-gap") s.gap.width = lengthPercentage(v);
  else if (key == "row-gap") s.gap.height = lengthPercentage(v);
  else if (key == "flex-direction") {
    static const std::map<std::string, FlexDirection> values{{"row", FlexDirection::Row},
                                                              {"column", FlexDirection::Column},
                                                              {"row-reverse", FlexDirection::RowReverse},
                                                              {"column-reverse", FlexDirection::ColumnReverse}};
    s.flexDirection = values.at(v);
  } else if (key == "flex-wrap") {
    static const std::map<std::string, FlexWrap> values{{"nowrap", FlexWrap::NoWrap},
                                                         {"wrap", FlexWrap::Wrap},
                                                         {"wrap-reverse", FlexWrap::WrapReverse},
                                                         {"balance", FlexWrap::Balance},
                                                         {"wrap-reverse balance", FlexWrap::BalanceReverse},
                                                         {"balance wrap-reverse", FlexWrap::BalanceReverse}};
    s.flexWrap = values.at(v);
  } else if (key == "flex-line-count") s.flexLineCount = static_cast<std::uint16_t>(std::stoi(v));
  else if (key == "flex-grow") s.flexGrow = number(v);
  else if (key == "flex-shrink") s.flexShrink = number(v);
  else if (key == "flex-basis") s.flexBasis = dimension(v);
  else if (key == "align-items") s.alignItems = alignItems(v);
  else if (key == "align-self") {
    if (v != "auto") s.alignSelf = alignItems(v);
  } else if (key == "align-content") s.alignContent = alignContent(v);
  else if (key == "justify-content") s.justifyContent = alignContent(v);
  else throw std::invalid_argument("unsupported attribute " + key);
}

// Taffy's test measure: Ahem glyphs are 10x10, and lines break only at
// zero-width spaces.
Measure ahem(const std::string& text) {
  std::vector<std::size_t> lines{0};
  const std::string zws = "\xE2\x80\x8B";
  for (std::size_t i = 0; i < text.size();) {
    if (text.compare(i, zws.size(), zws) == 0) {
      lines.push_back(0);
      i += zws.size();
    } else {
      ++lines.back();
      ++i;
    }
  }
  std::size_t minLine = 0, maxLine = 0;
  for (std::size_t length : lines) {
    minLine = std::max(minLine, length);
    maxLine += length;
  }
  return [=](float width, MeasureMode widthMode, float height, MeasureMode heightMode) {
    float inline_ = 0;
    switch (widthMode) {
      case MeasureMode::Exactly: inline_ = width; break;
      case MeasureMode::MinContent: inline_ = static_cast<float>(minLine) * 10; break;
      case MeasureMode::Undefined: inline_ = static_cast<float>(maxLine) * 10; break;
      case MeasureMode::AtMost: inline_ = std::min(width, static_cast<float>(maxLine) * 10); break;
    }
    inline_ = std::max(inline_, static_cast<float>(minLine) * 10);
    if (heightMode == MeasureMode::Exactly) return Size{inline_, height};
    const std::size_t perLine = static_cast<std::size_t>(std::floor(inline_ / 10));
    std::size_t count = 1, current = 0;
    for (std::size_t length : lines) {
      if (current + length > perLine) {
        if (current > 0) ++count;
        current = length;
      } else {
        current += length;
      }
    }
    return Size{inline_, static_cast<float>(count) * 10};
  };
}

AvailableSpace viewport(const std::string& v) {
  if (v == "max-content") return AvailableSpace::maxContent();
  if (v == "min-content") return AvailableSpace::minContent();
  return AvailableSpace::definite(number(v));
}

void boxes(const Node& node, std::vector<Layout>& out) {
  out.push_back(node.layout());
  for (const Node* child : node.children()) boxes(*child, out);
}

bool same(const std::vector<Layout>& a, const std::vector<Layout>& b) {
  return std::equal(a.begin(), a.end(), b.begin(), b.end(), [](const Layout& l, const Layout& r) {
    return l.x == r.x && l.y == r.y && l.width == r.width && l.height == r.height && l.content == r.content &&
           l.padding == r.padding && l.border == r.border;
  });
}

using Tree = std::vector<std::unique_ptr<Node>>;

// The changes each node goes through in turn, as frames of an animation would:
// grow, shrink, pad, flex.
const std::vector<void (*)(Node&)> changes{
    [](Node& node) { node.style.size.width = Dimension::points(node.layout().width + 7); },
    [](Node& node) { node.style.size.height = Dimension::points(std::fmax(node.layout().height - 3, 0.0f)); },
    [](Node& node) { node.style.padding = {{false, 3}, {false, 5}, {false, 3}, {false, 5}}; },
    [](Node& node) { node.style.flexGrow = node.style.flexGrow == 0 ? 1 : 0; },
};

// Changes the live tree with relayout alone, frame after frame, and its twin
// from scratch: every box, padding and leaf inset must match after each change.
void relayoutEachNode(const std::string& name, const Tree& live, const Tree& twin, AvailableSpace width,
                      AvailableSpace height, float scale) {
  live.front()->calculateRoot(width, height, scale);
  for (std::size_t k = 1; k < live.size(); ++k) {
    for (std::size_t c = 0; c < changes.size(); ++c) {
      changes[c](*live[k]);
      twin[k]->style = live[k]->style;
      const bool partial = live[k]->relayout() != nullptr;
      if (!partial) live.front()->calculateRoot(width, height, scale);
      for (const std::unique_ptr<Node>& each : twin) each->markDirty();
      twin.front()->calculateRoot(width, height, scale);
      std::vector<Layout> relaidOut, fresh;
      boxes(*live.front(), relaidOut);
      boxes(*twin.front(), fresh);
      const bool insets = std::equal(live.begin(), live.end(), twin.begin(), twin.end(),
                                     [](const std::unique_ptr<Node>& a, const std::unique_ptr<Node>& b) {
                                       return a->children().size() || a->contentInset() == b->contentInset();
                                     });
      std::cout << (same(relaidOut, fresh) && insets ? "same " : "differs ") << (partial ? "partial " : "full ")
                << name << ' ' << k << ' ' << c << '\n';
    }
  }
}

void print(const Node& node) {
  const Layout& l = node.layout();
  std::cout << l.x << ' ' << l.y << ' ' << l.width << ' ' << l.height << '\n';
  for (const Node* child : node.children()) print(*child);
}

// A node line's depth and fields, built into as many trees as a mode needs.
struct NodeSpec {
  std::size_t depth;
  std::string fields;
};

Tree build(const std::vector<NodeSpec>& specs) {
  Tree nodes;
  std::vector<Node*> stack;
  for (const NodeSpec& spec : specs) {
    nodes.push_back(std::make_unique<Node>());
    Node& node = *nodes.back();
    std::istringstream fields(spec.fields);
    for (std::string field; std::getline(fields, field, '\t');) {
      if (field.empty() || field == " ") continue;
      const std::size_t eq = field.find('=');
      const std::string key = trim(field.substr(0, eq));
      const std::string value = field.substr(eq + 1);
      if (key == "text") node.measure = ahem(value);
      else apply(node.style, key, trim(value));
    }
    stack.resize(spec.depth);
    if (spec.depth > 0) stack[spec.depth - 1]->insert(node, stack[spec.depth - 1]->children().size());
    stack.push_back(&node);
  }
  return nodes;
}

} // namespace

int main(int argc, char** argv) {
  const bool relayout = argc > 1 && std::string(argv[1]) == "--relayout";
  std::string line, name;
  AvailableSpace width, height;
  float scale = 1;
  std::vector<NodeSpec> specs;

  while (std::getline(std::cin, line)) {
    if (line.rfind("test ", 0) == 0) {
      name = line.substr(5);
      specs.clear();
    } else if (line.rfind("viewport ", 0) == 0) {
      const std::vector<std::string> parts = words(line);
      width = viewport(parts[1]);
      height = viewport(parts[2]);
    } else if (line.rfind("rounding ", 0) == 0) {
      scale = line.substr(9) == "1" ? 1 : 0;
    } else if (line.rfind("node ", 0) == 0) {
      std::istringstream in(line.substr(5));
      NodeSpec spec;
      in >> spec.depth;
      std::getline(in, spec.fields);
      specs.push_back(spec);
    } else if (line == "end") {
      if (!relayout) std::cout << "test " << name << '\n';
      try {
        const Tree nodes = build(specs);
        if (relayout) {
          relayoutEachNode(name, nodes, build(specs), width, height, scale);
          continue;
        }
        nodes.front()->calculateRoot(width, height, scale);
        print(*nodes.front());
      } catch (const std::exception& error) {
        std::cout << "error " << error.what() << '\n';
      }
    }
  }
  return 0;
}
