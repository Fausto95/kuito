// Ported from Taffy (https://github.com/DioxusLabs/taffy, src/compute/oof.rs
// and src/compute/common/sizing_keyword.rs), MIT License, Copyright (c) 2018
// Visly Inc. and Taffy Authors. See LICENSE-taffy in this directory.
#include "Absolute.h"
#include "SizingKeyword.h"
#include <limits>

namespace kuito::layout {
namespace {

float alignInLine(Line<float> container, float size, StaticEdge edge) {
  switch (edge) {
  case StaticEdge::Start: return container.start;
  case StaticEdge::End: return container.end - size;
  case StaticEdge::Center: return (container.start + container.end - size) / 2;
  }
  return container.start;
}

/// A box's self-alignment in one axis, relative to the containing block.
enum class OofAlignment { Normal, Stretch, Start, Center, End };

OofAlignment oofAlignment(AlignItems alignment) {
  switch (alignment.keyword) {
  case AlignItems::Normal: return OofAlignment::Normal;
  case AlignItems::Stretch: return OofAlignment::Stretch;
  case AlignItems::Center: return OofAlignment::Center;
  case AlignItems::End:
  case AlignItems::FlexEnd:
  case AlignItems::SelfEnd: return OofAlignment::End;
  default: return OofAlignment::Start; // the fallback of `baseline` is `start`
  }
}

StaticEdge physicalEdge(OofAlignment alignment, bool reversed) {
  if (alignment == OofAlignment::Center) return StaticEdge::Center;
  const bool end = alignment == OofAlignment::End;
  return end != reversed ? StaticEdge::End : StaticEdge::Start;
}

/// The absolute positioning model in one axis (css-position-3 §4); physical
/// coordinates relative to the start of the inset-resolution area.
struct OofAxis {
  float cbSize;
  Line<Opt> inset;
  Line<Opt> margin;
  AxisStaticPosition staticPosition;
  OofAlignment alignment;
  Safety safety;
  bool isInline;
  bool reversed;
  bool isScrollAxis;

  StaticEdge startEdge() const { return reversed ? StaticEdge::End : StaticEdge::Start; }
  StaticEdge endEdge() const { return reversed ? StaticEdge::Start : StaticEdge::End; }

  /// The inset-modified containing block.
  Line<float> imcb() const {
    Line<float> box;
    StaticEdge weaker;
    if (inset.start && inset.end) {
      box = {*inset.start, cbSize - *inset.end};
      weaker = endEdge();
    } else if (inset.start) {
      box = {*inset.start, cbSize};
      weaker = StaticEdge::End;
    } else if (inset.end) {
      box = {0, cbSize - *inset.end};
      weaker = StaticEdge::Start;
    } else {
      const AxisStaticPosition& sp = staticPosition;
      switch (sp.align.keyword) {
      case StaticEdge::Start: box = {sp.area.start, cbSize}; break;
      case StaticEdge::End: box = {0, sp.area.end}; break;
      case StaticEdge::Center: {
        const float center = (sp.area.start + sp.area.end) / 2;
        const float startDistance = center;
        const float endDistance = cbSize - center;
        box = std::fabs(startDistance) <= std::fabs(endDistance) ? Line<float>{0, 2 * startDistance}
                                                                 : Line<float>{cbSize - 2 * endDistance, cbSize};
        break;
      }
      }
      weaker = endEdge();
    }
    if (box.end < box.start) {
      if (weaker == StaticEdge::Start) box.start = box.end;
      else box.end = box.start;
    }
    return box;
  }

  float stretchFitSize() const {
    const Line<float> box = imcb();
    return fmax(box.end - box.start - margin.start.value_or(0) - margin.end.value_or(0), 0.0f);
  }

  bool isStretchSized() const {
    return inset.start && inset.end && (alignment == OofAlignment::Stretch || alignment == OofAlignment::Normal);
  }

  Line<float> resolveMargins(float size) const {
    const bool bothInsets = inset.start && inset.end;
    const Line<float> box = imcb();
    const float freeSpace = box.end - box.start - size;
    if (margin.start && margin.end) return {*margin.start, *margin.end};
    if (!bothInsets) return {margin.start.value_or(0), margin.end.value_or(0)};
    if (margin.start) return {*margin.start, freeSpace - *margin.start};
    if (margin.end) return {freeSpace - *margin.end, *margin.end};
    if (freeSpace < 0 && isInline) return reversed ? Line<float>{freeSpace, 0} : Line<float>{0, freeSpace};
    return {freeSpace / 2, freeSpace / 2};
  }

  float position(float size, Line<float> m) const {
    const Line<float> box = imcb();
    if (!inset.start && !inset.end) {
      const AxisStaticPosition& sp = staticPosition;
      const float marginBox = size + m.start + m.end;
      const float offset = sp.align.safety == Safety::Safe && marginBox > box.end - box.start
                               ? alignInLine(box, marginBox, startEdge())
                               : alignInLine(sp.area, marginBox, sp.align.keyword);
      return offset + m.start;
    }
    if (inset.start && !inset.end) return box.start + m.start;
    if (!inset.start && inset.end) return box.end - size - m.end;
    if (!margin.start || !margin.end) return box.start + m.start;

    const float marginBox = size + m.start + m.end;
    const float boxSize = box.end - box.start;
    const StaticEdge edge = physicalEdge(alignment, reversed);
    float start;
    switch (safety) {
    case Safety::Unsafe: start = alignInLine(box, marginBox, edge); break;
    case Safety::Safe: start = alignInLine(box, marginBox, marginBox > boxSize ? startEdge() : edge); break;
    case Safety::Default:
    default:
      if (marginBox <= boxSize || alignment == OofAlignment::Normal) {
        start = alignInLine(box, marginBox, edge);
      } else {
        Line<float> limit{fmin(box.start, 0.0f), fmax(box.end, cbSize)};
        if (isScrollAxis) {
          if (reversed) limit.start = -std::numeric_limits<float>::infinity();
          else limit.end = std::numeric_limits<float>::infinity();
        }
        if (marginBox <= limit.end - limit.start) {
          const float aligned = alignInLine(box, marginBox, edge);
          start = fmax(fmin(aligned, limit.end - marginBox), limit.start);
        } else {
          start = alignInLine(limit, marginBox, startEdge());
        }
      }
      break;
    }
    return start + m.start;
  }
};

/// Sizing keywords on an absolute box's width and height fill in its known dimensions.
void resolveAbsoluteSizingKeywords(Node& node, OptSize& known, const Size2<Dimension>& sizeStyle, Size area,
                                   Rect<Opt> inset, Rect<Opt> margin) {
  const Size stretch{
      fmax(area.width - inset.left.value_or(0) - inset.right.value_or(0) - margin.left.value_or(0) -
               margin.right.value_or(0),
           0.0f),
      fmax(area.height - inset.top.value_or(0) - inset.bottom.value_or(0) - margin.top.value_or(0) -
               margin.bottom.value_or(0),
           0.0f),
  };
  const std::optional<KeywordResolution> width =
      known.width ? std::nullopt : resolveSizingKeyword(sizeStyle.width, stretch.width, area.width);
  const std::optional<KeywordResolution> height =
      known.height ? std::nullopt : resolveSizingKeyword(sizeStyle.height, stretch.height, area.height);
  const OptSize parent = some(area);

  if (width && height && width->measure && height->measure) {
    const Size measured =
        Engine::measureChildSizeBoth(node, {}, parent, {*width->measure, *height->measure}, SizingMode::ContentSize);
    known = some(measured);
    return;
  }
  if (width) {
    known.width = width->exact ? *width->exact
                               : Engine::measureChildSize(node, known, parent,
                                                          {*width->measure, AvailableSpace::definite(stretch.height)},
                                                          SizingMode::ContentSize, true);
  }
  if (height) {
    const AvailableSpace availableWidth =
        known.width ? AvailableSpace::definite(*known.width) : AvailableSpace::definite(stretch.width);
    known.height = height->exact ? *height->exact
                                 : Engine::measureChildSize(node, known, parent, {availableWidth, *height->measure},
                                                            SizingMode::ContentSize, false);
  }
}

} // namespace

void layoutAbsoluteChild(Node& child, Point2<AxisStaticPosition> staticPosition, Size areaSize, Point areaOffset,
                         Direction direction, Point2<Overflow> containerOverflow) {
  const Style& style = child.style;
  const float areaWidth = areaSize.width;
  const float areaHeight = areaSize.height;

  const Opt aspectRatio = style.aspectRatio;
  const Rect<LengthPercentageAuto> margins = style.marginSides();
  const Rect<Opt> margin{margins.top.resolve(areaWidth), margins.right.resolve(areaWidth),
                         margins.bottom.resolve(areaWidth), margins.left.resolve(areaWidth)};
  const Edges padding = resolvePadding(style, areaWidth);
  const Edges border = resolveBorder(style, areaWidth);
  const Size paddingBorder = (padding + border).sums();
  const Size adjustment = boxSizingAdjustment(style, padding, border);

  const Rect<LengthPercentageAuto> inset = style.insetSides();
  const Opt left = inset.left.resolve(areaWidth), right = inset.right.resolve(areaWidth);
  const Opt top = inset.top.resolve(areaHeight), bottom = inset.bottom.resolve(areaHeight);

  const OptSize area = some(areaSize);
  const OptSize styleSize = maybeAdd(applyAspectRatio(resolveSize(style.size, area), aspectRatio), adjustment);
  const OptSize minSize =
      maybeMax(orElse(maybeAdd(applyAspectRatio(resolveSize(style.minSize, area), aspectRatio), adjustment),
                      some(paddingBorder)),
               some(paddingBorder));
  const OptSize maxSize = maybeAdd(applyAspectRatio(resolveSize(style.maxSize, area), aspectRatio), adjustment);
  OptSize known = maybeClamp(styleSize, minSize, maxSize);

  // Absolute boxes do not defer to the container's align-items; justify-self is always normal.
  const AlignItems alignSelf =
      style.alignSelf.value_or(AlignItems{}).resolveSelfRelative(style.direction, direction, false);

  // Static positions are relative to the container's border box: make them relative to the area.
  AxisStaticPosition staticX = staticPosition.x;
  AxisStaticPosition staticY = staticPosition.y;
  staticX.area = {staticX.area.start - areaOffset.x, staticX.area.end - areaOffset.x};
  staticY.area = {staticY.area.start - areaOffset.y, staticY.area.end - areaOffset.y};

  const OofAxis horizontal{areaWidth,
                           {left, right},
                           {margin.left, margin.right},
                           staticX,
                           OofAlignment::Normal,
                           Safety::Default,
                           true,
                           direction == Direction::Rtl,
                           isScrollContainer(containerOverflow.x)};
  const OofAxis vertical{areaHeight,
                         {top, bottom},
                         {margin.top, margin.bottom},
                         staticY,
                         oofAlignment(alignSelf),
                         alignSelf.safety,
                         false,
                         false,
                         isScrollContainer(containerOverflow.y)};
  const Size stretchFit{horizontal.stretchFitSize(), vertical.stretchFitSize()};
  const SpaceSize available{AvailableSpace::definite(maybeClamp(stretchFit.width, minSize.width, maxSize.width)),
                            AvailableSpace::definite(maybeClamp(stretchFit.height, minSize.height, maxSize.height))};

  if (style.size.width.isSizingKeyword() || style.size.height.isSizingKeyword()) {
    resolveAbsoluteSizingKeywords(child, known, style.size, areaSize, {top, right, bottom, left}, margin);
    known = maybeClamp(applyAspectRatio(known, aspectRatio), minSize, maxSize);
  }

  // An auto size is the stretch-fit size when both insets are set and the
  // alignment is normal or stretch; otherwise fit-content, measured below.
  const bool stretchWidth = !known.width && horizontal.isStretchSized();
  const bool stretchHeight = !known.height && vertical.isStretchSized();
  const bool bothExplicitStretch =
      horizontal.alignment == OofAlignment::Stretch && vertical.alignment == OofAlignment::Stretch;
  const Opt stretchRatio = stretchWidth && stretchHeight && bothExplicitStretch ? std::nullopt : aspectRatio;
  if (stretchWidth) {
    known.width = stretchFit.width;
    known = maybeClamp(applyAspectRatio(known, stretchRatio), minSize, maxSize);
  }
  if (!known.height && stretchHeight) {
    known.height = stretchFit.height;
    known = maybeClamp(applyAspectRatio(known, stretchRatio), minSize, maxSize);
  }

  Size finalSize;
  if (known.width && known.height) {
    finalSize = {*known.width, *known.height};
  } else {
    finalSize = unwrapOr(known, Engine::measureChildSizeBoth(child, known, area, available, SizingMode::ContentSize));
  }
  finalSize = maybeClamp(finalSize, minSize, maxSize);

  LayoutInput input;
  input.runMode = RunMode::PerformLayout;
  input.sizingMode = SizingMode::ContentSize;
  input.axis = RequestedAxis::Both;
  input.knownDimensions = some(finalSize);
  input.parentSize = area;
  input.availableSpace = available;
  const LayoutOutput output = Engine::computeChildLayout(child, input);

  const Line<float> horizontalMargin = horizontal.resolveMargins(finalSize.width);
  const Line<float> verticalMargin = vertical.resolveMargins(finalSize.height);

  Layout layout;
  layout.x = horizontal.position(finalSize.width, horizontalMargin) + areaOffset.x;
  layout.y = vertical.position(finalSize.height, verticalMargin) + areaOffset.y;
  layout.width = finalSize.width;
  layout.height = finalSize.height;
  layout.content = output.contentSize;
  layout.padding = padding;
  layout.border = border;
  Engine::setUnroundedLayout(child, layout);
}

} // namespace kuito::layout
