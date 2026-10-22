#pragma once
// The engine's internal protocol: how a container asks a child for its size
// or its layout, shared by the leaf, flexbox and absolute-positioning code.
//
// Ported from Taffy (https://github.com/DioxusLabs/taffy, src/tree/layout.rs
// and src/tree/traits.rs), MIT License, Copyright (c) 2018 Visly Inc. and
// Taffy Authors. See LICENSE-taffy in this directory.
#include "FlexLayout.h"

namespace kuito::layout {

enum class RunMode { PerformLayout, ComputeSize, PerformHiddenLayout };

/// Whether a node's own size styles apply (InherentSize), or only what its
/// parent passes in known_dimensions (ContentSize).
enum class SizingMode { ContentSize, InherentSize };

/// Which side a ComputeSize request needs; a container may skip the other.
enum class RequestedAxis { Horizontal, Vertical, Both };

struct LayoutInput {
  RunMode runMode = RunMode::PerformLayout;
  SizingMode sizingMode = SizingMode::InherentSize;
  RequestedAxis axis = RequestedAxis::Both;
  OptSize knownDimensions;
  // A known dimension derived from the node's own content is indefinite for
  // resolving its children's percentages.
  Size2<bool> knownDimensionsAreDefinite{true, true};
  OptSize parentSize;
  SpaceSize availableSpace;
};

struct LayoutOutput {
  Size size;
  // The scrollable content size of a node that scrolls (Style::scrolls).
  Size contentSize;
  Opt firstBaseline;
};

/// The tree operations the algorithms call; implemented in FlexLayout.cpp.
struct Engine {
  static LayoutOutput computeChildLayout(Node& node, const LayoutInput& input);
  static float measureChildSize(Node& node, OptSize known, OptSize parentSize, SpaceSize available, SizingMode mode,
                                bool horizontal);
  static Size measureChildSizeBoth(Node& node, OptSize known, OptSize parentSize, SpaceSize available, SizingMode mode);
  static void setUnroundedLayout(Node& node, const Layout& layout);
  // Rounds every edge of the subtree to the pixel grid; a scale of 0 keeps points.
  static void roundLayout(Node& node, float scale, float cumulativeX, float cumulativeY);

  static LayoutOutput computeLeafLayout(Node& node, const LayoutInput& input);
  static Size measureLeaf(Node& node, OptSize known, SpaceSize available, Size inset);
  static LayoutOutput computeHiddenLayout(Node& node);
  static LayoutOutput computeFlexboxLayout(Node& node, const LayoutInput& input);
};

/// Padding and border resolve against the containing block's width on every side.
inline Edges resolvePadding(const Style& s, Opt basis) {
  const Rect<LengthPercentage> padding = s.paddingSides();
  return Edges{padding.top.resolveOrZero(basis), padding.right.resolveOrZero(basis),
               padding.bottom.resolveOrZero(basis), padding.left.resolveOrZero(basis)} +
         s.extraPadding;
}

inline Edges resolveBorder(const Style& s, Opt basis) {
  return {s.border.top.resolveOrZero(basis), s.border.right.resolveOrZero(basis), s.border.bottom.resolveOrZero(basis),
          s.border.left.resolveOrZero(basis)};
}

inline Edges resolveMarginOrZero(const Style& s, Opt basis) {
  const Rect<LengthPercentageAuto> margin = s.marginSides();
  return {margin.top.resolve(basis).value_or(0), margin.right.resolve(basis).value_or(0),
          margin.bottom.resolve(basis).value_or(0), margin.left.resolve(basis).value_or(0)};
}

inline OptSize resolveSize(const Size2<Dimension>& d, OptSize basis) {
  return {d.width.resolve(basis.width), d.height.resolve(basis.height)};
}

/// The size a box-sizing: content-box style adds to its sizes.
inline Size boxSizingAdjustment(const Style& s, const Edges& padding, const Edges& border) {
  return s.boxSizing == BoxSizing::ContentBox ? (padding + border).sums() : Size{};
}

/// Taffy's child_first_baseline: a scroll container clamps its baseline to its border box.
inline Opt childFirstBaseline(Opt baseline, float height, Overflow overflowY) {
  if (isScrollContainer(overflowY)) return fmax(fmin(baseline.value_or(height), height), 0.0f);
  return baseline;
}

} // namespace kuito::layout
