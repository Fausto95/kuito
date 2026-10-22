// The CSS flexbox layout algorithm (https://www.w3.org/TR/css-flexbox-1/#layout-algorithm).
//
// A C++ port of Taffy's flexbox implementation (https://github.com/DioxusLabs/taffy,
// src/compute/flexbox.rs at e82f526), MIT License, Copyright (c) 2018 Visly Inc.
// and Taffy Authors. See LICENSE-taffy in this directory. The structure, step
// numbers and comments follow Taffy so the two can be compared side by side;
// absolutely positioned children are laid out here, by their parent, rather
// than hoisted to a containing block (see Absolute.h).
#include "Absolute.h"
#include "Alignment.h"
#include "Balance.h"
#include "SizingKeyword.h"
#include <algorithm>
#include <limits>
#include <vector>

namespace kuito::layout {
namespace {

constexpr float kInfinity = std::numeric_limits<float>::infinity();

// --- Axes -------------------------------------------------------------------

template <typename T>
T mainOf(const Size2<T>& s, FlexDirection d) {
  return isRow(d) ? s.width : s.height;
}
template <typename T>
T crossOf(const Size2<T>& s, FlexDirection d) {
  return isRow(d) ? s.height : s.width;
}
template <typename T>
void setMain(Size2<T>& s, FlexDirection d, T v) {
  (isRow(d) ? s.width : s.height) = v;
}
template <typename T>
void setCross(Size2<T>& s, FlexDirection d, T v) {
  (isRow(d) ? s.height : s.width) = v;
}
template <typename T>
Size2<T> withMain(Size2<T> s, FlexDirection d, T v) {
  setMain(s, d, v);
  return s;
}
template <typename T>
Size2<T> withCross(Size2<T> s, FlexDirection d, T v) {
  setCross(s, d, v);
  return s;
}

template <typename T>
T mainStart(const Rect<T>& r, FlexDirection d) {
  return isRow(d) ? r.left : r.top;
}
template <typename T>
T mainEnd(const Rect<T>& r, FlexDirection d) {
  return isRow(d) ? r.right : r.bottom;
}
template <typename T>
T crossStart(const Rect<T>& r, FlexDirection d) {
  return isRow(d) ? r.top : r.left;
}
template <typename T>
T crossEnd(const Rect<T>& r, FlexDirection d) {
  return isRow(d) ? r.bottom : r.right;
}
inline float mainSum(const Edges& r, FlexDirection d) { return isRow(d) ? r.horizontal() : r.vertical(); }
inline float crossSum(const Edges& r, FlexDirection d) { return isRow(d) ? r.vertical() : r.horizontal(); }

float sumAxisGaps(float gap, std::size_t count) { return count <= 1 ? 0 : gap * static_cast<float>(count - 1); }

// `normal` behaves as `stretch` for flex items.
AlignItems resolveNormal(AlignItems a) { return a.keyword == AlignItems::Normal ? AlignItems{AlignItems::Stretch} : a; }

// --- Items, lines and constants --------------------------------------------

struct FlexItem {
  Node* node = nullptr;
  std::size_t order = 0;

  OptSize size;
  Size2<Dimension> sizeStyle;
  OptSize minSize;
  OptSize maxSize;
  Opt aspectRatio;
  AlignItems alignSelf;

  Point2<Overflow> overflow{Overflow::Visible, Overflow::Visible};
  float scrollbarWidth = 0;
  float flexShrink = 0;
  float flexGrow = 0;
  bool flexBasisIsDefinite = false;

  float resolvedMinimumMainSize = 0;
  Size relativeInset;
  Edges margin;
  Rect<bool> marginIsAuto;
  Edges padding;
  Edges border;

  float flexBasis = 0;
  float innerFlexBasis = 0;
  float violation = 0;
  bool frozen = false;
  float contentFlexFraction = 0;

  Size hypotheticalInnerSize;
  Size hypotheticalOuterSize;
  Size targetSize;
  Size outerTargetSize;

  float baseline = 0;
  float offsetMain = 0;
  float offsetCross = 0;

  bool isScrollContainer() const { return isScrollContainer(overflow.x) || isScrollContainer(overflow.y); }

  bool isStretched(FlexDirection d) const {
    const Dimension cross = crossOf(sizeStyle, d);
    return !crossStart(marginIsAuto, d) && !crossEnd(marginIsAuto, d) &&
           (cross.isStretch() || (alignSelf.isStretch() && cross.isAuto()));
  }

  bool participatesInBaselineAlignment(FlexDirection d) const {
    return alignSelf.isBaseline() && !crossStart(marginIsAuto, d) && !crossEnd(marginIsAuto, d);
  }

private:
  static bool isScrollContainer(Overflow o) { return layout::isScrollContainer(o); }
};

struct FlexLine {
  FlexItem* begin;
  FlexItem* end;
  float crossSize = 0;
  float offsetCross = 0;

  std::size_t size() const { return static_cast<std::size_t>(end - begin); }
};

struct AlgoConstants {
  FlexDirection dir;
  Direction layoutDirection;
  bool isRow;
  bool isColumn;
  bool isWrap;
  bool isWrapReverse;
  bool isBalance;
  std::optional<std::uint16_t> lineCount;

  OptSize minSize;
  OptSize maxSize;
  Edges border;
  Edges contentBoxInset;
  Point scrollbarGutter;
  Size gap;
  AlignItems alignItems;
  AlignContent alignContent;
  AlignContent justifyContent;

  OptSize nodeOuterSize;
  OptSize nodeInnerSize;
  // What the items' percentages resolve against: the inner size where it is
  // definite. Kuito: a scroll view's content has no limit along its axis,
  // yet percentages there resolve against the view's own content box, as
  // CSS's do in a scroll container.
  OptSize percentBasis;
  bool knownMainSizeIsDefinite;
  bool hasDefiniteMainSize;
  bool hasDefiniteCrossSize;
  bool crossAxisAvailableSpaceIsDefinite;

  Size containerSize;
  Size innerContainerSize;

  // flex-line-count divides definite cross space between the requested lines.
  float dividedCrossSpace(float available) const {
    if (lineCount && *lineCount > 1) {
      const float count = static_cast<float>(*lineCount);
      return (available - (count - 1) * crossOf(gap, dir)) / count;
    }
    return available;
  }
};

// --- Setup --------------------------------------------------------------------

AlgoConstants computeConstants(const Style& style, OptSize known, Size2<bool> knownDefinite, OptSize parentSize,
                               SpaceSize availableSpace, bool unboundedMain, Opt scrollMain) {
  AlgoConstants c{};
  c.dir = style.flexDirection;
  c.isRow = isRow(c.dir);
  c.isColumn = !c.isRow;
  c.isWrap = isMultiLine(style.flexWrap);
  c.isWrapReverse = isWrapReverse(style.flexWrap);
  c.isBalance = isBalance(style.flexWrap);
  if (c.isWrap) c.lineCount = std::max<std::uint16_t>(style.flexLineCount, 1);

  const Opt aspectRatio = style.aspectRatio;
  const Edges padding = resolvePadding(style, parentSize.width);
  const Edges border = resolveBorder(style, parentSize.width);
  const Size adjustment = boxSizingAdjustment(style, padding, border);

  c.alignItems = resolveNormal(style.alignItems);
  c.alignContent =
      style.alignContent.keyword == AlignContent::Normal ? AlignContent{AlignContent::Stretch} : style.alignContent;
  c.justifyContent = style.justifyContent.keyword == AlignContent::Normal ? AlignContent{AlignContent::FlexStart}
                                                                          : style.justifyContent;
  c.layoutDirection = style.direction;

  // A node that scrolls vertically needs horizontal space for its scrollbar.
  c.scrollbarGutter = {style.overflow.y == Overflow::Scroll ? style.scrollbarWidth : 0.0f,
                       style.overflow.x == Overflow::Scroll ? style.scrollbarWidth : 0.0f};
  c.contentBoxInset = padding + border;
  c.contentBoxInset.bottom += c.scrollbarGutter.y;
  if (c.layoutDirection == Direction::Ltr) c.contentBoxInset.right += c.scrollbarGutter.x;
  else c.contentBoxInset.left += c.scrollbarGutter.x;

  c.nodeOuterSize = known;
  c.nodeInnerSize = maybeSub(known, c.contentBoxInset.sums());
  c.knownMainSizeIsDefinite = mainOf(knownDefinite, c.dir);
  c.percentBasis = c.knownMainSizeIsDefinite ? c.nodeInnerSize : withMain(c.nodeInnerSize, c.dir, Opt{});
  if (unboundedMain) setMain(c.percentBasis, c.dir, maybeSub(scrollMain, mainOf(c.contentBoxInset.sums(), c.dir)));
  c.hasDefiniteMainSize = c.knownMainSizeIsDefinite && mainOf(known, c.dir).has_value();
  c.hasDefiniteCrossSize = crossOf(knownDefinite, c.dir) && crossOf(known, c.dir).has_value();
  c.crossAxisAvailableSpaceIsDefinite = c.hasDefiniteCrossSize || crossOf(availableSpace, c.dir).isDefinite();
  const OptSize innerOrZero{c.nodeInnerSize.width.value_or(0), c.nodeInnerSize.height.value_or(0)};
  c.gap = {style.gap.width.resolveOrZero(innerOrZero.width), style.gap.height.resolveOrZero(innerOrZero.height)};

  c.minSize = maybeAdd(applyAspectRatio(resolveSize(style.minSize, parentSize), aspectRatio), adjustment);
  c.maxSize = maybeAdd(applyAspectRatio(resolveSize(style.maxSize, parentSize), aspectRatio), adjustment);
  if (unboundedMain) {
    setMain(c.minSize, c.dir, Opt{});
    setMain(c.maxSize, c.dir, Opt{});
  }
  c.border = border;
  return c;
}

/// A `position: relative` item's inset as one offset in the container's flex axes.
Size resolveRelativeInset(Rect<Opt> inset, const AlgoConstants& c) {
  const FlexDirection d = c.dir;
  const bool rtlRow = isRow(d) && c.layoutDirection == Direction::Rtl;
  const bool rtlColumn = !isRow(d) && c.layoutDirection == Direction::Rtl;
  const auto negated = [](Opt v) { return v ? Opt(-*v) : v; };
  const float main = rtlRow ? mainEnd(inset, d).value_or(negated(mainStart(inset, d)).value_or(0))
                            : mainStart(inset, d).value_or(negated(mainEnd(inset, d)).value_or(0));
  const float cross = rtlColumn ? negated(crossEnd(inset, d)).value_or(crossStart(inset, d).value_or(0))
                                : crossStart(inset, d).value_or(negated(crossEnd(inset, d)).value_or(0));
  Size out;
  setMain(out, d, main);
  setCross(out, d, cross);
  return out;
}

Rect<Opt> resolveInset(const Style& s, OptSize basis) {
  const Rect<LengthPercentageAuto> inset = s.insetSides();
  return {inset.top.resolve(basis.height), inset.right.resolve(basis.width), inset.bottom.resolve(basis.height),
          inset.left.resolve(basis.width)};
}

/// 9.1.1. Generate anonymous flex items.
std::vector<FlexItem> generateFlexItems(Node& node, const AlgoConstants& c) {
  // Percentages resolve against the container's inner size, if it is definite.
  const OptSize percentBasis = c.percentBasis;

  std::vector<FlexItem> items;
  const std::vector<Node*>& children = node.children();
  items.reserve(children.size());
  for (std::size_t index = 0; index < children.size(); ++index) {
    Node* child = children[index];
    const Style& s = child->style;
    if (s.position == Position::Absolute || s.display == Display::None) continue;

    FlexItem item;
    item.node = child;
    item.order = index;
    item.aspectRatio = s.aspectRatio;
    item.padding = resolvePadding(s, c.nodeInnerSize.width);
    item.border = resolveBorder(s, c.nodeInnerSize.width);
    const Size adjustment = boxSizingAdjustment(s, item.padding, item.border);
    item.size = maybeAdd(applyAspectRatio(resolveSize(s.size, percentBasis), item.aspectRatio), adjustment);
    item.sizeStyle = s.size;
    item.minSize = maybeAdd(resolveSize(s.minSize, percentBasis), adjustment);
    item.maxSize = maybeAdd(resolveSize(s.maxSize, percentBasis), adjustment);
    if (s.position == Position::Relative)
      item.relativeInset = resolveRelativeInset(resolveInset(s, c.nodeInnerSize), c);
    item.margin = resolveMarginOrZero(s, c.nodeInnerSize.width);
    const Rect<LengthPercentageAuto> margin = s.marginSides();
    item.marginIsAuto = {margin.top.isAuto(), margin.right.isAuto(), margin.bottom.isAuto(), margin.left.isAuto()};
    item.alignSelf = resolveNormal(s.alignSelf.value_or(c.alignItems))
                         .resolveSelfRelative(s.direction, c.layoutDirection, c.isColumn);
    item.overflow = s.overflow;
    item.scrollbarWidth = s.scrollbarWidth;
    item.flexGrow = s.flexGrow;
    item.flexShrink = s.flexShrink;
    items.push_back(item);
  }
  return items;
}

/// 9.2.2. Determine the available main and cross space for the flex items.
SpaceSize determineAvailableSpace(OptSize known, SpaceSize outer, const AlgoConstants& c) {
  const auto axis = [](Opt size, AvailableSpace available, float inset) {
    if (size) return AvailableSpace::definite(fmax(*size - inset, 0.0f));
    return available.maybeSub(inset).maybeMax(0.0f);
  };
  return {axis(known.width, outer.width, c.contentBoxInset.horizontal()),
          axis(known.height, outer.height, c.contentBoxInset.vertical())};
}

/// The constraint a child's main size is measured under for its flex base size.
AvailableSpace mainMeasureSpace(SpaceSize available, const AlgoConstants& c) {
  return mainOf(available, c.dir).kind == AvailableSpace::MinContent ? AvailableSpace::minContent()
                                                                     : AvailableSpace::maxContent();
}

/// 9.2.3. Determine the flex base size and hypothetical main size of each item.
void determineFlexBaseSize(const AlgoConstants& c, SpaceSize available, std::vector<FlexItem>& items) {
  const FlexDirection dir = c.dir;

  for (FlexItem& child : items) {
    const Style& style = child.node->style;
    const Opt crossParentSize = crossOf(c.nodeInnerSize, dir);
    const OptSize childParentSize = withCross(OptSize{}, dir, crossParentSize);

    // Min/max sizes transferred through the aspect ratio are taken into account here.
    const OptSize transferredMin = applyAspectRatio(child.minSize, child.aspectRatio);
    const OptSize transferredMax = applyAspectRatio(child.maxSize, child.aspectRatio);
    const Opt childMinCross = crossOf(transferredMin, dir);
    const Opt childMaxCross = crossOf(transferredMax, dir);

    AvailableSpace crossAvailable;
    const AvailableSpace containerCross = crossOf(available, dir);
    switch (containerCross.kind) {
    case AvailableSpace::Definite:
      crossAvailable = AvailableSpace::definite(maybeClamp(
          fmax(c.dividedCrossSpace(crossParentSize.value_or(containerCross.value)) - crossSum(child.margin, dir), 0.0f),
          childMinCross, childMaxCross));
      break;
    case AvailableSpace::MinContent:
      crossAvailable = childMinCross ? AvailableSpace::definite(*childMinCross) : AvailableSpace::minContent();
      break;
    case AvailableSpace::MaxContent:
      crossAvailable = childMaxCross ? AvailableSpace::definite(*childMaxCross) : AvailableSpace::maxContent();
      break;
    }

    bool childCrossIsDefinite = crossOf(child.size, dir).has_value();
    OptSize childKnown = withMain(child.size, dir, Opt{});
    // A definite cross size is clamped so sizes transferred through an aspect ratio use the used cross size.
    setCross(childKnown, dir,
             maybeClamp(crossOf(childKnown, dir), crossOf(transferredMin, dir), crossOf(transferredMax, dir)));
    if (child.alignSelf.isStretch() && !crossStart(child.marginIsAuto, dir) && !crossEnd(child.marginIsAuto, dir) &&
        !crossOf(childKnown, dir)) {
      setCross(childKnown, dir, crossAvailable.option());
      // A stretched item's cross size is definite if the container's is.
      childCrossIsDefinite = !c.isWrap && c.hasDefiniteCrossSize && crossParentSize.has_value();
    }

    // Percentage padding and border resolve against the container's width.
    const float adjustment = mainOf(boxSizingAdjustment(style, resolvePadding(style, c.nodeInnerSize.width),
                                                        resolveBorder(style, c.nodeInnerSize.width)),
                                    dir);
    // Percentage flex bases resolve against a definite main size only.
    const Opt percentMain = mainOf(c.percentBasis, dir);
    const Dimension basisStyle = style.flexBasis;
    const Opt flexBasis = maybeAdd(basisStyle.resolve(percentMain), adjustment);

    child.flexBasis = [&]() -> float {
      // A. A definite used flex basis is the flex base size.
      // B. An aspect ratio with a definite cross size gives the base size through the ratio.
      const Opt mainSize = mainOf(child.size, dir);
      const Opt mainStretch = maybeMax(maybeSub(percentMain, mainSum(child.margin, dir)), 0.0f);

      // A sizing keyword flex basis is used in place of the main size: stretch
      // is exact; the others set the constraint the item is measured under.
      std::optional<AvailableSpace> keywordSpace;
      if (basisStyle.isContent()) {
        // content: measured, ignoring the main size property.
      } else if (basisStyle.isSizingKeyword()) {
        if (const auto r = resolveSizingKeyword(basisStyle, mainStretch, percentMain)) {
          if (r->exact) {
            child.flexBasisIsDefinite = true;
            return *r->exact;
          }
          keywordSpace = r->measure;
        }
      } else {
        const Opt definite = flexBasis ? flexBasis : (basisStyle.isAuto() ? mainSize : Opt{});
        if (definite) {
          child.flexBasisIsDefinite = true;
          return *definite;
        }
        if (basisStyle.isAuto()) {
          if (const auto r = resolveSizingKeyword(mainOf(child.sizeStyle, dir), mainStretch, percentMain)) {
            if (r->exact) {
              child.flexBasisIsDefinite = true;
              return *r->exact;
            }
            keywordSpace = r->measure;
          }
        }
      }

      if (childCrossIsDefinite && child.aspectRatio && crossOf(childKnown, dir)) {
        child.flexBasisIsDefinite = true;
        const float cross = *crossOf(childKnown, dir);
        return isRow(dir) ? cross * *child.aspectRatio : cross / *child.aspectRatio;
      }

      // E. Size the item into the available space using its flex basis as its
      //    main size, treating content as max-content; an auto, indefinite
      //    cross size is fit-content.
      const SpaceSize childAvailable = withCross(
          withMain(SpaceSize{}, dir, keywordSpace.value_or(mainMeasureSpace(available, c))), dir, crossAvailable);
      return Engine::measureChildSize(*child.node, childKnown, childParentSize, childAvailable, SizingMode::ContentSize,
                                      isRow(dir));
    }();

    // Floor the flex basis by padding and border, as Chrome and Firefox do.
    const float paddingBorder = mainSum(child.padding, dir) + mainSum(child.border, dir);
    child.flexBasis = fmax(child.flexBasis, paddingBorder);
    child.innerFlexBasis = child.flexBasis - paddingBorder;

    const OptSize paddingBorderSums = some((child.padding + child.border).sums());

    // Percentage sizes must not contribute to a min-content contribution in
    // their own axis, so the main axis parent size is unset here.
    const Opt overflowMin = isScrollContainer(isRow(dir) ? child.overflow.x : child.overflow.y) ? Opt(0) : Opt{};
    const Opt styleMinMain = mainOf(child.minSize, dir) ? mainOf(child.minSize, dir) : overflowMin;

    if (styleMinMain) {
      child.resolvedMinimumMainSize = *styleMinMain;
    } else {
      const SpaceSize minContentSpace =
          withCross(SpaceSize{AvailableSpace::minContent(), AvailableSpace::minContent()}, dir, crossAvailable);
      const float minContent = Engine::measureChildSize(*child.node, childKnown, childParentSize, minContentSpace,
                                                        SizingMode::ContentSize, isRow(dir));
      // 4.5. Automatic Minimum Size of Flex Items
      const float clamped = maybeMin(maybeMin(minContent, mainOf(child.size, dir)), mainOf(transferredMax, dir));
      child.resolvedMinimumMainSize = maybeMax(clamped, mainOf(paddingBorderSums, dir));
    }

    // Transferred sizes clamp the hypothetical main size only.
    const float hypotheticalMin =
        maybeMax(maybeMax(child.resolvedMinimumMainSize, mainOf(transferredMin, dir)), mainOf(paddingBorderSums, dir));
    const float hypotheticalInner = maybeClamp(child.flexBasis, Opt(hypotheticalMin), mainOf(transferredMax, dir));
    setMain(child.hypotheticalInnerSize, dir, hypotheticalInner);
    setMain(child.hypotheticalOuterSize, dir, hypotheticalInner + mainSum(child.margin, dir));
  }
}

/// The limit lines wrap against; MaxContent never wraps.
AvailableSpace lineBreakSpace(const AlgoConstants& c, SpaceSize available) {
  if (const Opt max = mainOf(c.maxSize, c.dir)) {
    float space = mainOf(available, c.dir).option().value_or(*max);
    // An indefinite container is at most its max size, which is the limit.
    if (!c.hasDefiniteMainSize) space = fmin(space, *max);
    return AvailableSpace::definite(maybeMax(space, mainOf(c.minSize, c.dir)));
  }
  // A column's automatic main size is content-based: ancestors' space does not wrap it.
  if (!isRow(c.dir) && !c.hasDefiniteMainSize && mainOf(available, c.dir).isDefinite())
    return AvailableSpace::maxContent();
  return mainOf(available, c.dir);
}

std::vector<FlexLine> singleLine(std::vector<FlexItem>& items) {
  return {FlexLine{items.data(), items.data() + items.size()}};
}

std::vector<FlexLine> linePerItem(std::vector<FlexItem>& items) {
  std::vector<FlexLine> lines;
  for (FlexItem& item : items) lines.push_back({&item, &item + 1});
  return lines;
}

/// 9.3.5. Collect flex items into flex lines.
std::vector<FlexLine> collectFlexLines(const AlgoConstants& c, SpaceSize available, std::vector<FlexItem>& items) {
  // Wrapping needs a definite main size: a content-derived one keeps one line.
  if (!c.isWrap || !c.knownMainSizeIsDefinite) return singleLine(items);

  const AvailableSpace space = lineBreakSpace(c, available);
  if (space.kind == AvailableSpace::MaxContent) return singleLine(items);
  // Under a min-content constraint every item takes its own line.
  if (space.kind == AvailableSpace::MinContent) return linePerItem(items);

  std::vector<FlexLine> lines;
  const float gap = mainOf(c.gap, c.dir);
  FlexItem* begin = items.data();
  FlexItem* const last = items.data() + items.size();
  while (begin != last) {
    float lineLength = 0;
    FlexItem* end = last;
    for (FlexItem* it = begin; it != last; ++it) {
      const std::size_t index = static_cast<std::size_t>(it - begin);
      lineLength += mainOf(it->hypotheticalOuterSize, c.dir) + (index == 0 ? 0 : gap);
      if (lineLength > space.value && index != 0) {
        end = it;
        break;
      }
    }
    lines.push_back({begin, end});
    begin = end;
  }
  return lines;
}

/// flex-wrap: balance, so the largest line is as small as possible.
std::vector<FlexLine> collectBalancedFlexLines(const AlgoConstants& c, SpaceSize available,
                                               std::vector<FlexItem>& items) {
  if (items.empty()) return {};
  // A content-derived main size balances without a limit.
  const AvailableSpace space = c.knownMainSizeIsDefinite ? lineBreakSpace(c, available) : AvailableSpace::maxContent();
  if (space.kind == AvailableSpace::MinContent) return linePerItem(items);

  std::vector<float> sizes;
  for (const FlexItem& item : items) sizes.push_back(mainOf(item.hypotheticalOuterSize, c.dir));
  const std::vector<std::size_t> counts =
      balancedLineItemCounts(sizes, space.option().value_or(kInfinity), mainOf(c.gap, c.dir), c.lineCount.value_or(1));

  std::vector<FlexLine> lines;
  FlexItem* begin = items.data();
  for (std::size_t count : counts) {
    lines.push_back({begin, begin + count});
    begin += count;
  }
  return lines;
}

/// Whether an item's known dimensions are definite for its own children.
Size2<bool> itemKnownDimensionDefiniteness(const AlgoConstants& c, const FlexItem& item) {
  const FlexDirection dir = c.dir;
  const bool mainDefinite = c.hasDefiniteMainSize || item.flexBasisIsDefinite;
  const bool crossAutoMargins = crossStart(item.marginIsAuto, dir) || crossEnd(item.marginIsAuto, dir);
  const Dimension crossSize = crossOf(item.sizeStyle, dir);
  const bool stretched =
      !crossAutoMargins && (crossSize.isStretch() || (item.alignSelf.isStretch() && crossSize.isAuto()));
  // A fit-content width against definite space is definite; a content-based height is not.
  const bool crossDefinite =
      stretched || crossOf(item.size, dir).has_value() || (!isRow(dir) && c.crossAxisAvailableSpaceIsDefinite);
  Size2<bool> out{true, true};
  setMain(out, dir, mainDefinite);
  setCross(out, dir, crossDefinite);
  return out;
}

float itemMainLength(const FlexItem& child, const AlgoConstants& c) {
  const float paddingBorder = mainSum(child.padding + child.border, c.dir);
  return fmax(maybeMax(child.flexBasis, mainOf(child.minSize, c.dir)) + mainSum(child.margin, c.dir), paddingBorder);
}

/// 9.2.4. Determine the main size of the flex container.
void determineContainerMainSize(SpaceSize available, std::vector<FlexLine>& lines, AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  const float mainInset = mainSum(c.contentBoxInset, dir);
  const float gap = mainOf(c.gap, dir);

  float outerMain;
  if (const Opt known = mainOf(c.nodeOuterSize, dir)) {
    outerMain = *known;
  } else {
    const AvailableSpace space = mainOf(available, dir);
    if (space.kind == AvailableSpace::Definite) {
      float longest = 0;
      for (const FlexLine& line : lines) {
        float total = sumAxisGaps(gap, line.size());
        for (FlexItem* it = line.begin; it != line.end; ++it) total += itemMainLength(*it, c);
        longest = fmax(longest, total);
      }
      const float size = longest + mainInset;

      if (c.isBalance) {
        // A balanced container's max-content size balances its items across
        // the minimum line count without a limit.
        std::vector<float> lengths;
        for (const FlexLine& line : lines)
          for (FlexItem* it = line.begin; it != line.end; ++it) lengths.push_back(itemMainLength(*it, c));
        if (lengths.empty()) {
          outerMain = size;
        } else {
          const std::vector<std::size_t> counts =
              balancedLineItemCounts(lengths, kInfinity, gap, std::max<std::size_t>(c.lineCount.value_or(1), 1));
          float widest = 0;
          std::size_t index = 0;
          for (std::size_t count : counts) {
            float length = sumAxisGaps(gap, count);
            for (std::size_t i = index; i < index + count; ++i) length += lengths[i];
            widest = fmax(widest, length);
            index += count;
          }
          outerMain = fmax(size, fmin(widest + mainInset, space.value));
        }
      } else {
        outerMain = lines.size() > 1 ? fmax(size, space.value) : size;
      }
    } else if (space.kind == AvailableSpace::MinContent && c.isWrap) {
      float longest = 0;
      for (const FlexLine& line : lines) {
        float total = sumAxisGaps(gap, line.size());
        for (FlexItem* it = line.begin; it != line.end; ++it) total += itemMainLength(*it, c);
        longest = fmax(longest, total);
      }
      outerMain = longest + mainInset;
    } else {
      // The largest sum of the items' max-content (or min-content) contributions on one line.
      float mainSize = 0;
      for (FlexLine& line : lines) {
        for (FlexItem* item = line.begin; item != line.end; ++item) {
          const Opt styleMin = mainOf(item->minSize, dir);
          const float marginSum = mainSum(item->margin, dir);
          const Opt stylePreferred = mainOf(item->size, dir);
          const Opt styleMax = mainOf(item->maxSize, dir);

          // Row items clamp by their preferred size too, matching browsers;
          // column items by their flex base size alone.
          const Opt clampingBasis = c.isRow ? maybeMax(Opt(item->flexBasis), stylePreferred) : Opt(item->flexBasis);
          const Opt basisMin = item->flexShrink == 0 ? clampingBasis : Opt{};
          const Opt basisMax = item->flexGrow == 0 ? clampingBasis : Opt{};

          const Opt minCombined = styleMin ? maybeMax(styleMin, basisMin) : basisMin;
          const float minMain =
              fmax(minCombined.value_or(item->resolvedMinimumMainSize), item->resolvedMinimumMainSize);
          const Opt maxCombined = styleMax ? maybeMin(styleMax, basisMax) : basisMax;
          const float maxMain = maxCombined.value_or(kInfinity);

          float contribution;
          if (stylePreferred && (maxMain <= minMain || maxMain <= *stylePreferred)) {
            contribution = fmax(fmin(*stylePreferred, maxMain), minMain) + marginSum;
          } else if (maxMain <= minMain) {
            contribution = minMain + marginSum;
          } else if (item->isScrollContainer()) {
            contribution = item->flexBasis + marginSum;
          } else if (stylePreferred) {
            // A definite preferred size is the contribution, floored by padding and border.
            const float inner = fmax(*stylePreferred, mainSum(item->padding, dir) + mainSum(item->border, dir));
            contribution = c.isRow ? maybeClamp(inner + marginSum, styleMin, styleMax)
                                   : maybeClamp(fmax(inner, item->flexBasis) + marginSum, styleMin, styleMax);
          } else {
            const Opt crossParent = crossOf(c.nodeInnerSize, dir);
            const AvailableSpace crossAvailable =
                crossOf(available, dir)
                    .mapDefinite([&](float v) {
                      return fmax(c.dividedCrossSpace(crossParent.value_or(v)) - crossSum(item->margin, dir), 0.0f);
                    })
                    .maybeClamp(crossOf(item->minSize, dir), crossOf(item->maxSize, dir));
            const SpaceSize childAvailable = withCross(available, dir, crossAvailable);

            OptSize childKnown = withMain(item->size, dir, Opt{});
            // Clamp the definite cross size as determineFlexBaseSize does.
            const OptSize tMin = applyAspectRatio(item->minSize, item->aspectRatio);
            const OptSize tMax = applyAspectRatio(item->maxSize, item->aspectRatio);
            setCross(childKnown, dir, maybeClamp(crossOf(childKnown, dir), crossOf(tMin, dir), crossOf(tMax, dir)));
            if (item->alignSelf.isStretch() && !crossOf(childKnown, dir))
              setCross(childKnown, dir, crossAvailable.option());

            const float measured = Engine::measureChildSize(*item->node, childKnown, c.nodeInnerSize, childAvailable,
                                                            SizingMode::ContentSize, isRow(dir));
            // A known cross size transferred through the aspect ratio floors the content size.
            Opt transferred;
            if (item->aspectRatio && crossOf(childKnown, dir)) {
              const float cross = *crossOf(childKnown, dir);
              transferred = c.isRow ? cross * *item->aspectRatio : cross / *item->aspectRatio;
            }
            const float inner = maybeMax(measured, transferred);
            // Asymmetric for rows and columns, matching browsers (the
            // flex_basis_unconstraint_row/column fixtures).
            contribution = c.isRow ? maybeClamp(inner + marginSum, styleMin, styleMax)
                                   : maybeClamp(fmax(inner, item->flexBasis) + marginSum, styleMin, styleMax);
          }

          const float diff = contribution - marginSum - item->flexBasis;
          if (diff > 0) item->contentFlexFraction = diff / fmax(1.0f, item->flexGrow);
          else if (diff < 0) item->contentFlexFraction = diff / (fmax(1.0f, item->flexShrink) * item->innerFlexBasis);
          else item->contentFlexFraction = 0;
        }

        // A wrapping row is at least as large as its largest item, matching Chrome.
        const bool floorByLargest = c.isWrap && c.isRow;
        float largest = 0;
        float sum = 0;
        for (FlexItem* item = line.begin; item != line.end; ++item) {
          const float fraction = item->contentFlexFraction;
          float flexContribution = 0;
          if (fraction > 0) {
            flexContribution = fmax(1.0f, item->flexGrow) * fraction;
          } else if (fraction < 0) {
            const float scaledShrink = fmax(1.0f, item->flexShrink) * item->innerFlexBasis;
            flexContribution = scaledShrink == 0 ? 0 : scaledShrink * fraction;
          }
          const float size = item->flexBasis + flexContribution + mainSum(item->margin, dir);
          if (floorByLargest) largest = fmax(largest, size);
          sum += size;
        }
        mainSize = fmax(mainSize, fmax(largest, sum + sumAxisGaps(gap, line.size())));
      }
      outerMain = mainSize + mainInset;
    }
  }

  outerMain = fmax(maybeClamp(outerMain, mainOf(c.minSize, dir), mainOf(c.maxSize, dir)),
                   mainInset - (c.isRow ? c.scrollbarGutter.x : c.scrollbarGutter.y));
  const float innerMain = fmax(outerMain - mainInset, 0.0f);
  setMain(c.containerSize, dir, outerMain);
  setMain(c.innerContainerSize, dir, innerMain);
  setMain(c.nodeInnerSize, dir, Opt(innerMain));
}

/// 9.7. Resolving Flexible Lengths.
void resolveFlexibleLengths(FlexLine& line, const AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  const float totalGap = sumAxisGaps(mainOf(c.gap, dir), line.size());
  const Opt innerMain = mainOf(c.nodeInnerSize, dir);

  // 1. Determine the used flex factor.
  float totalHypothetical = 0;
  for (FlexItem* it = line.begin; it != line.end; ++it) totalHypothetical += mainOf(it->hypotheticalOuterSize, dir);
  const float usedFlexFactor = totalGap + totalHypothetical;
  const bool growing = usedFlexFactor < innerMain.value_or(0);
  const bool shrinking = usedFlexFactor > innerMain.value_or(0);
  const bool exactlySized = !growing && !shrinking;

  // 2. Size inflexible items.
  for (FlexItem* child = line.begin; child != line.end; ++child) {
    const float target = mainOf(child->hypotheticalInnerSize, dir);
    setMain(child->targetSize, dir, target);
    if (exactlySized || (child->flexGrow == 0 && child->flexShrink == 0) ||
        (growing && child->flexBasis > mainOf(child->hypotheticalInnerSize, dir)) ||
        (shrinking && child->flexBasis < mainOf(child->hypotheticalInnerSize, dir))) {
      child->frozen = true;
      setMain(child->outerTargetSize, dir, target + mainSum(child->margin, dir));
    }
  }
  if (exactlySized) return;

  // 3. Calculate initial free space.
  float usedSpace = totalGap;
  for (FlexItem* child = line.begin; child != line.end; ++child)
    usedSpace += child->frozen ? mainOf(child->outerTargetSize, dir) : child->flexBasis + mainSum(child->margin, dir);
  const float initialFreeSpace = maybeSub(innerMain, usedSpace).value_or(0);

  // 4. Loop
  while (true) {
    // a. Check for flexible items.
    bool allFrozen = true;
    float itemsSpace = 0;
    float sumGrow = 0;
    float sumShrink = 0;
    for (FlexItem* child = line.begin; child != line.end; ++child) {
      if (child->frozen) {
        itemsSpace += mainOf(child->outerTargetSize, dir);
      } else {
        allFrozen = false;
        itemsSpace += child->flexBasis + mainSum(child->margin, dir);
        sumGrow += child->flexGrow;
        sumShrink += child->flexShrink;
      }
    }
    if (allFrozen) break;

    // b. Calculate the remaining free space.
    const float used = totalGap + itemsSpace;
    float freeSpace;
    if (growing && sumGrow < 1) {
      freeSpace = maybeMin(initialFreeSpace * sumGrow - totalGap, maybeSub(innerMain, used));
    } else if (shrinking && sumShrink < 1) {
      freeSpace = maybeMax(initialFreeSpace * sumShrink - totalGap, maybeSub(innerMain, used));
    } else {
      freeSpace = maybeSub(innerMain, used).value_or(usedFlexFactor - used);
    }

    // c. Distribute free space proportional to the flex factors.
    if (std::isnormal(freeSpace)) {
      if (growing && sumGrow > 0) {
        for (FlexItem* child = line.begin; child != line.end; ++child)
          if (!child->frozen)
            setMain(child->targetSize, dir, child->flexBasis + freeSpace * (child->flexGrow / sumGrow));
      } else if (shrinking && sumShrink > 0) {
        float sumScaled = 0;
        for (FlexItem* child = line.begin; child != line.end; ++child)
          if (!child->frozen) sumScaled += child->innerFlexBasis * child->flexShrink;
        if (sumScaled > 0) {
          for (FlexItem* child = line.begin; child != line.end; ++child) {
            if (child->frozen) continue;
            const float scaled = child->innerFlexBasis * child->flexShrink;
            setMain(child->targetSize, dir, child->flexBasis + freeSpace * (scaled / sumScaled));
          }
        }
      }
    }

    // d. Fix min/max violations.
    float totalViolation = 0;
    for (FlexItem* child = line.begin; child != line.end; ++child) {
      if (child->frozen) continue;
      const float clamped = fmax(
          maybeClamp(mainOf(child->targetSize, dir), Opt(child->resolvedMinimumMainSize), mainOf(child->maxSize, dir)),
          0.0f);
      child->violation = clamped - mainOf(child->targetSize, dir);
      setMain(child->targetSize, dir, clamped);
      setMain(child->outerTargetSize, dir, clamped + mainSum(child->margin, dir));
      totalViolation += child->violation;
    }

    // e. Freeze over-flexed items.
    for (FlexItem* child = line.begin; child != line.end; ++child) {
      if (child->frozen) continue;
      if (totalViolation > 0) child->frozen = child->violation > 0;
      else if (totalViolation < 0) child->frozen = child->violation < 0;
      else child->frozen = true;
    }
  }
}

/// 9.4.7. Determine the hypothetical cross size of each item.
void determineHypotheticalCrossSize(FlexLine& line, const AlgoConstants& c, OptSize nodeSize, SpaceSize available) {
  const FlexDirection dir = c.dir;
  // A single line with a definite cross size is that size, whatever its items' sizes.
  const bool lineCrossKnown = !c.isWrap && crossOf(nodeSize, dir).has_value();

  for (FlexItem* child = line.begin; child != line.end; ++child) {
    const float paddingBorder = crossSum(child->padding + child->border, dir);
    if (lineCrossKnown && child->isStretched(dir) && !child->participatesInBaselineAlignment(dir)) continue;

    const AvailableSpace availableMain =
        AvailableSpace::definite(fmax(mainOf(c.containerSize, dir) - mainSum(child->margin, dir), 0.0f));
    const Opt tMinCross = crossOf(applyAspectRatio(child->minSize, child->aspectRatio), dir);
    const Opt tMaxCross = crossOf(applyAspectRatio(child->maxSize, child->aspectRatio), dir);
    const Opt childCross = maybeMax(maybeClamp(crossOf(child->size, dir), tMinCross, tMaxCross), paddingBorder);

    AvailableSpace availableCross =
        crossOf(available, dir)
            .mapDefinite([&](float v) { return fmax(c.dividedCrossSpace(v) - crossSum(child->margin, dir), 0.0f); })
            .maybeClamp(tMinCross, tMaxCross)
            .maybeMax(paddingBorder);

    // A keyword cross size sets the constraint the item is measured under;
    // stretch is resolved against the line later.
    const Opt innerCross = crossOf(c.nodeInnerSize, dir);
    const Opt stretchCross = maybeMax(
        maybeSub(innerCross ? Opt(c.dividedCrossSpace(*innerCross)) : Opt{}, crossSum(child->margin, dir)), 0.0f);
    if (const auto r = resolveSizingKeyword(crossOf(child->sizeStyle, dir), stretchCross, innerCross)) {
      if (r->measure) availableCross = *r->measure;
    }

    float innerCrossSize;
    if (childCross) {
      innerCrossSize = *childCross;
    } else {
      LayoutInput input;
      input.runMode = RunMode::ComputeSize;
      input.sizingMode = SizingMode::ContentSize;
      input.axis = c.isRow ? RequestedAxis::Vertical : RequestedAxis::Horizontal;
      input.knownDimensions =
          c.isRow ? OptSize{child->targetSize.width, childCross} : OptSize{childCross, child->targetSize.height};
      input.knownDimensionsAreDefinite = itemKnownDimensionDefiniteness(c, *child);
      input.parentSize = c.nodeInnerSize;
      input.availableSpace =
          c.isRow ? SpaceSize{availableMain, availableCross} : SpaceSize{availableCross, availableMain};
      const Size size = Engine::computeChildLayout(*child->node, input).size;
      innerCrossSize = fmax(maybeClamp(c.isRow ? size.height : size.width, tMinCross, tMaxCross), paddingBorder);
    }
    setCross(child->hypotheticalInnerSize, dir, innerCrossSize);
    setCross(child->hypotheticalOuterSize, dir, innerCrossSize + crossSum(child->margin, dir));
  }
}

/// Baselines of the items that align by baseline, in rows only.
void calculateChildrenBaselines(OptSize nodeSize, SpaceSize available, std::vector<FlexLine>& lines,
                                const AlgoConstants& c) {
  if (!c.isRow) return;

  for (FlexLine& line : lines) {
    std::size_t participants = 0;
    for (FlexItem* it = line.begin; it != line.end; ++it)
      if (it->participatesInBaselineAlignment(c.dir)) ++participants;
    // With one or no participants, baseline alignment is a no-op.
    if (participants <= 1) continue;

    for (FlexItem* child = line.begin; child != line.end; ++child) {
      if (!child->participatesInBaselineAlignment(c.dir)) continue;

      LayoutInput input;
      input.runMode = RunMode::PerformLayout;
      input.sizingMode = SizingMode::ContentSize;
      input.axis = RequestedAxis::Both;
      input.knownDimensions = {child->targetSize.width, child->hypotheticalInnerSize.height};
      input.knownDimensionsAreDefinite = itemKnownDimensionDefiniteness(c, *child);
      input.parentSize = c.nodeInnerSize;
      const SpaceSize space{AvailableSpace::definite(c.containerSize.width),
                            available.height.maybeSet(nodeSize.height)};
      input.availableSpace = {space.width.maybeSub(child->margin.horizontal()).maybeMax(0.0f),
                              space.height.maybeSub(child->margin.vertical()).maybeMax(0.0f)};
      const LayoutOutput output = Engine::computeChildLayout(*child->node, input);

      const float height = output.size.height;
      const float baseline = childFirstBaseline(output.firstBaseline, height, child->overflow.y).value_or(height);
      child->baseline = baseline + child->margin.top;
    }
  }
}

/// 9.4.8. Calculate the cross size of each flex line.
void calculateCrossSize(std::vector<FlexLine>& lines, OptSize nodeSize, const AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  const float crossInset = crossSum(c.contentBoxInset, dir);
  if (!c.isWrap && crossOf(nodeSize, dir)) {
    lines[0].crossSize =
        maybeMax(
            maybeSub(maybeClamp(crossOf(nodeSize, dir), crossOf(c.minSize, dir), crossOf(c.maxSize, dir)), crossInset),
            0.0f)
            .value_or(0);
    return;
  }

  for (FlexLine& line : lines) {
    float maxBaseline = 0;
    for (FlexItem* it = line.begin; it != line.end; ++it) maxBaseline = fmax(maxBaseline, it->baseline);
    float size = 0;
    for (FlexItem* it = line.begin; it != line.end; ++it) {
      const float outer = crossOf(it->hypotheticalOuterSize, dir);
      size = fmax(size, it->participatesInBaselineAlignment(dir) ? maxBaseline - it->baseline + outer : outer);
    }
    line.crossSize = size;
  }

  // A single line clamps to the container's min and max cross sizes.
  if (!c.isWrap) {
    lines[0].crossSize = maybeClamp(lines[0].crossSize, maybeSub(crossOf(c.minSize, dir), crossInset),
                                    maybeSub(crossOf(c.maxSize, dir), crossInset));
  }
}

/// 9.4.9. Handle 'align-content: stretch'.
void handleAlignContentStretch(std::vector<FlexLine>& lines, OptSize nodeSize, const AlgoConstants& c) {
  if (!(c.alignContent == AlignContent{AlignContent::Stretch})) return;
  const FlexDirection dir = c.dir;
  const Opt minCross = crossOf(c.minSize, dir);
  const float containerMin = maybeMax(maybeSub(maybeClamp(crossOf(nodeSize, dir) ? crossOf(nodeSize, dir) : minCross,
                                                          minCross, crossOf(c.maxSize, dir)),
                                               crossSum(c.contentBoxInset, dir)),
                                      0.0f)
                                 .value_or(0);
  float total = sumAxisGaps(crossOf(c.gap, dir), lines.size());
  for (const FlexLine& line : lines) total += line.crossSize;
  if (total < containerMin) {
    const float addition = (containerMin - total) / static_cast<float>(lines.size());
    for (FlexLine& line : lines) line.crossSize += addition;
  }
}

/// 9.4.11. Determine the used cross size of each flex item.
void determineUsedCrossSize(std::vector<FlexLine>& lines, const AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  for (FlexLine& line : lines) {
    for (FlexItem* child = line.begin; child != line.end; ++child) {
      const Style& style = child->node->style;
      float cross;
      if (child->isStretched(dir)) {
        // Stretching ignores the aspect ratio's transfer of the max size, as browsers do.
        const Edges padding = resolvePadding(style, c.nodeInnerSize.width);
        const Edges border = resolveBorder(style, c.nodeInnerSize.width);
        const OptSize maxIgnoringRatio =
            maybeAdd(resolveSize(style.maxSize, c.nodeInnerSize), boxSizingAdjustment(style, padding, border));
        cross = maybeClamp(fmax(line.crossSize - crossSum(child->margin, dir), 0.0f), crossOf(child->minSize, dir),
                           crossOf(maxIgnoringRatio, dir));
      } else {
        cross = crossOf(child->hypotheticalInnerSize, dir);
      }
      setCross(child->targetSize, dir, cross);
      setCross(child->outerTargetSize, dir, cross + crossSum(child->margin, dir));
    }
  }
}

/// 9.5.12. Distribute any remaining free space: auto margins, then justify-content.
void distributeRemainingFreeSpace(std::vector<FlexLine>& lines, const AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  for (FlexLine& line : lines) {
    float used = sumAxisGaps(mainOf(c.gap, dir), line.size());
    for (FlexItem* it = line.begin; it != line.end; ++it) used += mainOf(it->outerTargetSize, dir);
    float freeSpace = mainOf(c.innerContainerSize, dir) - used;

    int autoMargins = 0;
    for (FlexItem* it = line.begin; it != line.end; ++it)
      autoMargins += mainStart(it->marginIsAuto, dir) + mainEnd(it->marginIsAuto, dir);

    if (freeSpace > 0 && autoMargins > 0) {
      const float margin = freeSpace / static_cast<float>(autoMargins);
      for (FlexItem* it = line.begin; it != line.end; ++it) {
        if (mainStart(it->marginIsAuto, dir)) (c.isRow ? it->margin.left : it->margin.top) = margin;
        if (mainEnd(it->marginIsAuto, dir)) (c.isRow ? it->margin.right : it->margin.bottom) = margin;
      }
      // The auto margins absorbed the free space; none is left for justify-content.
      freeSpace = 0;
    }

    const std::size_t count = line.size();
    const bool reversed = isReverse(dir);
    const float gap = mainOf(c.gap, dir);
    const AlignContent::Keyword mode = alignmentFallback(freeSpace, count, c.justifyContent);
    std::size_t i = 0;
    const auto justify = [&](FlexItem& child) {
      child.offsetMain = alignmentOffset(freeSpace, count, gap, mode, reversed, i == 0);
      ++i;
    };
    if (reversed)
      for (FlexItem* it = line.end; it != line.begin;) justify(*--it);
    else
      for (FlexItem* it = line.begin; it != line.end; ++it) justify(*it);
  }
}

/// 9.6.14. Align an item along the cross axis per align-self.
float alignAlongCrossAxis(const FlexItem& child, float freeSpace, float maxBaseline, float maxBaselineToBottom,
                          const AlgoConstants& c) {
  const bool crossReversed = c.isColumn && c.layoutDirection == Direction::Rtl;
  // A safe alignment that overflows falls back to start.
  const AlignItems::Keyword keyword =
      child.alignSelf.isSafe() && freeSpace < 0 ? AlignItems::Start : child.alignSelf.keyword;
  const bool flexStartAtEnd = c.isWrapReverse != crossReversed;

  switch (keyword) {
  case AlignItems::Start: return crossReversed ? freeSpace : 0;
  case AlignItems::FlexStart: return flexStartAtEnd ? freeSpace : 0;
  case AlignItems::End: return crossReversed ? 0 : freeSpace;
  case AlignItems::FlexEnd: return flexStartAtEnd ? 0 : freeSpace;
  case AlignItems::Center: return freeSpace / 2;
  case AlignItems::Baseline:
    if (c.isRow) {
      if (c.isWrapReverse) {
        // The cross axis is flipped, so baseline items align to the line's bottom.
        const float lineCross = freeSpace + crossOf(child.outerTargetSize, c.dir);
        return lineCross - maxBaselineToBottom - child.baseline;
      }
      return maxBaseline - child.baseline;
    } else {
      // Baselines only align in rows; in columns this is flex-start.
      const bool reverse = crossReversed && !c.isWrap;
      return c.isWrapReverse != reverse ? freeSpace : 0;
    }
  case AlignItems::Stretch: return flexStartAtEnd ? freeSpace : 0;
  default: return 0; // normal, self-start and self-end are resolved earlier
  }
}

/// 9.6.13. Resolve cross-axis auto margins (and 14. align the rest).
void resolveCrossAxisAutoMargins(std::vector<FlexLine>& lines, const AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  for (FlexLine& line : lines) {
    float maxBaseline = 0;
    float maxToBottom = 0;
    for (FlexItem* it = line.begin; it != line.end; ++it) {
      maxBaseline = fmax(maxBaseline, it->baseline);
      if (it->participatesInBaselineAlignment(dir))
        maxToBottom = fmax(maxToBottom, crossOf(it->outerTargetSize, dir) - it->baseline);
    }

    for (FlexItem* child = line.begin; child != line.end; ++child) {
      const float freeSpace = line.crossSize - crossOf(child->outerTargetSize, dir);
      const bool startAuto = crossStart(child->marginIsAuto, dir);
      const bool endAuto = crossEnd(child->marginIsAuto, dir);
      float& start = c.isRow ? child->margin.top : child->margin.left;
      float& end = c.isRow ? child->margin.bottom : child->margin.right;
      if (startAuto && endAuto) {
        start = freeSpace / 2;
        end = freeSpace / 2;
      } else if (startAuto) {
        start = freeSpace;
      } else if (endAuto) {
        end = freeSpace;
      } else {
        child->offsetCross = alignAlongCrossAxis(*child, freeSpace, maxBaseline, maxToBottom, c);
      }
    }
  }
}

/// 9.6.15. Determine the flex container's used cross size.
float determineContainerCrossSize(const std::vector<FlexLine>& lines, OptSize nodeSize, AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  const float totalGap = sumAxisGaps(crossOf(c.gap, dir), lines.size());
  float totalLines = 0;
  for (const FlexLine& line : lines) totalLines += line.crossSize;

  const float inset = crossSum(c.contentBoxInset, dir);
  const float gutter = c.isRow ? c.scrollbarGutter.y : c.scrollbarGutter.x;
  const float outer = fmax(maybeClamp(crossOf(nodeSize, dir).value_or(totalLines + totalGap + inset),
                                      crossOf(c.minSize, dir), crossOf(c.maxSize, dir)),
                           inset - gutter);
  setCross(c.containerSize, dir, outer);
  setCross(c.innerContainerSize, dir, fmax(outer - inset, 0.0f));
  return totalLines;
}

/// 9.6.16. Align all flex lines per align-content.
void alignFlexLines(std::vector<FlexLine>& lines, const AlgoConstants& c, float totalCross) {
  const std::size_t count = lines.size();
  const float gap = crossOf(c.gap, c.dir);
  const float freeSpace = crossOf(c.innerContainerSize, c.dir) - totalCross - sumAxisGaps(gap, count);
  const AlignContent::Keyword mode = alignmentFallback(freeSpace, count, c.alignContent);
  std::size_t i = 0;
  const auto align = [&](FlexLine& line) {
    line.offsetCross = alignmentOffset(freeSpace, count, gap, mode, c.isWrapReverse, i == 0);
    ++i;
  };
  if (c.isWrapReverse)
    for (auto it = lines.rbegin(); it != lines.rend(); ++it) align(*it);
  else
    for (FlexLine& line : lines) align(line);
}

/// Lays out one item at its final size and records its position.
void calculateFlexItem(FlexItem& item, float& totalOffsetMain, float totalOffsetCross, float lineOffsetCross,
                       const AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  LayoutInput input;
  input.runMode = RunMode::PerformLayout;
  input.sizingMode = SizingMode::ContentSize;
  input.axis = RequestedAxis::Both;
  input.knownDimensions = some(item.targetSize);
  input.knownDimensionsAreDefinite = itemKnownDimensionDefiniteness(c, item);
  input.parentSize = c.nodeInnerSize;
  input.availableSpace = {AvailableSpace::definite(fmax(c.containerSize.width - item.margin.horizontal(), 0.0f)),
                          AvailableSpace::definite(fmax(c.containerSize.height - item.margin.vertical(), 0.0f))};
  const LayoutOutput output = Engine::computeChildLayout(*item.node, input);
  const Size size = output.size;

  const bool rtlRow = isRow(dir) && c.layoutDirection == Direction::Rtl;
  const bool rtlColumn = !isRow(dir) && c.layoutDirection == Direction::Rtl;
  const float mainInset = mainOf(item.relativeInset, dir);
  const float crossInset = crossOf(item.relativeInset, dir);
  const float lineCross = rtlColumn ? 0 : lineOffsetCross;

  const float offsetMain = rtlRow
                               ? totalOffsetMain - item.offsetMain - mainEnd(item.margin, dir) - mainInset - size.width
                               : totalOffsetMain + item.offsetMain + mainStart(item.margin, dir) + mainInset;
  const float offsetCross = totalOffsetCross + item.offsetCross + lineCross + crossStart(item.margin, dir) + crossInset;

  const float innerBaseline =
      childFirstBaseline(output.firstBaseline, size.height, item.overflow.y).value_or(size.height);
  if (isRow(dir))
    item.baseline = totalOffsetCross + item.offsetCross + lineCross + crossStart(item.margin, dir) + innerBaseline;
  else item.baseline = totalOffsetMain + item.offsetMain + mainStart(item.margin, dir) + innerBaseline;

  Layout layout;
  layout.x = isRow(dir) ? offsetMain : offsetCross;
  layout.y = isRow(dir) ? offsetCross : offsetMain;
  layout.width = size.width;
  layout.height = size.height;
  layout.content = output.contentSize;
  layout.padding = item.padding;
  layout.border = item.border;
  Engine::setUnroundedLayout(*item.node, layout);

  const float advance = item.offsetMain + mainSum(item.margin, dir) + mainOf(size, dir);
  totalOffsetMain += rtlRow ? -advance : advance;
}

void calculateLayoutLine(FlexLine& line, float& totalOffsetCross, const AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  const bool rtl = c.layoutDirection == Direction::Rtl;
  float totalOffsetMain =
      rtl && isRow(dir) ? c.containerSize.width - mainEnd(c.contentBoxInset, dir) : mainStart(c.contentBoxInset, dir);
  const float lineOffsetCross = line.offsetCross;
  const bool rtlColumn = rtl && !isRow(dir);
  if (rtlColumn) totalOffsetCross -= lineOffsetCross + line.crossSize;

  if (isReverse(dir)) {
    for (FlexItem* it = line.end; it != line.begin;)
      calculateFlexItem(*--it, totalOffsetMain, totalOffsetCross, lineOffsetCross, c);
  } else {
    for (FlexItem* it = line.begin; it != line.end; ++it)
      calculateFlexItem(*it, totalOffsetMain, totalOffsetCross, lineOffsetCross, c);
  }

  if (!rtlColumn) totalOffsetCross += lineOffsetCross + line.crossSize;
}

void finalLayoutPass(std::vector<FlexLine>& lines, const AlgoConstants& c) {
  float totalOffsetCross = c.isColumn && c.layoutDirection == Direction::Rtl
                               ? c.containerSize.width - crossEnd(c.contentBoxInset, c.dir)
                               : crossStart(c.contentBoxInset, c.dir);
  if (c.isWrapReverse)
    for (auto it = lines.rbegin(); it != lines.rend(); ++it) calculateLayoutLine(*it, totalOffsetCross, c);
  else
    for (FlexLine& line : lines) calculateLayoutLine(line, totalOffsetCross, c);
}

/// The static position of an absolute child: where it would sit as the only
/// item, per justify-content and align-self (flexbox §4.1).
Point2<AxisStaticPosition> staticPositionOf(const Style& childStyle, const AlgoConstants& c) {
  const FlexDirection dir = c.dir;
  const bool mainIsRtl = c.isRow && c.layoutDirection == Direction::Rtl;
  const bool crossIsRtl = !c.isRow && c.layoutDirection == Direction::Rtl;
  const bool mainReversed = isReverse(dir) != mainIsRtl;
  const bool crossReversed = c.isWrapReverse != crossIsRtl;

  const Line<float> mainArea{mainStart(c.contentBoxInset, dir),
                             mainOf(c.containerSize, dir) - mainEnd(c.contentBoxInset, dir)};
  const Line<float> crossArea{crossStart(c.contentBoxInset, dir),
                              crossOf(c.containerSize, dir) - crossEnd(c.contentBoxInset, dir)};

  const AlignItems alignSelf = resolveNormal(childStyle.alignSelf.value_or(c.alignItems))
                                   .resolveSelfRelative(childStyle.direction, c.layoutDirection, c.isColumn);

  // justify-content: start/end are writing-mode relative, the rest flex-relative.
  // Chrome applies no safe fallback here, so neither does this.
  StaticEdge mainEdge;
  switch (c.justifyContent.keyword) {
  case AlignContent::Start: mainEdge = mainIsRtl ? StaticEdge::End : StaticEdge::Start; break;
  case AlignContent::End: mainEdge = mainIsRtl ? StaticEdge::Start : StaticEdge::End; break;
  case AlignContent::FlexEnd: mainEdge = mainReversed ? StaticEdge::Start : StaticEdge::End; break;
  case AlignContent::SpaceEvenly:
  case AlignContent::SpaceAround:
  case AlignContent::Center: mainEdge = StaticEdge::Center; break;
  default: mainEdge = mainReversed ? StaticEdge::End : StaticEdge::Start; break;
  }

  // align-self: start/end/baseline are writing-mode relative, the rest flex-relative.
  const auto crossEdge = [&](AlignItems::Keyword keyword) {
    switch (keyword) {
    case AlignItems::Start:
    case AlignItems::Baseline: return crossIsRtl ? StaticEdge::End : StaticEdge::Start;
    case AlignItems::End: return crossIsRtl ? StaticEdge::Start : StaticEdge::End;
    case AlignItems::FlexEnd: return crossReversed ? StaticEdge::Start : StaticEdge::End;
    case AlignItems::Center: return StaticEdge::Center;
    default: return crossReversed ? StaticEdge::End : StaticEdge::Start; // stretch and flex-start
    }
  };
  const AlignItems::Keyword fallback = alignSelf.isSafe() ? AlignItems::Start : alignSelf.keyword;

  const AxisStaticPosition cross{crossArea, {crossEdge(alignSelf.keyword), alignSelf.safety, crossEdge(fallback)}};
  const AxisStaticPosition main{mainArea, {mainEdge, Safety::Default, mainEdge}};
  return c.isRow ? Point2<AxisStaticPosition>{main, cross} : Point2<AxisStaticPosition>{cross, main};
}

void layoutAbsoluteChildren(Node& node, const AlgoConstants& c) {
  const bool rtl = c.layoutDirection == Direction::Rtl;
  const Edges inset =
      c.border + Edges{0, rtl ? 0 : c.scrollbarGutter.x, c.scrollbarGutter.y, rtl ? c.scrollbarGutter.x : 0};
  const Size area{c.containerSize.width - inset.horizontal(), c.containerSize.height - inset.vertical()};
  const Point offset{inset.left, inset.top};
  for (Node* child : node.children()) {
    if (child->style.display == Display::None || child->style.position != Position::Absolute) continue;
    layoutAbsoluteChild(*child, staticPositionOf(child->style, c), area, offset, c.layoutDirection,
                        node.style.overflow);
  }
}

LayoutOutput computePreliminary(Node& node, const LayoutInput& input, bool unboundedMain, Opt scrollMain) {
  const OptSize known = input.knownDimensions;
  AlgoConstants c = computeConstants(node.style, known, input.knownDimensionsAreDefinite, input.parentSize,
                                     input.availableSpace, unboundedMain, scrollMain);

  // 9.1. Initial Setup
  std::vector<FlexItem> items = generateFlexItems(node, c);

  // 9.2. Line Length Determination
  const SpaceSize available = determineAvailableSpace(known, input.availableSpace, c);
  determineFlexBaseSize(c, available, items);

  // 9.3. Main Size Determination
  std::vector<FlexLine> lines =
      c.isBalance ? collectBalancedFlexLines(c, available, items) : collectFlexLines(c, available, items);

  if (const Opt innerMain = mainOf(c.nodeInnerSize, c.dir)) {
    setMain(c.innerContainerSize, c.dir, *innerMain);
    setMain(c.containerSize, c.dir, *innerMain + mainSum(c.contentBoxInset, c.dir));
  } else {
    determineContainerMainSize(available, lines, c);
    setMain(c.nodeInnerSize, c.dir, Opt(mainOf(c.innerContainerSize, c.dir)));
    setMain(c.nodeOuterSize, c.dir, Opt(mainOf(c.containerSize, c.dir)));
    // Re-resolve percentage gaps against the new main size.
    const LengthPercentage gapStyle = isRow(c.dir) ? node.style.gap.width : node.style.gap.height;
    setMain(c.gap, c.dir, gapStyle.resolve(mainOf(c.innerContainerSize, c.dir)).value_or(0));
  }

  // Only the main size was requested: nothing below changes it.
  if (input.runMode == RunMode::ComputeSize &&
      ((input.axis == RequestedAxis::Horizontal && c.isRow) || (input.axis == RequestedAxis::Vertical && c.isColumn))) {
    LayoutOutput output;
    setMain(output.size, c.dir, mainOf(c.containerSize, c.dir));
    output.contentSize = output.size;
    return output;
  }

  for (FlexLine& line : lines) resolveFlexibleLengths(line, c);

  // 9.4. Cross Size Determination
  for (FlexLine& line : lines) determineHypotheticalCrossSize(line, c, known, available);
  calculateChildrenBaselines(known, available, lines, c);
  calculateCrossSize(lines, known, c);
  handleAlignContentStretch(lines, known, c);
  determineUsedCrossSize(lines, c);

  // 9.5. Main-Axis Alignment
  distributeRemainingFreeSpace(lines, c);

  // 9.6. Cross-Axis Alignment
  resolveCrossAxisAutoMargins(lines, c);
  const float totalLineCross = determineContainerCrossSize(lines, known, c);

  if (input.runMode == RunMode::ComputeSize) {
    LayoutOutput output;
    output.size = c.containerSize;
    output.contentSize = c.containerSize;
    return output;
  }

  alignFlexLines(lines, c, totalLineCross);
  finalLayoutPass(lines, c);
  layoutAbsoluteChildren(node, c);

  for (Node* child : node.children())
    if (child->style.display == Display::None) Engine::computeHiddenLayout(*child);

  // 8.5. The container's first baseline comes from its startmost line.
  Opt baseline;
  const FlexLine* first = lines.empty() ? nullptr : (c.isWrapReverse ? &lines.back() : &lines.front());
  if (first && first->size() > 0) {
    if (c.isColumn) {
      baseline = (isReverse(c.dir) ? first->end - 1 : first->begin)->baseline;
    } else {
      const FlexItem* chosen = first->begin;
      for (FlexItem* it = first->begin; it != first->end; ++it)
        if (it->participatesInBaselineAlignment(c.dir)) {
          chosen = it;
          break;
        }
      baseline = chosen->baseline;
    }
  }

  LayoutOutput output;
  output.size = c.containerSize;
  output.contentSize = c.containerSize;
  output.firstBaseline = baseline;
  return output;
}

} // namespace

LayoutOutput Engine::computeFlexboxLayout(Node& node, const LayoutInput& input) {
  const Style& style = node.style;
  const Opt aspectRatio = style.aspectRatio;
  const Edges padding = resolvePadding(style, input.parentSize.width);
  const Edges border = resolveBorder(style, input.parentSize.width);
  const Size paddingBorder = (padding + border).sums();
  const Size adjustment = boxSizingAdjustment(style, padding, border);

  const OptSize minSize =
      maybeAdd(applyAspectRatio(resolveSize(style.minSize, input.parentSize), aspectRatio), adjustment);
  const OptSize maxSize =
      maybeAdd(applyAspectRatio(resolveSize(style.maxSize, input.parentSize), aspectRatio), adjustment);
  const OptSize clampedStyleSize =
      input.sizingMode == SizingMode::InherentSize
          ? maybeClamp(maybeAdd(applyAspectRatio(resolveSize(style.size, input.parentSize), aspectRatio), adjustment),
                       minSize, maxSize)
          : OptSize{};

  // Min and max that meet determine the size in that axis.
  const auto meet = [](Opt min, Opt max) { return min && max && *max <= *min ? min : Opt{}; };
  const OptSize minMaxDefinite{meet(minSize.width, maxSize.width), meet(minSize.height, maxSize.height)};
  // The container is at least as large as its padding and border.
  const OptSize known =
      orElse(input.knownDimensions, maybeMax(orElse(minMaxDefinite, clampedStyleSize), some(paddingBorder)));

  if (input.runMode == RunMode::ComputeSize) {
    if (known.width && known.height) {
      LayoutOutput output;
      output.size = {*known.width, *known.height};
      output.contentSize = output.size;
      return output;
    }
    if (input.axis == RequestedAxis::Horizontal && known.width) {
      LayoutOutput output;
      output.size = {*known.width, 0};
      output.contentSize = output.size;
      return output;
    }
  }

  // Definiteness applies only to dimensions the parent passed in.
  LayoutInput preliminary = input;
  preliminary.knownDimensions = known;
  preliminary.knownDimensionsAreDefinite = {
      input.knownDimensionsAreDefinite.width || !input.knownDimensions.width,
      input.knownDimensionsAreDefinite.height || !input.knownDimensions.height,
  };

  // Kuito's ScrollView: its content is laid out without a limit along the
  // scrolling axis in every pass, so sizing a rail never squeezes its items.
  // The node keeps the size it is given and reports the content's.
  if (style.scrolls) {
    const FlexDirection dir = style.flexDirection;
    LayoutInput content = preliminary;
    setMain(content.knownDimensions, dir, Opt{});
    setMain(content.availableSpace, dir, AvailableSpace::maxContent());
    // A size of its own, not one from its content, is a basis for percentages.
    const Opt scrollMain = mainOf(preliminary.knownDimensionsAreDefinite, dir) ? mainOf(known, dir) : Opt{};
    LayoutOutput output = computePreliminary(node, content, true, scrollMain);
    output.contentSize = output.size;
    output.size = unwrapOr(known, output.size);
    return output;
  }

  return computePreliminary(node, preliminary, false, Opt{});
}

} // namespace kuito::layout
