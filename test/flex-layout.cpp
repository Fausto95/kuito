#include "layout/FlexLayout.h"
#include "layout/KuitoLayoutStyle.h"
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdlib>
#include <iostream>
#include <new>
#include <memory>
#include <stdexcept>
#include <string>
#include <variant>
#include <vector>

using namespace kuito::layout;

static int failures = 0;

// Bytes the program holds on the heap: the layout engine's caches live
// there, so a pass that keeps them bounded leaves this unchanged.
static std::size_t liveBytes = 0;
// Every allocation the program makes.
static std::size_t allocations = 0;

void* operator new(std::size_t size) {
  void* block = std::malloc(size + alignof(std::max_align_t));
  if (!block) throw std::bad_alloc();
  *static_cast<std::size_t*>(block) = size;
  liveBytes += size;
  ++allocations;
  return static_cast<char*>(block) + alignof(std::max_align_t);
}

void operator delete(void* pointer) noexcept {
  if (!pointer) return;
  void* block = static_cast<char*>(pointer) - alignof(std::max_align_t);
  liveBytes -= *static_cast<std::size_t*>(block);
  std::free(block);
}

void operator delete(void* pointer, std::size_t) noexcept { operator delete(pointer); }

static void expect(bool ok, const std::string& what) {
  if (!ok) {
    ++failures;
    std::cerr << "FAIL: " << what << "\n";
  }
}

static void near(float actual, float expected, const std::string& what) {
  expect(std::fabs(actual - expected) < 0.01f,
         what + ": expected " + std::to_string(expected) + ", got " + std::to_string(actual));
}

// A prop's value as a test writes it: none, a number, or the text the host
// batch types by the prop's kind, an enum's value or a length.
using Written = std::variant<std::monostate, double, std::string>;

// `name`'s key and `value` as the host batch types them (native/shared/Wire.h):
// an enum's value by its index among the manifest's, -1 for none of them.
static void setByName(Style& style, const Style& defaults, const std::string& name, const Written& value) {
  const auto key = kuito::propKey(name);
  if (!key) throw std::logic_error("no prop is named " + name);
  LayoutValue typed;
  if (const auto* number = std::get_if<double>(&value)) typed = LayoutValue::of(*number);
  else if (const auto* text = std::get_if<std::string>(&value))
    typed = kuito::propInfo(*key).kind == kuito::ValueKind::Enum
                ? LayoutValue::choice(kuito::enumValue(*key, *text).value_or(-1))
                : LayoutValue::length(*text);
  setLayoutProperty(style, defaults, *key, typed);
}

// Owns a test tree; nodes are created with Kuito's kind defaults.
struct Tree {
  std::vector<std::unique_ptr<Node>> nodes;

  Node& make(const std::string& kind, Node* parent = nullptr) {
    nodes.push_back(std::make_unique<Node>());
    Node& node = *nodes.back();
    node.style = kindLayout(kind).style;
    if (parent) parent->insert(node, parent->children().size());
    return node;
  }

  Node& fixed(Node& parent, float width, float height) {
    Node& node = make("Box", &parent);
    set(node, "width", width);
    set(node, "height", height);
    return node;
  }

  // A text leaf: one line of `length` points, wrapping in 20-point lines at
  // any 10-point word.
  Node& text(Node& parent, float length) {
    Node& node = make("Text", &parent);
    node.measure = [length](float width, MeasureMode mode, float, MeasureMode) {
      float line = length;
      if (mode == MeasureMode::MinContent) line = std::min(length, 10.0f);
      else if (mode != MeasureMode::Undefined) line = std::min(length, width);
      float lines = line > 0 ? std::ceil(length / line) : 1;
      return Size{line, 20 * lines};
    };
    return node;
  }

  // Sets a prop by name, as the renderers do.
  static void set(Node& node, const std::string& name, Written value) {
    setByName(node.style, node.style, name, value);
    node.markDirty();
  }
};

static void set(Node& node, const std::string& name, Written value) { Tree::set(node, name, value); }

// Sets a prop to null: the kind's default, as the renderers reset it.
static void reset(Node& node, const std::string& kind, const std::string& name) {
  setByName(node.style, kindLayout(kind).style, name, std::monostate{});
  node.markDirty();
}

static void stackKeepsExplicitWidthAndStretchesAutoChildren() {
  Tree t;
  Node& root = t.make("VStack");
  set(root, "padding", 10.0);
  Node& fixed = t.fixed(root, 100, 60);
  Node& stretched = t.make("Box", &root);
  set(stretched, "height", 20.0);

  root.calculate(400, std::nullopt);

  near(fixed.layout().width, 100, "explicit width survives stretch");
  near(fixed.layout().x, 10, "explicit-width child starts at the padding");
  near(stretched.layout().width, 380, "auto width stretches to the content box");
  near(stretched.layout().y, 70, "children stack below each other");
  near(root.layout().height, 100, "auto height wraps content and padding");
}

static void rowLeavesLeftoverSpaceEmpty() {
  Tree t;
  Node& row = t.make("HStack");
  set(row, "gap", 12.0);
  Node& a = t.fixed(row, 100, 100);
  Node& b = t.fixed(row, 100, 100);
  Node& c = t.fixed(row, 100, 100);

  row.calculate(400, std::nullopt);

  near(a.layout().x, 0, "first item at start");
  near(b.layout().x, 112, "gap between items");
  near(c.layout().x, 224, "third item after two gaps");
  near(c.layout().width, 100, "last item keeps its width");
  near(row.layout().width, 400, "row keeps its width");
}

static void justifyContentPlacesItemsOnTheMainAxis() {
  const std::vector<std::pair<std::string, std::vector<float>>> cases{
      {"start", {0, 100}},
      {"center", {100, 200}},
      {"end", {200, 300}},
      {"space-between", {0, 300}},
  };
  for (const auto& [justify, expected] : cases) {
    Tree t;
    Node& row = t.make("HStack");
    setByName(row.style, kindLayout("HStack").style, "justifyContent", justify);
    Node& a = t.fixed(row, 100, 10);
    Node& b = t.fixed(row, 100, 10);

    row.calculate(400, std::nullopt);

    near(a.layout().x, expected[0], "justify " + justify + " first item");
    near(b.layout().x, expected[1], "justify " + justify + " second item");
  }
}

static void alignItemsPlacesItemsOnTheCrossAxis() {
  Tree t;
  Node& stack = t.make("VStack");
  setByName(stack.style, kindLayout("VStack").style, "alignItems", std::string("center"));
  Node& label = t.text(stack, 100);
  Node& end = t.fixed(stack, 50, 10);
  set(end, "width", 50.0);

  stack.calculate(300, std::nullopt);

  near(label.layout().width, 100, "centered text keeps its natural width");
  near(label.layout().x, 100, "text is centered");
  near(end.layout().x, 125, "fixed child is centered");

  Tree r;
  Node& row = r.make("HStack");
  set(row, "height", 100.0);
  Node& centered = r.fixed(row, 10, 40);
  row.calculate(300, std::nullopt);
  near(centered.layout().y, 30, "rows center their children by default");
}

static void rowTextShrinksAndWraps() {
  Tree t;
  Node& row = t.make("HStack");
  set(row, "gap", 10.0);
  Node& image = t.fixed(row, 50, 50);
  set(image, "flexShrink", 0.0);
  Node& label = t.text(row, 300);

  row.calculate(200, std::nullopt);

  near(image.layout().width, 50, "flexShrink: 0 keeps a fixed item's width");
  near(label.layout().width, 140, "text shrinks into the remaining space");
  near(label.layout().height, 60, "shrunk text wraps onto more lines");
  near(row.layout().height, 60, "row grows to the wrapped text");
}

// As in CSS, every item may shrink: an explicit size is a flex basis, not a minimum.
static void fixedItemsShrinkLikeCss() {
  Tree t;
  Node& row = t.make("HStack");
  Node& a = t.fixed(row, 150, 10);
  Node& b = t.fixed(row, 150, 10);

  row.calculate(200, std::nullopt);

  near(a.layout().width, 100, "fixed items share the overflow");
  near(b.layout().x, 100, "and stay side by side");
}

// A fixed-size item's automatic minimum is the smaller of its size and its
// content's, so in an overflowing row its content still moves it and its
// siblings: a content change inside it must lay the row out again.
static void aShrinkingFixedBoxFollowsItsContent() {
  Tree t;
  Node& row = t.make("HStack");
  Node& a = t.fixed(row, 150, 10);
  Node& b = t.fixed(row, 150, 10);
  float textWidth = 140;
  Node& text = t.make("Text", &a);
  text.measure = [&textWidth](float, MeasureMode, float, MeasureMode) { return Size{textWidth, 10}; };

  row.calculate(200, std::nullopt);
  near(a.layout().width, 140, "the text holds the box at its width");

  textWidth = 20;
  text.markContentDirty();
  row.calculate(200, std::nullopt);

  near(a.layout().width, 100, "a shorter text lets the box shrink");
  near(b.layout().x, 100, "and its sibling moves");

  set(a, "flexShrink", 0.0);
  row.calculate(200, std::nullopt);
  text.markContentDirty();
  expect(a.dirty() && !row.dirty(), "a box that cannot shrink keeps the row's layout");
}

// Every item shrinks below its minimum, so all of them freeze at it and
// no free space is left to divide among unfrozen items: a float residual
// there must not move them (Yoga #2038).
static void shrinkingItemsFreezeAtTheirMinimums() {
  Tree t;
  Node& row = t.make("HStack");
  const float widths[] = {100.1f, 200.3f, 300.7f};
  const float minimums[] = {90, 190, 290};
  std::vector<Node*> items;
  for (int i = 0; i < 3; ++i) {
    Node& item = t.fixed(row, widths[i], 10);
    set(item, "minWidth", minimums[i]);
    set(item, "flexShrink", 1.0);
    items.push_back(&item);
  }

  row.calculate(350, std::nullopt);

  near(items[0]->layout().width, 90, "the first item stops at its minimum");
  near(items[1]->layout().width, 190, "the second item stops at its minimum");
  near(items[2]->layout().width, 290, "the third item stops at its minimum");
  near(items[2]->layout().x, 280, "and they overflow side by side");
}

static void spacerTakesTheFreeSpace() {
  Tree t;
  Node& row = t.make("HStack");
  t.fixed(row, 50, 10);
  Node& spacer = t.make("Spacer", &row);
  Node& last = t.fixed(row, 50, 10);

  row.calculate(300, std::nullopt);

  near(spacer.layout().width, 200, "spacer grows");
  near(last.layout().x, 250, "item after the spacer sits at the end");
}

static void scrollViewFillsItsParentAndScrollsItsContent() {
  Tree t;
  Node& root = t.make("VStack");
  Node& scroll = t.make("Scroll", &root);
  set(scroll, "paddingBottom", 10.0);
  Node& first = t.fixed(scroll, 50, 300);
  Node& stretched = t.make("Box", &scroll);
  set(stretched, "height", 100.0);

  root.calculate(320, 200);

  near(scroll.layout().height, 200, "scroll view fills its parent's height");
  near(scroll.layout().width, 320, "scroll view stretches across");
  near(scroll.layout().content.height, 410, "content height includes every child and padding");
  near(first.layout().height, 300, "children keep their size inside a scroll view");
  near(stretched.layout().width, 320, "scroll children stretch across");
  near(stretched.layout().y, 300, "scroll children stack from the top");
}

// CSS resolves a percentage against the scroll container's content box: a
// page of a pager is 100% of the view, though its content has no limit along
// the axis. Padding is the content's, so the box excludes it.
static void percentagesAlongAScrollViewsAxisResolveAgainstTheView() {
  Tree t;
  Node &root = t.make("VStack");
  Node &rail = t.make("HorizontalScroll", &root);
  set(rail, "paddingLeft", 10.0);
  set(rail, "paddingRight", 10.0);
  std::vector<Node *> pages;
  for (int i = 0; i < 3; ++i) {
    Node &page = t.make("Box", &rail);
    set(page, "width", std::string("100%"));
    set(page, "flexShrink", 0.0);
    t.fixed(page, 10, 50);
    pages.push_back(&page);
  }

  root.calculate(320, 600);

  near(pages[0]->layout().width, 300,
       "a page is the view's width, inside its padding");
  near(pages[2]->layout().x, 610, "pages follow one another");
  near(rail.layout().content.width, 920,
       "the content holds every page and the padding");
}

static void stacksDoNotShrinkBelowTheirContent() {
  Tree t;
  Node& root = t.make("VStack");
  Node& stack = t.make("VStack", &root);
  t.fixed(stack, 10, 300);

  root.calculate(320, 100);

  near(stack.layout().height, 300, "column items overflow rather than squash");
}

static void horizontalScrollInsideAVerticalScroll() {
  Tree t;
  Node& root = t.make("VStack");
  Node& page = t.make("Scroll", &root);
  Node& rail = t.make("HorizontalScroll", &page);
  set(rail, "gap", 10.0);
  for (int i = 0; i < 5; ++i) t.fixed(rail, 96, 96);
  Node& below = t.fixed(page, 10, 10);

  root.calculate(320, 600);

  near(rail.layout().width, 320, "rail stretches across the page");
  near(rail.layout().height, 96, "rail wraps its content height");
  near(rail.layout().content.width, 520, "rail content is the sum of items and gaps");
  near(below.layout().y, 96, "content after the rail follows it");
}

// A rail's height comes from its items at their own width: sizing it must not
// shrink them into the page's width first.
static void horizontalRailsSizeFromUnshrunkItems() {
  Tree t;
  Node& page = t.make("VStack");
  Node& rail = t.make("HorizontalScroll", &page);
  for (int i = 0; i < 6; ++i) {
    Node& card = t.make("Box", &rail);
    set(card, "width", 100.0);
    set(t.make("Image", &card), "aspectRatio", 0.5);
  }
  Node& below = t.fixed(page, 10, 10);

  page.calculate(320, std::nullopt);

  near(rail.layout().height, 200, "the rail is as tall as an unshrunk card");
  near(below.layout().y, 200, "content after the rail clears it");
}

static void aspectRatioDerivesTheOtherSide() {
  Tree t;
  Node& stack = t.make("VStack");
  Node& image = t.make("Image", &stack);
  set(image, "aspectRatio", 1.5);

  stack.calculate(300, std::nullopt);

  near(image.layout().width, 300, "stretched image fills the width");
  near(image.layout().height, 200, "height follows the aspect ratio");
}

static void hiddenChildrenTakeNoSpace() {
  Tree t;
  Node& stack = t.make("VStack");
  set(stack, "gap", 10.0);
  t.fixed(stack, 10, 10);
  Node& hidden = t.fixed(stack, 10, 10);
  setByName(hidden.style, kindLayout("Box").style, "hidden", 1.0);
  Node& last = t.fixed(stack, 10, 10);

  stack.calculate(100, std::nullopt);

  near(last.layout().y, 20, "a hidden child adds no size and no gap");
  near(hidden.layout().height, 0, "a hidden child has no size");
}

static void minAndMaxClampSizes() {
  Tree t;
  Node& stack = t.make("VStack");
  Node& capped = t.make("Box", &stack);
  set(capped, "maxWidth", 120.0);
  set(capped, "minHeight", 30.0);

  stack.calculate(300, std::nullopt);

  near(capped.layout().width, 120, "max-width caps a stretched child");
  near(capped.layout().height, 30, "min-height sizes an empty child");
}

// Taffy sizes an auto-width row from its items' flex bases, even past the
// width a centering column offers; text inside it does not wrap.
static void autoWidthRowsTakeTheirContentWidth() {
  Tree t;
  Node& stack = t.make("VStack");
  set(stack, "alignItems", std::string("center"));
  Node& row = t.make("HStack", &stack);
  t.fixed(row, 40, 20);
  Node& label = t.text(row, 500);

  stack.calculate(200, std::nullopt);

  near(row.layout().width, 540, "the row takes its content width");
  near(label.layout().width, 500, "its text keeps one line");

  Tree w;
  Node& column = w.make("VStack");
  Node& stretched = w.make("HStack", &column);
  set(w.fixed(stretched, 40, 20), "flexShrink", 0.0);
  Node& wrapped = w.text(stretched, 500);

  column.calculate(200, std::nullopt);

  near(stretched.layout().width, 200, "a stretched row takes the column's width");
  near(wrapped.layout().width, 160, "its text shrinks to the rest");
  near(wrapped.layout().height, 80, "and wraps");
}

static void layoutRoundsToThePixelGrid() {
  Tree t;
  Node& row = t.make("HStack");
  setByName(row.style, kindLayout("HStack").style, "justifyContent", std::string("space-between"));
  t.fixed(row, 10, 10);
  Node& middle = t.fixed(row, 10.1f, 10);
  t.fixed(row, 10, 10);

  row.calculate(100, std::nullopt, 3);

  float x = middle.layout().x * 3;
  float width = middle.layout().width * 3;
  near(x, std::round(x), "x lands on a device pixel");
  near(width, std::round(width), "width lands on a device pixel");
}

// A measured leaf keeps every pixel it asked for wherever it lands. Its
// size is whole pixels, but in floats it can fall a hair short of one, and
// rounding its edges then takes a pixel off: a Text one pixel narrower than
// its line wraps its last word. Yoga rounds text up for the same reason.
static void measuredLeavesKeepTheirPixels() {
  const float scale = 2.625f;
  const float width = 259 / scale;
  int lost = 0;

  for (int offset = 0; offset < 2000; ++offset) {
    Tree t;
    Node& row = t.make("HStack");
    Node& box = t.make("Box", &row);
    set(box, "marginLeft", offset / 7.0f);
    Node& text = t.make("Text", &box);
    text.measure = [width](float, MeasureMode, float, MeasureMode) { return Size{width, 20}; };

    row.calculate(2000, std::nullopt, scale);

    if (std::round(text.layout().width * scale) < 259) ++lost;
  }

  expect(lost == 0, "a measured leaf lost a pixel at " + std::to_string(lost) + " of 2000 offsets");
}

static void deepTreesMeasureLinearly() {
  Tree t;
  Node& root = t.make("VStack");
  Node* parent = &root;
  for (int i = 0; i < 30; ++i) parent = &t.make(i % 2 ? "HStack" : "VStack", parent);
  int calls = 0;
  Node& leaf = t.make("Text", parent);
  leaf.measure = [&calls](float, MeasureMode, float, MeasureMode) {
    ++calls;
    return Size{50, 20};
  };

  root.calculate(320, 640);

  expect(calls < 200, "deep trees reuse measurements (" + std::to_string(calls) + " calls)");
  near(leaf.layout().height, 20, "deep leaf is laid out");
}

static void removingAChildRelaysOutItsSiblings() {
  Tree t;
  Node& stack = t.make("VStack");
  Node& first = t.fixed(stack, 10, 10);
  Node& second = t.fixed(stack, 10, 10);

  stack.remove(first);
  stack.calculate(100, std::nullopt);

  near(second.layout().y, 0, "remaining child moves up");
  expect(first.parent() == nullptr, "removed child has no parent");
}

static void kuitoPropertiesValidateAndReset() {
  const Style& row = kindLayout("HStack").style;
  expect(row.flexDirection == FlexDirection::Row, "Row lays out horizontally");
  expect(row.alignItems == AlignItems{AlignItems::Center}, "Row centers its children");
  expect(kindLayout("VStack").style.flexDirection == FlexDirection::Column, "Stack stacks in a column");
  expect(kindLayout("Text").measured, "Text is measured by the platform");
  expect(!kindLayout("VStack").measured, "Stack is laid out by the engine");
  expect(kindLayout("Scroll").style.scrolls, "ScrollView scrolls");
  expect(kindLayout("Scroll").style.overflow.y == Overflow::Scroll, "a ScrollView is a scroll container");
  expect(kindLayout("Button").style.flexShrink == 0, "buttons keep their label on one line");
  expect(kindLayout("Toggle").style.flexShrink == 0, "switches never squash");
  expect(kindLayout("Text").style.flexShrink == 1, "text shrinks and wraps");
  expect(!kindLayout("module:Slider").measured, "a module's view is sized by its style");
  expect(kindLayout("module:Slider").style.flexShrink == 0, "a module's view never squashes");

  Style style = row;
  setByName(style, row, "alignItems", std::string("stretch"));
  expect(style.alignItems == AlignItems{AlignItems::Stretch}, "alignItems sets the alignment");
  setByName(style, row, "alignItems", std::string("safe center"));
  expect(style.alignItems == AlignItems{AlignItems::Center, Safety::Safe}, "alignment takes safe and unsafe");
  setByName(style, row, "alignItems", std::monostate{});
  expect(style.alignItems == AlignItems{AlignItems::Center}, "null alignItems restores the kind default");
  setByName(style, row, "width", 12.0);
  expect(style.size.width == Dimension::points(12), "width sets the width");
  setByName(style, row, "width", std::string("24"));
  expect(style.size.width == Dimension::points(24), "numeric strings are numbers");
  setByName(style, row, "width", std::string("50%"));
  expect(style.size.width == Dimension::percent(0.5f), "percentages are fractions");
  setByName(style, row, "width", std::string("fit-content(120)"));
  expect(style.size.width == Dimension{Dimension::FitContentPoints, 120}, "sizing keywords");
  setByName(style, row, "width", std::monostate{});
  expect(style.size.width.isAuto(), "null width is automatic");
  setByName(style, row, "padding", 8.0);
  expect(style.padding.left.value == 8 && style.padding.bottom.value == 8, "padding sets every side");
  setByName(style, row, "paddingTop", 2.0);
  expect(style.padding.top.value == 2 && style.padding.left.value == 8, "paddingTop sets one side");
  setByName(style, row, "marginLeft", std::string("auto"));
  expect(style.margin.left.isAuto(), "margins take auto");
  setByName(style, row, "flex", 2.0);
  expect(style.flexGrow == 2 && style.flexShrink == 1 && style.flexBasis == Dimension::points(0),
         "flex: n grows from a zero basis, as in React Native");

  expect(isLayoutProperty(kuito::PropKey::Gap) && isLayoutProperty(kuito::PropKey::Position) &&
             !isLayoutProperty(kuito::PropKey::Opacity),
         "the engine knows its props by key");

  bool threw = false;
  try { setByName(style, row, "alignItems", std::string("diagonal")); }
  catch (const std::invalid_argument& error) { threw = std::string(error.what()).find("alignItems") != std::string::npos; }
  expect(threw, "invalid values throw and name the prop");

  threw = false;
  try { setByName(style, row, "flexGrow", -1.0); }
  catch (const std::invalid_argument&) { threw = true; }
  expect(threw, "negative flex factors throw");

  threw = false;
  try { kindLayout("Mystery"); }
  catch (const std::invalid_argument&) { threw = true; }
  expect(threw, "unknown kinds throw");
}

// position: absolute is placed against its parent, as in React Native.
static void absoluteChildrenPlaceAgainstTheirParent() {
  Tree t;
  Node& card = t.make("VStack");
  set(card, "padding", 10.0);
  set(card, "height", 200.0);
  t.fixed(card, 50, 50);
  Node& badge = t.fixed(card, 20, 20);
  set(badge, "position", std::string("absolute"));
  set(badge, "top", 8.0);
  set(badge, "right", 8.0);
  Node& overlay = t.make("Box", &card);
  set(overlay, "position", std::string("absolute"));
  set(overlay, "left", 0.0);
  set(overlay, "right", 0.0);
  set(overlay, "bottom", 0.0);
  set(overlay, "height", std::string("50%"));

  card.calculate(300, std::nullopt);

  near(badge.layout().x, 272, "right inset from the parent's edge");
  near(badge.layout().y, 8, "top inset from the parent's edge, ignoring padding");
  near(overlay.layout().width, 300, "left and right stretch across");
  near(overlay.layout().y, 100, "bottom-anchored with a percentage height");
  near(card.layout().height, 200, "absolute children take no space in the flow");
}

static void flexGrowShrinkAndBasisShareTheMainAxis() {
  Tree t;
  Node& row = t.make("HStack");
  Node& one = t.make("Box", &row);
  set(one, "flex", 1.0);
  Node& two = t.make("Box", &row);
  set(two, "flex", 2.0);
  Node& fixed = t.fixed(row, 60, 10);

  row.calculate(300, std::nullopt);

  near(one.layout().width, 80, "flex: 1 takes a third of the free space");
  near(two.layout().width, 160, "flex: 2 takes two thirds");
  near(fixed.layout().x, 240, "a fixed item follows");
}

static void wrappingRowsBreakIntoLines() {
  Tree t;
  Node& row = t.make("HStack");
  set(row, "flexWrap", std::string("wrap"));
  set(row, "alignItems", std::string("flex-start"));
  set(row, "rowGap", 4.0);
  set(row, "columnGap", 10.0);
  for (int i = 0; i < 5; ++i) t.fixed(row, 60, 20);

  row.calculate(200, std::nullopt);

  near(row.children()[2]->layout().x, 140, "three items fit the first line");
  near(row.children()[3]->layout().y, 24, "the fourth starts the second line after the row gap");
  near(row.layout().height, 44, "the row wraps both lines");
}

static void autoMarginsCenterAnItem() {
  Tree t;
  Node& stack = t.make("VStack");
  set(stack, "height", 100.0);
  Node& item = t.fixed(stack, 40, 20);
  set(item, "margin", std::string("auto"));

  stack.calculate(200, std::nullopt);

  near(item.layout().x, 80, "auto margins center across");
  near(item.layout().y, 40, "and along the main axis");
}

static void rightToLeftRowsStartOnTheRight() {
  Tree t;
  Node& row = t.make("HStack");
  set(row, "direction", std::string("rtl"));
  Node& first = t.fixed(row, 50, 10);

  row.calculate(200, std::nullopt);

  near(first.layout().x, 150, "the first item sits at the right edge");
}

// direction inherits, as CSS's does: a row inside a right-to-left column
// starts on the right without a direction of its own.
static void directionInheritsDownTheTree() {
  Tree t;
  Node& root = t.make("VStack");
  set(root, "direction", std::string("rtl"));
  Node& row = t.make("HStack", &root);
  Node& first = t.fixed(row, 50, 10);
  Node& ltr = t.make("HStack", &root);
  set(ltr, "direction", std::string("ltr"));
  Node& kept = t.fixed(ltr, 50, 10);

  root.calculate(200, std::nullopt);

  near(first.layout().x, 150, "an inheriting row starts on the right");
  near(kept.layout().x, 0, "a direction of its own wins over the inherited one");

  reset(ltr, "HStack", "direction");
  root.calculate(200, std::nullopt);
  near(kept.layout().x, 150, "a null direction inherits again");

  set(root, "direction", std::string("ltr"));
  root.calculate(200, std::nullopt);
  near(first.layout().x, 0, "changing an ancestor's direction lays its descendants out again");
}

// The inline-start side is the left in ltr and the right in rtl; a logical
// side wins over the physical side it lands on.
static void logicalEdgesFollowTheDirection() {
  Tree t;
  Node& root = t.make("HStack");
  set(root, "paddingInlineStart", 10.0);
  set(root, "paddingLeft", 4.0);
  set(root, "paddingRight", 2.0);
  Node& item = t.fixed(root, 50, 10);
  set(item, "marginInlineEnd", 5.0);
  Node& next = t.fixed(root, 50, 10);
  Node& pinned = t.fixed(root, 20, 10);
  set(pinned, "position", std::string("absolute"));
  set(pinned, "insetInlineStart", 3.0);

  root.calculate(200, std::nullopt);
  near(item.layout().x, 10, "padding-inline-start pads the left in ltr, over padding-left");
  near(next.layout().x, 65, "margin-inline-end spaces the right in ltr");
  near(pinned.layout().x, 3, "inset-inline-start insets from the left in ltr");

  set(root, "direction", std::string("rtl"));
  root.calculate(200, std::nullopt);
  near(item.layout().x, 140, "padding-inline-start pads the right in rtl");
  near(next.layout().x, 85, "margin-inline-end spaces the left in rtl");
  near(pinned.layout().x, 177, "inset-inline-start insets from the right in rtl");
  near(root.layout().padding.left, 4, "padding-left still pads the side no logical side lands on");

  reset(root, "HStack", "paddingInlineStart");
  root.calculate(200, std::nullopt);
  near(item.layout().x, 148, "a null logical side gives the physical side back");
}

// A page lays out on its own, without a parent, and takes its direction
// from the view that hosts it.
static void pagesInheritTheirHostsDirection() {
  Tree t;
  Node& root = t.make("VStack");
  set(root, "direction", std::string("rtl"));
  Node& stack = t.make("NavigationStack", &root);
  Node& screen = t.make("NavigationScreen");
  screen.inheritFrom(&stack);
  Node& row = t.make("HStack", &screen);
  Node& first = t.fixed(row, 50, 10);

  root.calculate(200, 400);
  screen.calculate(200, 400);
  near(first.layout().x, 150, "a screen in a right-to-left stack lays out right to left");

  set(root, "direction", std::string("ltr"));
  expect(screen.dirty(), "an ancestor's new direction marks the page");
  screen.calculate(200, 400);
  near(first.layout().x, 0, "and the page follows it");

  screen.inheritFrom(nullptr);
  set(root, "direction", std::string("rtl"));
  screen.calculate(200, 400);
  near(first.layout().x, 0, "an unhosted page is left to right");
}

// The platform's inset (the safe area) adds to the view's own padding.
static void safeAreaInsetAddsToPadding() {
  Tree t;
  Node& screen = t.make("VStack");
  Node& safe = t.make("SafeArea", &screen);
  set(safe, "padding", 8.0);
  safe.style.extraPadding = {47, 0, 34, 0};
  Node& child = t.make("Box", &safe);
  set(child, "height", 20.0);

  screen.calculate(390, 844);

  near(child.layout().y, 55, "content starts below the top inset and padding");
  near(child.layout().x, 8, "edges without an inset keep their padding");
  near(child.layout().width, 374, "the inset narrows the content box only where set");
  near(safe.layout().height, 117, "auto height wraps content, padding and inset");
}

// Rotation keeps the tree: the next pass gets the new root size and the
// safe area's new insets, and text wraps again at the new width.
static void rotatingTheRootRelaysOutInPlace() {
  Tree t;
  Node& root = t.make("VStack");
  Node& safe = t.make("SafeArea", &root);
  set(safe, "flex", 1.0);
  safe.style.extraPadding = {47, 0, 34, 0};
  Node& label = t.text(safe, 600);
  Node& footer = t.fixed(safe, 10, 10);
  set(footer, "marginTop", std::string("auto"));

  root.calculate(390, 844);

  near(label.layout().height, 40, "portrait text wraps onto two lines");
  near(footer.layout().y, 800, "the footer sits above the bottom inset");

  safe.style.extraPadding = {0, 47, 21, 47};
  safe.markDirty();
  root.calculate(844, 390);

  near(safe.layout().width, 844, "the safe area takes the landscape width");
  near(label.layout().x, 47, "content clears the side inset");
  near(label.layout().width, 750, "content spans the width between the insets");
  near(label.layout().height, 20, "landscape text fits on one line");
  near(footer.layout().y, 359, "the footer moves to the new bottom");
}

// A sheet lays out like a Stack, as its own root.
static void bottomSheetLaysOutLikeAStack() {
  Tree t;
  Node& sheet = t.make("Sheet");
  set(sheet, "padding", 20.0);
  Node& row = t.fixed(sheet, 50, 30);

  sheet.calculate(390, std::nullopt);

  near(row.layout().y, 20, "content starts inside the padding");
  near(sheet.layout().height, 70, "a content-sized sheet wraps its children");
}


// Results persist across passes, as in Taffy: a pass over an unchanged
// tree asks the platform to measure nothing.
static void unchangedTreesReuseTheLastLayout() {
  Tree t;
  Node& root = t.make("VStack");
  Node& row = t.make("HStack", &root);
  int calls = 0;
  for (int i = 0; i < 2; ++i) {
    t.make("Text", &row).measure = [&calls](float, MeasureMode, float, MeasureMode) {
      ++calls;
      return Size{50, 20};
    };
  }

  root.calculate(320, 640);
  const int first = calls;
  root.calculate(320, 640);

  expect(first > 0, "the first pass measures");
  expect(calls == first, "an unchanged tree is not measured again (" + std::to_string(calls - first) + " calls)");
  near(row.layout().width, 320, "the reused layout is the last one");

  root.calculate(200, 640);

  near(row.layout().width, 200, "another viewport lays out again");
}

// A new text among a hundred labels measures that label alone: its siblings
// keep their measurements though the column around them lays out again.
static void aChangedLabelAloneIsMeasuredAgain() {
  Tree t;
  Node& root = t.make("VStack");
  std::vector<float> lengths(100, 120);
  std::vector<int> calls(100, 0);
  std::vector<Node*> labels;
  for (std::size_t i = 0; i < lengths.size(); ++i) {
    Node& label = t.make("Text", &root);
    label.measure = [&lengths, &calls, i](float width, MeasureMode mode, float, MeasureMode) {
      ++calls[i];
      const float line = mode == MeasureMode::MinContent  ? 10.0f
                         : mode == MeasureMode::Undefined ? lengths[i]
                                                          : std::min(lengths[i], width);
      return Size{line, 20 * std::ceil(lengths[i] / line)};
    };
    labels.push_back(&label);
  }

  root.calculate(320, 4000);
  std::fill(calls.begin(), calls.end(), 0);
  lengths[50] = 400;
  labels[50]->markDirty();
  root.calculate(320, 4000);

  int others = 0;
  for (std::size_t i = 0; i < calls.size(); ++i)
    if (i != 50) others += calls[i];
  expect(calls[50] > 0, "the changed label is measured again");
  expect(others == 0, "no sibling is measured again (" + std::to_string(others) + " calls)");
  near(labels[50]->layout().height, 40, "the changed label wraps to its new length");
  near(labels[51]->layout().y, 50 * 20 + 40, "the labels below it move");
}

// The renderers ask a node whether a prop made it dirty.
static void nodesReportWhetherTheyAreDirty() {
  Tree t;
  Node& root = t.make("VStack");
  Node& label = t.text(root, 80);

  expect(label.dirty() && root.dirty(), "a node is dirty until its first layout");
  root.calculate(320, 640);
  expect(!label.dirty() && !root.dirty(), "a laid-out node is clean");
  label.markDirty();
  expect(label.dirty() && root.dirty(), "markDirty dirties the node and its ancestors");
}

// A leaf whose content changed is marked dirty: it and its ancestors lay
// out again while its siblings keep their measurements.
static void dirtyLeavesRelayoutWithoutTheirSiblings() {
  Tree t;
  Node& root = t.make("VStack");
  Node& row = t.make("HStack", &root);
  float titleWidth = 50;
  int noteCalls = 0;
  Node& title = t.make("Text", &row);
  title.measure = [&titleWidth](float, MeasureMode, float, MeasureMode) { return Size{titleWidth, 20}; };
  Node& note = t.make("Text", &row);
  note.measure = [&noteCalls](float, MeasureMode, float, MeasureMode) {
    ++noteCalls;
    return Size{40, 20};
  };

  root.calculate(320, 640);
  titleWidth = 120;
  root.calculate(320, 640);

  near(title.layout().width, 50, "a clean leaf keeps its measurement");

  noteCalls = 0;
  title.markDirty();
  root.calculate(320, 640);

  near(title.layout().width, 120, "a dirty leaf is measured again");
  near(note.layout().x, 120, "its siblings move");
  expect(noteCalls == 0, "its siblings are not measured again (" + std::to_string(noteCalls) + " calls)");
}

// One dirty leaf among many re-measures that leaf alone: marking it dirty
// clears its own measurements and its ancestors' layouts, never a
// sibling's measurements (React Native #59063).
static void siblingsKeepTheirMeasurements() {
  Tree t;
  Node& root = t.make("VStack");
  std::vector<int> calls(100, 0);
  std::vector<Node*> leaves;
  float changedHeight = 20;
  for (std::size_t i = 0; i < calls.size(); ++i) {
    Node& leaf = t.make("Text", &root);
    leaf.measure = [&calls, &changedHeight, i](float width, MeasureMode, float, MeasureMode) {
      ++calls[i];
      return Size{width, i == 0 ? changedHeight : 20};
    };
    leaves.push_back(&leaf);
  }

  root.calculate(320, std::nullopt);
  std::fill(calls.begin(), calls.end(), 0);
  changedHeight = 40;
  leaves.front()->markDirty();
  root.calculate(320, std::nullopt);

  int siblingCalls = 0;
  for (std::size_t i = 1; i < calls.size(); ++i) siblingCalls += calls[i];
  expect(calls.front() > 0, "the dirty leaf is measured again");
  expect(siblingCalls == 0, "its 99 siblings are not measured again (" + std::to_string(siblingCalls) + " calls)");
  near(leaves.back()->layout().y, 40 + 98 * 20, "its siblings move");
}

// A fixed-size box keeps its size when its owner resizes, but its
// percentage padding resolves against the owner's width, so the owner's
// width is part of the cache key as it is in Taffy's (Yoga #2042).
static void percentagePaddingFollowsTheOwnersWidth() {
  Tree t;
  Node& root = t.make("VStack");
  Node& owner = t.make("VStack", &root);
  set(owner, "width", 200.0);
  set(owner, "alignItems", std::string("flex-start"));
  Node& card = t.fixed(owner, 100, 100);
  set(card, "paddingLeft", std::string("10%"));
  Node& content = t.fixed(card, 10, 10);

  root.calculate(320, 640);
  near(card.layout().padding.left, 20, "percentage padding resolves against the owner");
  near(content.layout().x, 20, "and insets the content");

  set(owner, "width", 300.0);
  root.calculate(320, 640);

  near(card.layout().width, 100, "the box keeps its size");
  near(card.layout().padding.left, 30, "its padding follows the owner's new width");
  near(content.layout().x, 30, "and so does its content");
}

// Styles set through properties, insets and tree edits after a pass
// take effect in the next one.
static void styleAndTreeChangesRelayout() {
  Tree t;
  Node& stack = t.make("VStack");
  Node& first = t.fixed(stack, 10, 10);
  Node& second = t.fixed(stack, 10, 10);

  stack.calculate(100, std::nullopt);
  set(first, "height", 30.0);
  stack.calculate(100, std::nullopt);

  near(second.layout().y, 30, "a style change relays out the siblings");

  Node& inserted = t.make("Box");
  set(inserted, "height", 5.0);
  stack.insert(inserted, 0);
  stack.calculate(100, std::nullopt);

  near(first.layout().y, 5, "an inserted child pushes its siblings");

  stack.remove(inserted);
  stack.calculate(100, std::nullopt);

  near(first.layout().y, 0, "a removed child frees its space");

  stack.style.extraPadding = {12, 0, 0, 0};
  stack.markDirty();
  stack.calculate(100, std::nullopt);

  near(first.layout().y, 12, "an inset change relays out");
}

// A hidden subtree lays out as zeros, as in Taffy, but its leaves keep
// what the platform measured: showing a tab again measures no text.
static void shownAgainSubtreesReuseTheirMeasurements() {
  Tree t;
  Node& root = t.make("VStack");
  Node& screen = t.make("VStack", &root);
  int calls = 0;
  Node& title = t.make("Text", &screen);
  title.measure = [&calls](float, MeasureMode, float, MeasureMode) {
    ++calls;
    return Size{80, 20};
  };

  root.calculate(320, 640);
  set(screen, "hidden", 1.0);
  root.calculate(320, 640);

  near(title.layout().width, 0, "a hidden leaf has no size");

  const int before = calls;
  set(screen, "hidden", 0.0);
  root.calculate(320, 640);

  near(title.layout().height, 20, "a shown leaf is laid out again");
  near(title.layout().width, 320, "and stretched again");
  expect(calls == before, "a shown leaf is not measured again (" + std::to_string(calls - before) + " calls)");

  title.markDirty();
  root.calculate(320, 640);

  expect(calls > before, "a dirty leaf is measured again");
}

// A List is a scroll container the platform measures: its content (rows the
// engine never sees) may be far longer than the screen, yet it fills only
// the space its parent has left. Its min-content length is zero, so a
// flexible parent is not pushed to the rows' full length either.
static void listsFillTheSpaceTheirParentLeaves() {
  Tree t;
  Node& screen = t.make("VStack");
  Node& header = t.make("VStack", &screen);
  t.fixed(header, 10, 100);
  Node& list = t.make("List", &screen);
  list.measure = [](float width, MeasureMode, float, MeasureMode heightMode) {
    return Size{width, heightMode == MeasureMode::MinContent ? 0.0f : 100000};
  };

  screen.calculate(320, 600);

  expect(kindLayout("List").measured, "a list is measured by the platform");
  expect(kindLayout("HorizontalList").measured, "a horizontal list is measured by the platform");
  near(list.layout().y, 100, "the list follows a header, which keeps its content height");
  near(list.layout().height, 500, "and shrinks below its content to the space left");
  near(list.layout().width, 320, "it stretches across");
}

// A horizontal list in a page is as tall as the rows it has measured.
// CSS would size a flex: 1 column to the min-content of a scroll container's
// content; a list reports none.
static void listsInAFlexibleSafeArea() {
  Tree t;
  Node& screen = t.make("VStack");
  Node& safe = t.make("SafeArea", &screen);
  set(safe, "flex", 1.0);
  Node& bar = t.make("HStack", &safe);
  t.text(bar, 50);
  Node& list = t.make("List", &safe);
  list.measure = [](float width, MeasureMode, float, MeasureMode heightMode) {
    return Size{width, heightMode == MeasureMode::MinContent ? 0.0f : 1000000};
  };

  screen.calculate(402, 874);

  near(list.layout().height, 854, "a list in a flexible column fills what is left");
}

static void horizontalListsTakeTheirRowsHeight() {
  Tree t;
  Node& root = t.make("VStack");
  Node& page = t.make("Scroll", &root);
  Node& rail = t.make("HorizontalList", &page);
  rail.measure = [](float, MeasureMode, float, MeasureMode) { return Size{3000, 180}; };
  Node& below = t.fixed(page, 10, 10);

  root.calculate(320, 600);

  near(rail.layout().width, 320, "the rail stretches across the page");
  near(rail.layout().height, 180, "the rail is as tall as its rows");
  near(below.layout().y, 180, "content after the rail follows it");
}

// Each row is a layout root of its own: a column as wide as the list.
static void listCellsAreColumnRoots() {
  Tree t;
  Node& cell = t.make("ListCell");
  t.fixed(cell, 50, 30);
  Node& label = t.text(cell, 500);

  cell.calculate(300, std::nullopt);

  near(label.layout().width, 300, "a row's children stretch across it");
  near(cell.layout().height, 70, "the row is as tall as its content");
}

// The cache keeps a bounded number of results per node, as Taffy's does: a
// viewport that changes on every pass (a resize, a keyboard) must not grow it.
static void resizedTreesKeepTheirCacheBounded() {
  Tree t;
  Node& root = t.make("VStack");
  Node& row = t.make("HStack", &root);
  t.text(row, 120);
  t.text(row, 80);

  auto pass = [&](int i) { root.calculate(200 + static_cast<float>(i), 640); };
  for (int i = 0; i < 50; ++i) pass(i);
  const std::size_t warm = liveBytes;
  for (int i = 50; i < 500; ++i) pass(i);
  const std::size_t after = liveBytes;

  expect(after <= warm, "500 resized passes keep the layout cache bounded (" + std::to_string(warm) +
                                " bytes after 50 passes, " + std::to_string(after) + " after 500)");
}

// A leaf asked more ways than its measurements hold forgets the oldest
// first: the newest answers stay, each under its own request. A pass asks
// a stretched text three ways, so 32 measurements hold the last ten.
static void measurementsForgetTheOldestFirst() {
  Tree t;
  Node& root = t.make("VStack");
  int calls = 0;
  Node& text = t.make("Text", &root);
  text.measure = [&calls](float width, MeasureMode, float, MeasureMode) {
    ++calls;
    return Size{width, 20 * std::ceil(1000 / width)};
  };
  auto pass = [&](int width) { root.calculate(static_cast<float>(width), 640); };

  for (int width = 100; width < 140; ++width) pass(width);
  calls = 0;
  for (int width = 139; width >= 130; --width) {
    pass(width);
    near(text.layout().height, 20 * std::ceil(1000.0f / static_cast<float>(width)),
         "the measurement at " + std::to_string(width) + " answers for it");
  }
  expect(calls == 0, "the last ten widths are not measured again (" + std::to_string(calls) + " calls)");

  pass(100);
  expect(calls > 0, "the oldest width is measured again");
  near(text.layout().height, 200, "and answered for itself");
}

// The engine and the manifest agree: each value an enum layout prop lists is
// one the engine takes, by its index.
static void everyManifestValueApplies() {
  for (std::size_t index = 0; index < kuito::kPropCount; ++index) {
    const auto key = static_cast<kuito::PropKey>(index);
    const kuito::PropInfo& info = kuito::propInfo(key);
    if (!isLayoutProperty(key) || info.kind != kuito::ValueKind::Enum) continue;
    for (std::size_t value = 0; value < info.valueCount; ++value) {
      Style style = kindLayout("Box").style;
      try {
        setLayoutProperty(style, kindLayout("Box").style, key, LayoutValue::choice(static_cast<std::int32_t>(value)));
      } catch (const std::exception& error) {
        expect(false, std::string(info.name) + " " + std::string(info.values[value]) + ": " + error.what());
      }
    }
  }
}

// A prop arrives by key with its value in place: setting one allocates
// nothing, whether a number, an enum's index or a length's text.
static void propsApplyWithoutAllocating() {
  const Style& defaults = kindLayout("HStack").style;
  Style style = defaults;
  const auto apply = [&] {
    setLayoutProperty(style, defaults, kuito::PropKey::Width, LayoutValue::length("100%"));
    setLayoutProperty(style, defaults, kuito::PropKey::Height, LayoutValue::of(48));
    setLayoutProperty(style, defaults, kuito::PropKey::MinWidth, LayoutValue::length("fit-content(12)"));
    setLayoutProperty(style, defaults, kuito::PropKey::MarginLeft, LayoutValue::length("auto"));
    setLayoutProperty(style, defaults, kuito::PropKey::AlignItems,
                      LayoutValue::choice(*kuito::enumValue(kuito::PropKey::AlignItems, "safe center")));
    setLayoutProperty(style, defaults, kuito::PropKey::FlexDirection,
                      LayoutValue::choice(*kuito::enumValue(kuito::PropKey::FlexDirection, "row-reverse")));
    setLayoutProperty(style, defaults, kuito::PropKey::Direction, LayoutValue::null());
  };
  // The first write of an enum prop reads its manifest values once.
  apply();
  const std::size_t before = allocations;
  for (int i = 0; i < 100; ++i) apply();
  expect(allocations == before, "100 rounds of seven props allocate " + std::to_string(allocations - before) + " times");
  expect(style.alignItems == AlignItems{AlignItems::Center, Safety::Safe}, "an enum's index finds its value");
}

// A key the engine has no setter for, the manifest's or not, is an error
// that names it; so is an enum's index out of its values, with the values.
static void unknownKeysAndIndexesThrow() {
  Style style = kindLayout("Box").style;
  const auto message = [&](kuito::PropKey key, const LayoutValue& value) {
    try {
      setLayoutProperty(style, kindLayout("Box").style, key, value);
    } catch (const std::invalid_argument& error) {
      return std::string(error.what());
    }
    return std::string("no error");
  };
  const std::string named = message(static_cast<kuito::PropKey>(0xffff), LayoutValue::of(1));
  expect(named.find("prop 65535 is not a layout property") != std::string::npos, named);
  const std::string opacity = message(kuito::PropKey::Opacity, LayoutValue::of(1));
  expect(opacity.find("opacity is not a layout property") != std::string::npos, opacity);
  const std::string position = message(kuito::PropKey::Position, LayoutValue::choice(7));
  expect(position.find("position expects one of relative, absolute by its index, got index 7") != std::string::npos,
         position);
}

int main() {
  stackKeepsExplicitWidthAndStretchesAutoChildren();
  rowLeavesLeftoverSpaceEmpty();
  justifyContentPlacesItemsOnTheMainAxis();
  alignItemsPlacesItemsOnTheCrossAxis();
  rowTextShrinksAndWraps();
  spacerTakesTheFreeSpace();
  scrollViewFillsItsParentAndScrollsItsContent();
  percentagesAlongAScrollViewsAxisResolveAgainstTheView();
  stacksDoNotShrinkBelowTheirContent();
  horizontalScrollInsideAVerticalScroll();
  horizontalRailsSizeFromUnshrunkItems();
  aspectRatioDerivesTheOtherSide();
  hiddenChildrenTakeNoSpace();
  minAndMaxClampSizes();
  autoWidthRowsTakeTheirContentWidth();
  fixedItemsShrinkLikeCss();
  aShrinkingFixedBoxFollowsItsContent();
  shrinkingItemsFreezeAtTheirMinimums();
  layoutRoundsToThePixelGrid();
  measuredLeavesKeepTheirPixels();
  deepTreesMeasureLinearly();
  removingAChildRelaysOutItsSiblings();
  kuitoPropertiesValidateAndReset();
  safeAreaInsetAddsToPadding();
  rotatingTheRootRelaysOutInPlace();
  bottomSheetLaysOutLikeAStack();
  absoluteChildrenPlaceAgainstTheirParent();
  flexGrowShrinkAndBasisShareTheMainAxis();
  wrappingRowsBreakIntoLines();
  autoMarginsCenterAnItem();
  rightToLeftRowsStartOnTheRight();
  directionInheritsDownTheTree();
  logicalEdgesFollowTheDirection();
  pagesInheritTheirHostsDirection();
  unchangedTreesReuseTheLastLayout();
  aChangedLabelAloneIsMeasuredAgain();
  nodesReportWhetherTheyAreDirty();
  dirtyLeavesRelayoutWithoutTheirSiblings();
  siblingsKeepTheirMeasurements();
  percentagePaddingFollowsTheOwnersWidth();
  styleAndTreeChangesRelayout();
  shownAgainSubtreesReuseTheirMeasurements();
  listsFillTheSpaceTheirParentLeaves();
  horizontalListsTakeTheirRowsHeight();
  listsInAFlexibleSafeArea();
  listCellsAreColumnRoots();
  resizedTreesKeepTheirCacheBounded();
  measurementsForgetTheOldestFirst();
  everyManifestValueApplies();
  propsApplyWithoutAllocating();
  unknownKeysAndIndexesThrow();

  if (failures) return 1;
  std::cout << "KUITO_FLEX_LAYOUT_PASS\n";
}
