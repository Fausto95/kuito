#pragma once
// Geometry for the flexbox engine: sizes, edges and the "maybe" arithmetic on
// optional lengths that the layout algorithm is written in.
//
// Ported from Taffy (https://github.com/DioxusLabs/taffy, src/geometry.rs,
// src/util/math.rs, src/style/available_space.rs), MIT License, Copyright (c)
// 2018 Visly Inc. and Taffy Authors. See LICENSE-taffy in this directory.
#include <cmath>
#include <optional>

namespace kuito::layout {

using Opt = std::optional<float>;

// Rust's f32::min/max: a NaN operand yields the other operand.
inline float fmin(float a, float b) { return std::fmin(a, b); }
inline float fmax(float a, float b) { return std::fmax(a, b); }

// Option<f32> op Option<f32>: None on the left stays None; None on the right is ignored.
inline Opt maybeMin(Opt a, Opt b) { return a && b ? Opt(fmin(*a, *b)) : a; }
inline Opt maybeMax(Opt a, Opt b) { return a && b ? Opt(fmax(*a, *b)) : a; }
inline Opt maybeAdd(Opt a, Opt b) { return a && b ? Opt(*a + *b) : a; }
inline Opt maybeSub(Opt a, Opt b) { return a && b ? Opt(*a - *b) : a; }
inline Opt maybeClamp(Opt value, Opt min, Opt max) {
  if (!value) return value;
  float v = *value;
  if (max) v = fmin(v, *max);
  if (min) v = fmax(v, *min);
  return v;
}

// Option<f32> op f32
inline Opt maybeMin(Opt a, float b) { return a ? Opt(fmin(*a, b)) : a; }
inline Opt maybeMax(Opt a, float b) { return a ? Opt(fmax(*a, b)) : a; }
inline Opt maybeAdd(Opt a, float b) { return a ? Opt(*a + b) : a; }
inline Opt maybeSub(Opt a, float b) { return a ? Opt(*a - b) : a; }

// f32 op Option<f32>
inline float maybeMin(float a, Opt b) { return b ? fmin(a, *b) : a; }
inline float maybeMax(float a, Opt b) { return b ? fmax(a, *b) : a; }
inline float maybeAdd(float a, Opt b) { return b ? a + *b : a; }
inline float maybeSub(float a, Opt b) { return b ? a - *b : a; }
inline float maybeClamp(float v, Opt min, Opt max) {
  if (max) v = fmin(v, *max);
  if (min) v = fmax(v, *min);
  return v;
}

/// The space a node may take in one axis: a length, or a min/max-content constraint.
struct AvailableSpace {
  enum Kind { Definite, MinContent, MaxContent };
  Kind kind = MaxContent;
  float value = 0;

  static AvailableSpace definite(float value) { return {Definite, value}; }
  static AvailableSpace minContent() { return {MinContent, 0}; }
  static AvailableSpace maxContent() { return {MaxContent, 0}; }
  // Rust's `From<Option<f32>>`: an absent length is a max-content constraint.
  static AvailableSpace from(Opt value) { return value ? definite(*value) : maxContent(); }

  bool isDefinite() const { return kind == Definite; }
  Opt option() const { return kind == Definite ? Opt(value) : std::nullopt; }
  float unwrapOr(float fallback) const { return kind == Definite ? value : fallback; }
  AvailableSpace maybeSet(Opt v) const { return v ? definite(*v) : *this; }
  template <typename F>
  AvailableSpace mapDefinite(F f) const {
    return kind == Definite ? definite(f(value)) : *this;
  }

  AvailableSpace maybeSub(float v) const {
    return mapDefinite([&](float x) { return x - v; });
  }
  AvailableSpace maybeSub(Opt v) const { return v ? maybeSub(*v) : *this; }
  AvailableSpace maybeMax(float v) const {
    return mapDefinite([&](float x) { return fmax(x, v); });
  }
  AvailableSpace maybeMax(Opt v) const { return v ? maybeMax(*v) : *this; }
  AvailableSpace maybeMin(Opt v) const {
    if (!v) return *this;
    return kind == Definite ? definite(fmin(value, *v)) : definite(*v);
  }
  AvailableSpace maybeClamp(Opt min, Opt max) const {
    return mapDefinite([&](float x) { return layout::maybeClamp(x, min, max); });
  }

  bool operator==(const AvailableSpace& other) const {
    return kind == other.kind && (kind != Definite || value == other.value);
  }
  bool operator!=(const AvailableSpace& other) const { return !(*this == other); }
};

template <typename T>
struct Size2 {
  T width{};
  T height{};

  bool operator==(const Size2& o) const { return width == o.width && height == o.height; }
  bool operator!=(const Size2& o) const { return !(*this == o); }
};

/// A width and a height in points.
using Size = Size2<float>;
using OptSize = Size2<Opt>;
using SpaceSize = Size2<AvailableSpace>;

template <typename T>
struct Point2 {
  T x{};
  T y{};
};

using Point = Point2<float>;

/// Top, right, bottom and left values, as CSS lists them.
template <typename T>
struct Rect {
  T top{};
  T right{};
  T bottom{};
  T left{};

  T horizontal() const { return left + right; }
  T vertical() const { return top + bottom; }
  Size2<T> sums() const { return {horizontal(), vertical()}; }
  bool operator==(const Rect& o) const {
    return top == o.top && right == o.right && bottom == o.bottom && left == o.left;
  }
};

using Edges = Rect<float>;

inline Edges operator+(const Edges& a, const Edges& b) {
  return {a.top + b.top, a.right + b.right, a.bottom + b.bottom, a.left + b.left};
}

/// A start and an end along one axis.
template <typename T>
struct Line {
  T start{};
  T end{};
};

inline OptSize maybeMax(OptSize a, OptSize b) { return {maybeMax(a.width, b.width), maybeMax(a.height, b.height)}; }
inline OptSize maybeMin(OptSize a, OptSize b) { return {maybeMin(a.width, b.width), maybeMin(a.height, b.height)}; }
inline OptSize maybeAdd(OptSize a, Size b) { return {maybeAdd(a.width, b.width), maybeAdd(a.height, b.height)}; }
inline OptSize maybeSub(OptSize a, Size b) { return {maybeSub(a.width, b.width), maybeSub(a.height, b.height)}; }
inline OptSize maybeClamp(OptSize v, OptSize min, OptSize max) {
  return {maybeClamp(v.width, min.width, max.width), maybeClamp(v.height, min.height, max.height)};
}
inline Size maybeClamp(Size v, OptSize min, OptSize max) {
  return {maybeClamp(v.width, min.width, max.width), maybeClamp(v.height, min.height, max.height)};
}
inline Size maybeMax(Size v, OptSize min) { return {maybeMax(v.width, min.width), maybeMax(v.height, min.height)}; }
// Rust's Option::or per axis.
inline OptSize orElse(OptSize a, OptSize b) { return {a.width ? a.width : b.width, a.height ? a.height : b.height}; }
inline Size unwrapOr(OptSize a, Size b) { return {a.width.value_or(b.width), a.height.value_or(b.height)}; }
inline OptSize some(Size s) { return {s.width, s.height}; }

// A known side transfers through the aspect ratio (width / height) to an unknown one.
inline OptSize applyAspectRatio(OptSize s, Opt ratio) {
  if (!ratio) return s;
  if (s.width && !s.height) return {s.width, *s.width / *ratio};
  if (!s.width && s.height) return {*s.height * *ratio, s.height};
  return s;
}

inline SpaceSize maybeSet(SpaceSize s, OptSize v) { return {s.width.maybeSet(v.width), s.height.maybeSet(v.height)}; }
inline OptSize options(SpaceSize s) { return {s.width.option(), s.height.option()}; }

} // namespace kuito::layout
