#pragma once
// flex-wrap: balance (https://drafts.csswg.org/css-flexbox-2/#balance-values).
//
// Ported from Taffy (https://github.com/DioxusLabs/taffy, the `balance` module
// of src/compute/flexbox.rs), MIT License, Copyright (c) 2018 Visly Inc. and
// Taffy Authors. See LICENSE-taffy in this directory.
#include <cstddef>
#include <vector>

namespace kuito::layout {

/// How many items go on each line so that the sum of squared line sizes is
/// minimal: as many lines as greedy wrapping makes (at least `minLineCount`),
/// no line over `lineLimit` unless it holds one item, zero-sized items glued
/// to the end of the previous line, and ties giving earlier lines more items.
std::vector<std::size_t> balancedLineItemCounts(const std::vector<float>& itemSizes, float lineLimit, float gap,
                                                std::size_t minLineCount);

} // namespace kuito::layout
