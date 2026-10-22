// The layout tree: child dispatch with a cache kept until marked dirty, leaf measuring,
// hidden subtrees, the root box and pixel rounding.
//
// Ported from Taffy (https://github.com/DioxusLabs/taffy, src/compute/mod.rs,
// src/compute/leaf.rs, src/tree/cache.rs), MIT License, Copyright (c) 2018
// Visly Inc. and Taffy Authors. See LICENSE-taffy in this directory.
#include "Engine.h"
#include "Instruments.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <utility>
#include <vector>

namespace kuito::layout {

// A cached result, matched the way Taffy's cache matches it: a known
// dimension stands in for the available space in that axis, and a size
// computed for both axes serves a request for either.
struct Node::MeasureEntry {
  std::uint32_t width, height;
  MeasureMode widthMode, heightMode;
  Size size;
};

struct Node::CacheEntry {
  // The request it answered, kept whole so a relayout can ask again.
  LayoutInput input;
  LayoutOutput output;
};

// Taffy's Cache: one final layout and a fixed set of measurements, so its
// size never depends on how many different inputs a node has seen.
struct Node::Cache {
  static constexpr std::size_t kMeasureSlots = 9;

  std::optional<CacheEntry> finalLayout;
  std::array<std::optional<CacheEntry>, kMeasureSlots> measureEntries;
  // An entry was replaced since the last clear: what the parent read from
  // this node is no longer all here, so a relayout cannot stop at it.
  bool evicted = false;

  bool isEmpty() const {
    return !finalLayout && std::none_of(measureEntries.begin(), measureEntries.end(),
                                        [](const std::optional<CacheEntry>& entry) { return entry.has_value(); });
  }

  void clear() {
    finalLayout.reset();
    for (std::optional<CacheEntry>& entry : measureEntries) entry.reset();
    evicted = false;
  }
};

namespace {

constexpr float kInfinity = std::numeric_limits<float>::infinity();

std::uint32_t bits(float value) {
  std::uint32_t out;
  std::memcpy(&out, &value, sizeof out);
  return out;
}

std::uint32_t spaceKey(Opt known, AvailableSpace space) {
  if (known) return bits(*known);
  switch (space.kind) {
  case AvailableSpace::Definite: return bits(-space.value);
  case AvailableSpace::MinContent: return bits(-kInfinity);
  case AvailableSpace::MaxContent: return bits(kInfinity);
  }
  return 0;
}

std::uint64_t spaceKey(const LayoutInput& in) {
  return std::uint64_t(spaceKey(in.knownDimensions.width, in.availableSpace.width)) << 32 |
         spaceKey(in.knownDimensions.height, in.availableSpace.height);
}

Size2<bool> definiteKey(const LayoutInput& in) {
  return {in.knownDimensionsAreDefinite.width || !in.knownDimensions.width,
          in.knownDimensionsAreDefinite.height || !in.knownDimensions.height};
}

std::uint32_t optionKey(Opt value) { return value ? bits(*value) : bits(kInfinity); }

// Taffy's compute_cache_slot: which measurement slot a set of known
// dimensions and available space uses.
std::size_t cacheSlot(OptSize known, SpaceSize available) {
  const bool hasKnownWidth = known.width.has_value();
  const bool hasKnownHeight = known.height.has_value();

  // Slot 0: Both known_dimensions were set
  if (hasKnownWidth && hasKnownHeight) return 0;

  // Slot 1: width but not height known_dimension was set and the other dimension was either a MaxContent or Definite available space constraint
  // Slot 2: width but not height known_dimension was set and the other dimension was a MinContent constraint
  if (hasKnownWidth && !hasKnownHeight) return 1 + (available.height.kind == AvailableSpace::MinContent);

  // Slot 3: height but not width known_dimension was set and the other dimension was either a MaxContent or Definite available space constraint
  // Slot 4: height but not width known_dimension was set and the other dimension was a MinContent constraint
  if (hasKnownHeight && !hasKnownWidth) return 3 + (available.width.kind == AvailableSpace::MinContent);

  // Slots 5-8: Neither known_dimensions were set and:
  // Slot 5: x-axis available space is MaxContent or Definite and y-axis available space is MaxContent or Definite
  // Slot 6: x-axis available space is MaxContent or Definite and y-axis available space is MinContent
  // Slot 7: x-axis available space is MinContent and y-axis available space is MaxContent or Definite
  // Slot 8: x-axis available space is MinContent and y-axis available space is MinContent
  const bool minWidth = available.width.kind == AvailableSpace::MinContent;
  const bool minHeight = available.height.kind == AvailableSpace::MinContent;
  return 5 + (minWidth ? 2 : 0) + (minHeight ? 1 : 0);
}

// Half up, as Taffy rounds: -0.5 becomes 0, not -1.
float roundTo(float value, float scale) { return std::floor(value * scale + 0.5f) / scale; }

// Rounds edges, not sizes, so neighbours never gap or overlap. Kuito: a
// leaf the platform measured keeps its size rounded on its own when its
// edges would take a pixel off it, as Yoga rounds text. Its measured size is
// whole pixels, but in floats it can fall a hair short of one, and a Text a
// pixel narrower than its line wraps its last word. Its far edge may then
// overlap a neighbour by that pixel.
Layout rounded(const Layout& in, float scale, float cumulativeX, float cumulativeY, bool measured) {
  const float x = cumulativeX + in.x;
  const float y = cumulativeY + in.y;
  Layout out = in;
  out.x = roundTo(x, scale) - roundTo(cumulativeX, scale);
  out.y = roundTo(y, scale) - roundTo(cumulativeY, scale);
  out.width = roundTo(x + in.width, scale) - roundTo(x, scale);
  out.height = roundTo(y + in.height, scale) - roundTo(y, scale);
  if (measured) {
    out.width = std::max(out.width, roundTo(in.width, scale));
    out.height = std::max(out.height, roundTo(in.height, scale));
  }
  out.content = {roundTo(in.content.width, scale), roundTo(in.content.height, scale)};
  return out;
}

} // namespace

// --- Tree -----------------------------------------------------------------

LayoutCost& layoutCost() {
  static LayoutCost cost;
  return cost;
}

Node::Node() : cache_(std::make_unique<Cache>()) {}

Node::~Node() {
  if (parent_) parent_->remove(*this);
  for (Node* child : children_) child->parent_ = nullptr;
  inheritFrom(nullptr);
  for (Node* page : hosted_) page->host_ = nullptr;
}

void Node::inheritFrom(Node* host) {
  if (host == host_) return;
  if (host_) host_->hosted_.erase(std::find(host_->hosted_.begin(), host_->hosted_.end(), this));
  host_ = host;
  if (host_) host_->hosted_.push_back(this);
  inheritDirection();
}

void Node::inheritDirection() {
  const Node* from = parent_ ? parent_ : host_;
  const Direction direction = style.ownDirection.value_or(from ? from->style.direction : Direction::Ltr);
  if (direction == style.direction) return;
  style.direction = direction;
  clearCaches(false);
  for (Node* child : children_) child->inheritDirection();
  for (Node* page : hosted_) page->inheritDirection();
}

namespace {
// Whether the node's border box ignores its content: a points width and
// height, and no automatic minimum that content can lower. A flex item's
// automatic minimum along its parent's main axis is the smaller of its size
// and its content's (CSS Flexbox 4.5), so a box that can shrink still follows
// its content unless that minimum is set or it does not overflow visibly.
bool ignoresContent(const Style& style, const Node* parent) {
  if (style.size.width.kind != Dimension::Points || style.size.height.kind != Dimension::Points) return false;
  if (!parent || style.position == Position::Absolute || style.flexShrink == 0) return true;

  const bool row = isRow(parent->style.flexDirection);
  const Dimension& minimum = row ? style.minSize.width : style.minSize.height;
  const Overflow overflow = row ? style.overflow.x : style.overflow.y;
  return minimum.kind == Dimension::Points || overflow != Overflow::Visible;
}
} // namespace

void Node::clearCaches(bool contained) {
#if KUITO_INSTRUMENTS
  if (!measured_.empty()) forgotten_.swap(measured_);
#endif
  measured_.clear();
  measuredOldest_ = 0;
  for (Node* node = this; node; node = node->parent_) {
    node->cache_->clear();
    // Kuito, not Taffy. A box whose border size ignores what it measures
    // keeps the caches above it valid.
    if (contained && ignoresContent(node->style, node->parent_)) break;
  }
}

void Node::insert(Node& child, std::size_t index) {
  if (&child == this) throw std::invalid_argument("A node cannot contain itself");
  for (Node* ancestor = parent_; ancestor; ancestor = ancestor->parent_)
    if (ancestor == &child) throw std::invalid_argument("A node cannot contain its ancestor");
  if (child.parent_) child.parent_->remove(child);
  child.parent_ = this;
  children_.insert(children_.begin() + static_cast<std::ptrdiff_t>(std::min(index, children_.size())), &child);
  child.inheritDirection();
  markDirty();
}

void Node::remove(Node& child) {
  const auto found = std::find(children_.begin(), children_.end(), &child);
  if (found == children_.end()) return;
  children_.erase(found);
  child.parent_ = nullptr;
  markDirty();
}

void Node::markDirty() {
  inheritDirection();
  clearCaches(false);
}

void Node::markContentDirty() {
  inheritDirection();
  clearCaches(true);
}

bool Node::dirty() const noexcept { return cache_->isEmpty(); }

// --- Dispatch and cache ---------------------------------------------------

LayoutOutput Engine::computeChildLayout(Node& node, const LayoutInput& input) {
  if (input.runMode == RunMode::PerformHiddenLayout) return computeHiddenLayout(node);

  const std::uint64_t space = spaceKey(input);
  const Size2<bool> definite = definiteKey(input);
  const std::uint32_t parentWidth = optionKey(input.parentSize.width);
  const auto matches = [&](const Node::CacheEntry& entry) {
    const LayoutInput& in = entry.input;
    return in.runMode == input.runMode && in.sizingMode == input.sizingMode && spaceKey(in) == space &&
           definiteKey(in) == definite && optionKey(in.parentSize.width) == parentWidth;
  };
  Node::Cache& cache = *node.cache_;
  if (input.runMode == RunMode::PerformLayout) {
    const std::optional<Node::CacheEntry>& entry = cache.finalLayout;
    if (entry && matches(*entry) && entry->input.parentSize.height == input.parentSize.height &&
        entry->input.axis == input.axis)
      return entry->output;
  } else {
    for (const std::optional<Node::CacheEntry>& entry : cache.measureEntries) {
      if (!entry || !matches(*entry) || (entry->input.axis != RequestedAxis::Both && entry->input.axis != input.axis))
        continue;
      LayoutOutput sized;
      sized.size = entry->output.size;
      sized.contentSize = entry->output.size;
      return sized;
    }
  }

#if KUITO_INSTRUMENTS
  ++layoutCost().nodesLaidOut; // Kuito's, not Taffy's
#endif
  LayoutOutput output;
  if (node.style.display == Display::None) output = computeHiddenLayout(node);
  else if (node.children_.empty()) output = computeLeafLayout(node, input);
  else output = computeFlexboxLayout(node, input);

  std::optional<Node::CacheEntry>& slot =
      input.runMode == RunMode::PerformLayout
          ? cache.finalLayout
          : cache.measureEntries[cacheSlot(input.knownDimensions, input.availableSpace)];
  cache.evicted = cache.evicted || slot.has_value();
  slot = Node::CacheEntry{input, output};
  return output;
}

float Engine::measureChildSize(Node& node, OptSize known, OptSize parentSize, SpaceSize available, SizingMode mode,
                               bool horizontal) {
  LayoutInput input;
  input.runMode = RunMode::ComputeSize;
  input.sizingMode = mode;
  input.axis = horizontal ? RequestedAxis::Horizontal : RequestedAxis::Vertical;
  input.knownDimensions = known;
  input.parentSize = parentSize;
  input.availableSpace = available;
  const Size size = computeChildLayout(node, input).size;
  return horizontal ? size.width : size.height;
}

Size Engine::measureChildSizeBoth(Node& node, OptSize known, OptSize parentSize, SpaceSize available, SizingMode mode) {
  LayoutInput input;
  input.runMode = RunMode::ComputeSize;
  input.sizingMode = mode;
  input.axis = RequestedAxis::Both;
  input.knownDimensions = known;
  input.parentSize = parentSize;
  input.availableSpace = available;
  return computeChildLayout(node, input).size;
}

void Engine::setUnroundedLayout(Node& node, const Layout& layout) { node.unrounded_ = layout; }

LayoutOutput Engine::computeHiddenLayout(Node& node) {
  node.cache_->clear();
  node.unrounded_ = Layout{};
  LayoutInput hidden;
  hidden.runMode = RunMode::PerformHiddenLayout;
  for (Node* child : node.children_) computeChildLayout(*child, hidden);
  return {};
}

// --- Leaves ---------------------------------------------------------------

namespace {

MeasureMode modeOf(AvailableSpace space) {
  switch (space.kind) {
  case AvailableSpace::Definite: return MeasureMode::AtMost;
  case AvailableSpace::MinContent: return MeasureMode::MinContent;
  case AvailableSpace::MaxContent: return MeasureMode::Undefined;
  }
  return MeasureMode::Undefined;
}

} // namespace

// The platform measures content: a known side is the border box minus the
// padding and border it draws inside.
Size Engine::measureLeaf(Node& node, OptSize known, SpaceSize available, Size inset) {
  if (known.width && known.height) return {*known.width, *known.height};
  if (!node.measure) return {known.width.value_or(0), known.height.value_or(0)};

  const float width = known.width ? fmax(*known.width - inset.width, 0.0f) : available.width.value;
  const float height = known.height ? fmax(*known.height - inset.height, 0.0f) : available.height.value;
  const MeasureMode widthMode = known.width ? MeasureMode::Exactly : modeOf(available.width);
  const MeasureMode heightMode = known.height ? MeasureMode::Exactly : modeOf(available.height);
  const Node::MeasureEntry key{bits(width), bits(height), widthMode, heightMode, {}};

  const auto found = std::find_if(node.measured_.begin(), node.measured_.end(), [&](const Node::MeasureEntry& e) {
    return e.width == key.width && e.height == key.height && e.widthMode == key.widthMode &&
           e.heightMode == key.heightMode;
  });
  Size measured;
  if (found != node.measured_.end()) {
    measured = found->size;
  } else {
    measured = node.measure(width, widthMode, height, heightMode);
#if KUITO_INSTRUMENTS
    // Kuito's, not Taffy's: a measure that gives the answer the node gave
    // before it was marked dirty was work that changed nothing.
    ++layoutCost().measureCalls;
    if (std::any_of(node.forgotten_.begin(), node.forgotten_.end(), [&](const Node::MeasureEntry& e) {
          return e.width == key.width && e.height == key.height && e.widthMode == key.widthMode &&
                 e.heightMode == key.heightMode && e.size == measured;
        }))
      ++layoutCost().wastedMeasures;
#endif
    // A text in a shrinking row is asked about ten different ways in one
    // pass; fewer entries than that evict each other and every pass misses.
    // The bound only matters for a container whose width keeps changing.
    constexpr std::size_t kMeasured = 32;
    const Node::MeasureEntry entry{key.width, key.height, widthMode, heightMode, measured};
    if (node.measured_.size() < kMeasured) {
      if (node.measured_.empty()) node.measured_.reserve(kMeasured);
      node.measured_.push_back(entry);
    } else {
      node.measured_[node.measuredOldest_] = entry;
      node.measuredOldest_ = (node.measuredOldest_ + 1) % kMeasured;
    }
  }
  return {known.width.value_or(measured.width), known.height.value_or(measured.height)};
}

LayoutOutput Engine::computeLeafLayout(Node& node, const LayoutInput& input) {
  const Style& style = node.style;
  const Edges padding = resolvePadding(style, input.parentSize.width);
  const Edges border = resolveBorder(style, input.parentSize.width);
  const Edges paddingBorder = padding + border;
  const Size adjustment = boxSizingAdjustment(style, padding, border);
  node.contentInset_ = paddingBorder;

  OptSize nodeSize = input.knownDimensions;
  OptSize minSize, maxSize;
  Opt aspectRatio;
  if (input.sizingMode == SizingMode::InherentSize) {
    aspectRatio = style.aspectRatio;
    const OptSize styleSize =
        maybeAdd(applyAspectRatio(resolveSize(style.size, input.parentSize), aspectRatio), adjustment);
    minSize = maybeAdd(applyAspectRatio(resolveSize(style.minSize, input.parentSize), aspectRatio), adjustment);
    maxSize = maybeAdd(resolveSize(style.maxSize, input.parentSize), adjustment);
    nodeSize = orElse(input.knownDimensions, styleSize);
  }

  // A scroll container reserves its scrollbars' gutter on the far sides.
  const Point2<float> gutter{style.overflow.y == Overflow::Scroll ? style.scrollbarWidth : 0.0f,
                             style.overflow.x == Overflow::Scroll ? style.scrollbarWidth : 0.0f};
  Edges contentInset = paddingBorder;
  contentInset.right += gutter.x;
  contentInset.bottom += gutter.y;

  if (input.runMode == RunMode::ComputeSize && nodeSize.width && nodeSize.height) {
    LayoutOutput output;
    output.size =
        maybeMax(maybeClamp(Size{*nodeSize.width, *nodeSize.height}, minSize, maxSize), some(paddingBorder.sums()));
    output.contentSize = output.size;
    return output;
  }

  const auto space = [&](Opt known, AvailableSpace available, Opt styled, Opt min, Opt max, float inset) {
    AvailableSpace s = known ? AvailableSpace::definite(*known) : available;
    s = s.maybeSet(known).maybeSet(styled);
    return s.mapDefinite([&](float size) { return maybeClamp(size, min, max) - inset; });
  };
  const SpaceSize available{
      space(input.knownDimensions.width, input.availableSpace.width, nodeSize.width, minSize.width, maxSize.width,
            contentInset.horizontal()),
      space(input.knownDimensions.height, input.availableSpace.height, nodeSize.height, minSize.height, maxSize.height,
            contentInset.vertical()),
  };

  const OptSize measureKnown = input.runMode == RunMode::ComputeSize ? input.knownDimensions : OptSize{};
  const Size measured = measureLeaf(node, measureKnown, available, paddingBorder.sums());
  const Size clamped =
      maybeClamp(unwrapOr(orElse(input.knownDimensions, nodeSize),
                          {measured.width + contentInset.horizontal(), measured.height + contentInset.vertical()}),
                 minSize, maxSize);
  Size size{clamped.width, fmax(clamped.height, aspectRatio ? clamped.width / *aspectRatio : 0.0f)};
  size = maybeMax(size, some(paddingBorder.sums()));

  LayoutOutput output;
  output.size = size;
  output.contentSize = size;
  return output;
}

// --- Roots and rounding ---------------------------------------------------

namespace {

void layoutRoot(Node& root, SpaceSize available, OptSize known, float scale) {
  const Style& style = root.style;
  const Edges margin = resolveMarginOrZero(style, available.width.option());

  LayoutInput input;
  input.runMode = RunMode::PerformLayout;
  input.sizingMode = SizingMode::InherentSize;
  input.knownDimensions = known;
  input.parentSize = options(available);
  input.availableSpace = {available.width.maybeSub(margin.horizontal()).maybeMax(0.0f),
                          available.height.maybeSub(margin.vertical()).maybeMax(0.0f)};

  const LayoutOutput output = Engine::computeChildLayout(root, input);
  const bool rtl = style.direction == Direction::Rtl;

  Layout layout;
  layout.x =
      rtl && available.width.isDefinite() ? available.width.value - output.size.width - margin.right : margin.left;
  layout.y = margin.top;
  if (style.position == Position::Relative) {
    const OptSize icb = options(available);
    const Rect<LengthPercentageAuto> inset = style.insetSides();
    const Opt left = inset.left.resolve(icb.width), right = inset.right.resolve(icb.width);
    const Opt top = inset.top.resolve(icb.height), bottom = inset.bottom.resolve(icb.height);
    layout.x += rtl ? (right ? -*right : left.value_or(0)) : (left ? *left : (right ? -*right : 0));
    layout.y += top ? *top : (bottom ? -*bottom : 0);
  }
  layout.width = output.size.width;
  layout.height = output.size.height;
  layout.content = output.contentSize;
  layout.padding = resolvePadding(style, available.width.option());
  layout.border = resolveBorder(style, available.width.option());
  Engine::setUnroundedLayout(root, layout);
  Engine::roundLayout(root, scale, 0, 0);
}

} // namespace

void Engine::roundLayout(Node& node, float scale, float cumulativeX, float cumulativeY) {
  node.final_ = scale > 0 ? rounded(node.unrounded_, scale, cumulativeX, cumulativeY, static_cast<bool>(node.measure))
                          : node.unrounded_;
  for (Node* child : node.children_)
    roundLayout(*child, scale, cumulativeX + node.unrounded_.x, cumulativeY + node.unrounded_.y);
}

// A node that left its parent keeps its direction until it is inserted again
// or lays out on its own: a move (a removal, then an insert) walks nothing.
void Node::calculate(std::optional<float> width, std::optional<float> height, float pointScale) {
  inheritDirection();
  pointScale_ = pointScale;
  layoutRoot(*this, {AvailableSpace::from(width), AvailableSpace::from(height)}, {width, height}, pointScale);
}

void Node::calculateRoot(AvailableSpace width, AvailableSpace height, float pointScale) {
  inheritDirection();
  pointScale_ = pointScale;
  layoutRoot(*this, {width, height}, {}, pointScale);
}

// --- Partial layout (Kuito's, not Taffy's) --------------------------------

namespace {

bool sameOutput(const LayoutOutput& a, const LayoutOutput& b) {
  return a.size == b.size && a.contentSize == b.contentSize && a.firstBaseline == b.firstBaseline;
}

} // namespace

// The parent of a node read nothing but the node's answers to its requests,
// all of them in the node's cache unless one was evicted. When the node gives
// each of those requests the same answer after the change, the parent would
// lay out exactly as before, and so would every node above it: their caches
// stay, and only the node's subtree lays out again. The final layout is asked
// last, as in a full pass, so a leaf keeps the inset of its final layout.
Node* Node::relayout() {
  std::vector<std::pair<Node*, Cache>> before;
  for (Node* node = parent_; node; node = node->parent_) before.emplace_back(node, *node->cache_);
  markDirty();

  for (std::size_t i = 0; i < before.size(); ++i) {
    Node& node = *before[i].first;
    const Cache& was = before[i].second;
    if (!node.parent_) break;
    if (was.evicted || !was.finalLayout) continue;

    const auto answers = [&node](const std::optional<CacheEntry>& entry) {
      return !entry || sameOutput(Engine::computeChildLayout(node, entry->input), entry->output);
    };
    if (!std::all_of(was.measureEntries.begin(), was.measureEntries.end(), answers) || !answers(was.finalLayout))
      continue;

    for (std::size_t above = i + 1; above < before.size(); ++above) *before[above].first->cache_ = before[above].second;
    float x = 0, y = 0;
    Node* root = &node;
    for (Node* ancestor = node.parent_; ancestor; ancestor = ancestor->parent_) {
      x += ancestor->unrounded_.x;
      y += ancestor->unrounded_.y;
      root = ancestor;
    }
    Engine::roundLayout(node, root->pointScale_, x, y);
    return &node;
  }
  return nullptr;
}

} // namespace kuito::layout
