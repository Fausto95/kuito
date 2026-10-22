#pragma once
// position: absolute. Like React Native, every node is the containing block
// of its absolutely positioned children, so a container lays them out itself
// once its own size is known.
//
// Ported from Taffy (https://github.com/DioxusLabs/taffy, src/compute/oof.rs),
// MIT License, Copyright (c) 2018 Visly Inc. and Taffy Authors. See
// LICENSE-taffy in this directory.
#include "Engine.h"

namespace kuito::layout {

/// The physical edge a box aligns to.
enum class StaticEdge { Start, End, Center };

struct StaticAlign {
  StaticEdge keyword = StaticEdge::Start;
  Safety safety = Safety::Default;
  // Used instead of `keyword` when a safe alignment overflows.
  StaticEdge fallback = StaticEdge::Start;
};

/// Where an absolute box with auto insets sits in one axis: aligned within an
/// area of its container (relative to the container's border box).
struct AxisStaticPosition {
  Line<float> area;
  StaticAlign align;
};

/// Sizes and places `child` against its container's inset-resolution area
/// (the border box minus borders and scrollbar gutters), and stores its layout
/// relative to the container's border box.
void layoutAbsoluteChild(Node& child, Point2<AxisStaticPosition> staticPosition, Size areaSize, Point areaOffset,
                         Direction direction, Point2<Overflow> containerOverflow);

} // namespace kuito::layout
