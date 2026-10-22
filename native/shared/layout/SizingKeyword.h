#pragma once
// min-content, max-content, fit-content and stretch on width, height and flex-basis.
//
// Ported from Taffy (https://github.com/DioxusLabs/taffy,
// src/compute/common/sizing_keyword.rs), MIT License, Copyright (c) 2018
// Visly Inc. and Taffy Authors. See LICENSE-taffy in this directory.
#include "Style.h"

namespace kuito::layout {

/// A keyword resolves either to an exact size or to a constraint to measure under.
struct KeywordResolution {
  std::optional<float> exact;
  std::optional<AvailableSpace> measure;
};

/// `stretchSize` is the available space minus margins; `percentBasis` is what
/// fit-content(<percentage>) resolves against. None when `style` is not a
/// keyword or cannot resolve here, in which case it behaves as auto.
inline std::optional<KeywordResolution> resolveSizingKeyword(Dimension style, Opt stretchSize, Opt percentBasis) {
  switch (style.kind) {
  case Dimension::MinContent: return KeywordResolution{std::nullopt, AvailableSpace::minContent()};
  case Dimension::MaxContent: return KeywordResolution{std::nullopt, AvailableSpace::maxContent()};
  case Dimension::FitContentPoints: return KeywordResolution{std::nullopt, AvailableSpace::definite(style.value)};
  case Dimension::FitContentPercent:
    if (!percentBasis) return std::nullopt;
    return KeywordResolution{std::nullopt, AvailableSpace::definite(*percentBasis * style.value)};
  case Dimension::FitContent:
    if (!stretchSize) return std::nullopt;
    return KeywordResolution{std::nullopt, AvailableSpace::definite(*stretchSize)};
  case Dimension::Stretch:
    if (!stretchSize) return std::nullopt;
    return KeywordResolution{*stretchSize, std::nullopt};
  default: return std::nullopt;
  }
}

} // namespace kuito::layout
