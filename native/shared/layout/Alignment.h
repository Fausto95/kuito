#pragma once
// CSS Box Alignment shared by justify-content and align-content.
//
// Ported from Taffy (https://github.com/DioxusLabs/taffy,
// src/compute/common/alignment.rs), MIT License, Copyright (c) 2018 Visly
// Inc. and Taffy Authors. See LICENSE-taffy in this directory.
#include "Style.h"
#include <cstddef>

namespace kuito::layout {

/// The positional keyword a content alignment falls back to: distributed
/// keywords with one item or no free space become positional (and safe), and
/// safe alignment that overflows becomes start.
/// `normal` must already be resolved to the keyword it behaves as.
inline AlignContent::Keyword alignmentFallback(float freeSpace, std::size_t count, AlignContent mode) {
  AlignContent::Keyword keyword = mode.keyword == AlignContent::Normal ? AlignContent::Stretch : mode.keyword;
  bool safe = mode.safety == Safety::Safe;

  if (count <= 1 || freeSpace <= 0) {
    switch (keyword) {
    case AlignContent::Stretch:
    case AlignContent::SpaceBetween:
      keyword = AlignContent::FlexStart;
      safe = true;
      break;
    case AlignContent::SpaceAround:
    case AlignContent::SpaceEvenly:
      keyword = AlignContent::Center;
      safe = true;
      break;
    default: break;
    }
  }

  if (freeSpace <= 0 && safe) keyword = AlignContent::Start;
  return keyword;
}

/// The offset of one item (or line): before the first one, or between it and the previous one.
inline float alignmentOffset(float freeSpace, std::size_t count, float gap, AlignContent::Keyword mode,
                             bool flexReversed, bool isFirst) {
  if (isFirst) {
    switch (mode) {
    case AlignContent::Start: return 0;
    case AlignContent::FlexStart: return flexReversed ? freeSpace : 0;
    case AlignContent::End: return freeSpace;
    case AlignContent::FlexEnd: return flexReversed ? 0 : freeSpace;
    case AlignContent::Center: return freeSpace / 2;
    case AlignContent::Normal:
    case AlignContent::Stretch:
    case AlignContent::SpaceBetween: return 0;
    case AlignContent::SpaceAround: return freeSpace >= 0 ? freeSpace / static_cast<float>(count) / 2 : freeSpace / 2;
    case AlignContent::SpaceEvenly: return freeSpace >= 0 ? freeSpace / static_cast<float>(count + 1) : freeSpace / 2;
    }
    return 0;
  }

  const float free = fmax(freeSpace, 0.0f);
  switch (mode) {
  case AlignContent::SpaceBetween: return gap + free / static_cast<float>(count - 1);
  case AlignContent::SpaceAround: return gap + free / static_cast<float>(count);
  case AlignContent::SpaceEvenly: return gap + free / static_cast<float>(count + 1);
  default: return gap;
  }
}

} // namespace kuito::layout
