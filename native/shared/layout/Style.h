#pragma once
// The CSS flexbox vocabulary the engine lays out: lengths, alignment keywords
// and a node's style.
//
// Modelled on Taffy's style types (https://github.com/DioxusLabs/taffy,
// src/style), MIT License, Copyright (c) 2018 Visly Inc. and Taffy Authors.
// See LICENSE-taffy in this directory.
#include "Geometry.h"
#include <cstdint>

namespace kuito::layout {

/// A size: auto, points, a percentage, or a CSS sizing keyword.
struct Dimension {
  enum Kind : std::uint8_t {
    Auto,
    Points,
    Percent, // value is a fraction: 50% is 0.5
    MinContent,
    MaxContent,
    FitContent,        // fit-content: stretch-fit clamped by content
    FitContentPoints,  // fit-content(<length>)
    FitContentPercent, // fit-content(<percentage>)
    Stretch,
    Content, // flex-basis: content
  };
  Kind kind = Auto;
  float value = 0;

  static Dimension autoValue() { return {}; }
  static Dimension points(float v) { return {Points, v}; }
  static Dimension percent(float fraction) { return {Percent, fraction}; }

  bool isAuto() const { return kind == Auto; }
  bool isContent() const { return kind == Content; }
  bool isStretch() const { return kind == Stretch; }
  bool isSizingKeyword() const { return kind >= MinContent && kind <= Stretch; }

  /// Points, or a percentage of `basis`; None for auto, keywords and an unknown basis.
  Opt resolve(Opt basis) const {
    if (kind == Points) return value;
    if (kind == Percent && basis) return *basis * value;
    return std::nullopt;
  }

  bool operator==(const Dimension& o) const { return kind == o.kind && value == o.value; }
};

/// A margin or inset: points, a percentage, or auto.
using LengthPercentageAuto = Dimension;

/// Padding, border and gap: points or a percentage, never auto.
struct LengthPercentage {
  bool percent = false;
  float value = 0;

  float resolveOrZero(Opt basis) const {
    if (!percent) return value;
    return basis ? *basis * value : 0;
  }
  Opt resolve(Opt basis) const {
    if (!percent) return value;
    return basis ? Opt(*basis * value) : std::nullopt;
  }
};

enum class Display : std::uint8_t { Flex, None };
enum class Position : std::uint8_t { Relative, Absolute };
enum class FlexDirection : std::uint8_t { Row, Column, RowReverse, ColumnReverse };
enum class FlexWrap : std::uint8_t { NoWrap, Wrap, WrapReverse, Balance, BalanceReverse };
enum class BoxSizing : std::uint8_t { BorderBox, ContentBox };
enum class Direction : std::uint8_t { Ltr, Rtl };
enum class Overflow : std::uint8_t { Visible, Clip, Hidden, Scroll };
enum class Safety : std::uint8_t { Default, Safe, Unsafe };

inline bool isRow(FlexDirection d) { return d == FlexDirection::Row || d == FlexDirection::RowReverse; }
inline bool isReverse(FlexDirection d) { return d == FlexDirection::RowReverse || d == FlexDirection::ColumnReverse; }
inline bool isMultiLine(FlexWrap w) { return w != FlexWrap::NoWrap; }
inline bool isWrapReverse(FlexWrap w) { return w == FlexWrap::WrapReverse || w == FlexWrap::BalanceReverse; }
inline bool isBalance(FlexWrap w) { return w == FlexWrap::Balance || w == FlexWrap::BalanceReverse; }
inline bool isScrollContainer(Overflow o) { return o == Overflow::Hidden || o == Overflow::Scroll; }

/// align-items / align-self.
struct AlignItems {
  enum Keyword : std::uint8_t { Normal, Start, End, FlexStart, FlexEnd, Center, Baseline, Stretch, SelfStart, SelfEnd };
  Keyword keyword = Normal;
  Safety safety = Safety::Default;

  bool operator==(const AlignItems& o) const { return keyword == o.keyword && safety == o.safety; }
  bool operator!=(const AlignItems& o) const { return !(*this == o); }
  bool isSafe() const { return safety == Safety::Safe; }
  bool isStretch() const { return keyword == Stretch && safety == Safety::Default; }
  bool isBaseline() const { return keyword == Baseline && safety == Safety::Default; }

  /// self-start/self-end resolved against the container's direction; only
  /// the inline axis can flip.
  AlignItems resolveSelfRelative(Direction item, Direction container, bool axisIsInline) const {
    const bool flip = axisIsInline && item != container;
    Keyword k = keyword;
    if (k == SelfStart) k = flip ? End : Start;
    else if (k == SelfEnd) k = flip ? Start : End;
    return {k, safety};
  }
};

/// align-content / justify-content.
struct AlignContent {
  enum Keyword : std::uint8_t {
    Normal,
    Start,
    End,
    FlexStart,
    FlexEnd,
    Center,
    Stretch,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly
  };
  Keyword keyword = Normal;
  Safety safety = Safety::Default;

  bool operator==(const AlignContent& o) const { return keyword == o.keyword && safety == o.safety; }
};

/// CSS's inline-start and inline-end sides, each unset or a value that wins
/// over the physical side it lands on.
template <typename T>
struct InlineEdges {
  std::optional<T> start;
  std::optional<T> end;

  /// `physical` with the set sides on the left and right that `direction` puts them.
  Rect<T> over(Rect<T> physical, Direction direction) const {
    const bool rtl = direction == Direction::Rtl;
    if (const auto& left = rtl ? end : start) physical.left = *left;
    if (const auto& right = rtl ? start : end) physical.right = *right;
    return physical;
  }
};

struct Style {
  Display display = Display::Flex;
  Position position = Position::Relative;
  // The direction the node lays out in: its own, else its parent's (Node
  // keeps it current). The algorithm reads only this one.
  Direction direction = Direction::Ltr;
  BoxSizing boxSizing = BoxSizing::BorderBox;
  Point2<Overflow> overflow{Overflow::Visible, Overflow::Visible};
  float scrollbarWidth = 0;

  Size2<Dimension> size;
  Size2<Dimension> minSize;
  Size2<Dimension> maxSize;
  Opt aspectRatio; // width / height

  Rect<LengthPercentageAuto> inset;
  Rect<LengthPercentageAuto> margin{Dimension::points(0), Dimension::points(0), Dimension::points(0),
                                    Dimension::points(0)};
  Rect<LengthPercentage> padding;
  Rect<LengthPercentage> border;
  Size2<LengthPercentage> gap; // width is column-gap, height is row-gap

  FlexDirection flexDirection = FlexDirection::Row;
  FlexWrap flexWrap = FlexWrap::NoWrap;
  std::uint16_t flexLineCount = 1;
  float flexGrow = 0;
  float flexShrink = 1;
  Dimension flexBasis;

  AlignItems alignItems;
  std::optional<AlignItems> alignSelf; // none is `auto`: defer to the parent's align-items
  AlignContent alignContent;
  AlignContent justifyContent;

  // Kuito extensions, outside CSS:
  // The `direction` prop; unset inherits, as CSS's does.
  std::optional<Direction> ownDirection;
  // padding-inline-start and its kin, resolved against `direction` by the
  // accessors below; the algorithm reads sides through them only.
  InlineEdges<LengthPercentage> paddingInline;
  InlineEdges<LengthPercentageAuto> marginInline;
  InlineEdges<LengthPercentageAuto> insetInline;
  // Padding the platform adds on top of `padding`, e.g. a safe-area inset.
  Edges extraPadding;
  // The main axis scrolls like a React Native ScrollView: children are laid
  // out without a limit along it, and the node reports the content size.
  bool scrolls = false;

  Rect<LengthPercentage> paddingSides() const { return paddingInline.over(padding, direction); }
  Rect<LengthPercentageAuto> marginSides() const { return marginInline.over(margin, direction); }
  Rect<LengthPercentageAuto> insetSides() const { return insetInline.over(inset, direction); }
};

} // namespace kuito::layout
