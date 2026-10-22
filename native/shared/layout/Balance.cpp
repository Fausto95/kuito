// Ported from Taffy (https://github.com/DioxusLabs/taffy, the `balance` module
// of src/compute/flexbox.rs), MIT License, Copyright (c) 2018 Visly Inc. and
// Taffy Authors. See LICENSE-taffy in this directory.
//
// A dynamic program over (line count, first item of the remaining suffix),
// accelerated with divide and conquer: O(lines * items * log(items)). It works
// in double so equally balanced divisions compare equal and the tie-break,
// not rounding noise, decides.
#include "Balance.h"
#include <algorithm>
#include <cfloat>
#include <limits>
#include <optional>

namespace kuito::layout {
namespace {

constexpr double kInfeasible = std::numeric_limits<double>::infinity();

// Item sizes floored at zero; an infinite size is clamped so sums stay meaningful.
double toSize(float value) { return std::clamp(static_cast<double>(value), 0.0, static_cast<double>(FLT_MAX)); }

struct LineSizes {
  // Running sums of size + gap, and whether each item is zero-sized.
  std::vector<double> sums;
  std::vector<bool> zero;
  double gap;
  double limit;

  std::size_t count() const { return sums.size(); }
  bool isZero(std::size_t index) const { return zero[index]; }

  double lineSize(std::size_t start, std::size_t end) const {
    const double before = start == 0 ? 0.0 : sums[start - 1];
    return sums[end] - before - gap;
  }

  double lineCost(std::size_t start, std::size_t end) const {
    const double size = lineSize(start, end);
    if (end > start && size > limit) return kInfeasible;
    return size * size;
  }

  // For each suffix start, how many lines greedy wrapping makes of it.
  std::vector<unsigned> suffixGreedyLineCounts() const {
    const std::size_t n = count();
    std::vector<unsigned> counts(n + 1, 0);
    std::size_t lineEnd = n;
    for (std::size_t start = n; start-- > 0;) {
      while (lineEnd > start + 1 && lineSize(start, lineEnd - 1) > limit) --lineEnd;
      counts[start] = 1 + counts[lineEnd];
    }
    return counts;
  }

  // For each start, the last item of the longest line from it that fits.
  std::vector<unsigned> fitEnds() const {
    const std::size_t n = count();
    std::vector<unsigned> ends;
    ends.reserve(n);
    std::size_t fitEnd = 0;
    for (std::size_t start = 0; start < n; ++start) {
      if (fitEnd < start) fitEnd = start;
      while (fitEnd + 1 < n && lineSize(start, fitEnd + 1) <= limit) ++fitEnd;
      ends.push_back(static_cast<unsigned>(fitEnd));
    }
    return ends;
  }
};

struct Row {
  const LineSizes& sizes;
  const std::vector<unsigned>& fitEnds;
  const std::vector<double>& prev;
  const std::vector<unsigned>& nonzeroEnds;
  std::size_t maxEnd;
};

void fillRow(const Row& row, std::vector<double>& cur, unsigned* opts, std::size_t startLo, std::size_t startHi,
             std::size_t colLo, std::size_t colHi) {
  if (startLo > startHi) return;
  const std::size_t start = startLo + (startHi - startLo) / 2;
  const auto firstIt = std::partition_point(row.nonzeroEnds.begin() + static_cast<std::ptrdiff_t>(colLo),
                                            row.nonzeroEnds.begin() + static_cast<std::ptrdiff_t>(colHi),
                                            [&](unsigned end) { return end < start; });
  const std::size_t firstCol = static_cast<std::size_t>(firstIt - row.nonzeroEnds.begin());

  double minCost = kInfeasible;
  std::optional<std::size_t> minCol;
  for (std::size_t col = firstCol; col < colHi; ++col) {
    const std::size_t end = row.nonzeroEnds[col];
    const double lineCost = row.sizes.lineCost(start, end);
    if (lineCost == kInfeasible) break;
    const double cost = lineCost + row.prev[end + 1];
    if (cost <= minCost) {
      minCost = cost;
      minCol = col;
    }
  }

  std::optional<std::size_t> minEnd;
  if (minCol) minEnd = row.nonzeroEnds[*minCol];
  // Gluing a zero-sized item to this line's end, when it fits.
  const std::size_t zeroEnd = std::min<std::size_t>(row.fitEnds[start], row.maxEnd);
  if (row.sizes.isZero(zeroEnd + 1)) {
    const double cost = row.sizes.lineCost(start, zeroEnd) + row.prev[zeroEnd + 1];
    if (cost < minCost || (cost == minCost && (!minEnd || *minEnd < zeroEnd))) {
      minCost = cost;
      minEnd = zeroEnd;
    }
  }

  cur[start] = minCost;
  opts[start] = static_cast<unsigned>(minEnd.value_or(start));

  if (start > startLo) fillRow(row, cur, opts, startLo, start - 1, colLo, minCol ? *minCol + 1 : colHi);
  if (start < startHi) fillRow(row, cur, opts, start + 1, startHi, minCol.value_or(firstCol), colHi);
}

} // namespace

std::vector<std::size_t> balancedLineItemCounts(const std::vector<float>& itemSizes, float lineLimit, float gap,
                                                std::size_t minLineCount) {
  const std::size_t n = itemSizes.size();
  LineSizes sizes;
  sizes.gap = toSize(gap);
  sizes.limit = static_cast<double>(lineLimit);
  double sum = 0;
  for (float raw : itemSizes) {
    const double size = toSize(raw);
    sum += size + sizes.gap;
    sizes.sums.push_back(sum);
    sizes.zero.push_back(size == 0.0);
  }

  const std::vector<unsigned> suffixGreedy = sizes.suffixGreedyLineCounts();
  const std::size_t lineCount = std::max<std::size_t>(suffixGreedy[0], std::clamp<std::size_t>(minLineCount, 1, n));

  std::vector<std::size_t> counts;
  if (lineCount == n) return std::vector<std::size_t>(n, 1);

  const std::vector<unsigned> fitEnds = sizes.fitEnds();
  std::vector<unsigned> nonzeroEnds;
  for (std::size_t end = 0; end + 1 < n; ++end)
    if (!sizes.isZero(end + 1)) nonzeroEnds.push_back(static_cast<unsigned>(end));

  std::vector<double> prev;
  for (std::size_t start = 0; start < n; ++start) prev.push_back(sizes.lineCost(start, n - 1));
  std::vector<double> cur(n, kInfeasible);
  std::vector<unsigned> opts((lineCount - 1) * n, 0);

  for (std::size_t lines = 2; lines <= lineCount; ++lines) {
    const std::size_t maxEnd = n - lines;
    std::size_t firstStart = 0;
    while (firstStart < maxEnd && suffixGreedy[firstStart] > lines) {
      cur[firstStart] = kInfeasible;
      ++firstStart;
    }
    const std::size_t colHi = static_cast<std::size_t>(
        std::partition_point(nonzeroEnds.begin(), nonzeroEnds.end(), [&](unsigned end) { return end <= maxEnd; }) -
        nonzeroEnds.begin());
    const Row row{sizes, fitEnds, prev, nonzeroEnds, maxEnd};
    fillRow(row, cur, opts.data() + (lines - 2) * n, firstStart, maxEnd, 0, colHi);
    std::swap(prev, cur);
  }

  std::size_t start = 0;
  for (std::size_t lines = lineCount; lines >= 2; --lines) {
    const std::size_t end = opts[(lines - 2) * n + start];
    counts.push_back(end - start + 1);
    start = end + 1;
  }
  counts.push_back(n - start);
  return counts;
}

} // namespace kuito::layout
