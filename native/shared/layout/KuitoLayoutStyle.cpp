#include "KuitoLayoutStyle.h"
#include <array>
#include <cstdlib>
#include <cstring>
#include <optional>
#include <stdexcept>
#include <unordered_map>
#include <utility>
#include <vector>

namespace kuito::layout {
namespace {

using Kind = LayoutValue::Kind;
using Setter = void (*)(Style&, const Style&, PropKey, const LayoutValue&);

std::invalid_argument invalid(PropKey key, const std::string& reason) {
  const auto index = static_cast<std::size_t>(key);
  const std::string name = index < kPropCount ? std::string(propInfo(key).name) : "prop " + std::to_string(index);
  return std::invalid_argument("KUITO_LAYOUT_INVALID: " + name + " " + reason);
}

bool isNull(const LayoutValue& value) { return value.kind == Kind::Null; }

/// The whole of `text` as a number, or none.
std::optional<float> parse(std::string_view text) {
  // strtod needs a terminated string: lengths are short, so the stack holds one.
  char buffer[64];
  if (text.empty() || text.size() >= sizeof(buffer)) return std::nullopt;
  std::memcpy(buffer, text.data(), text.size());
  buffer[text.size()] = '\0';
  char* end = nullptr;
  const double parsed = std::strtod(buffer, &end);
  if (end != buffer + text.size()) return std::nullopt;
  return static_cast<float>(parsed);
}

float number(PropKey key, const LayoutValue& value) {
  if (value.kind == Kind::Number) return static_cast<float>(value.number);
  if (value.kind == Kind::Text)
    if (const auto parsed = parse(value.text)) return *parsed;
  throw invalid(key, "expects a number");
}

bool endsWith(std::string_view s, char c) { return !s.empty() && s.back() == c; }

/// A percentage ("50%") as a fraction.
std::optional<float> percent(std::string_view text) {
  if (!endsWith(text, '%')) return std::nullopt;
  const auto parsed = parse(text.substr(0, text.size() - 1));
  return parsed ? std::optional<float>(*parsed / 100) : std::nullopt;
}

/// Points, a percentage, auto, or a sizing keyword.
Dimension dimension(PropKey key, const LayoutValue& value, bool keywords) {
  if (value.kind == Kind::Text) {
    const std::string_view text = value.text;
    if (text == "auto") return Dimension::autoValue();
    if (const auto fraction = percent(text)) return Dimension::percent(*fraction);
    if (keywords) {
      static const std::unordered_map<std::string_view, Dimension::Kind> words{{"min-content", Dimension::MinContent},
                                                                               {"max-content", Dimension::MaxContent},
                                                                               {"fit-content", Dimension::FitContent},
                                                                               {"stretch", Dimension::Stretch},
                                                                               {"content", Dimension::Content}};
      const auto found = words.find(text);
      if (found != words.end()) return {found->second, 0};
      constexpr std::string_view fit = "fit-content(";
      if (text.substr(0, fit.size()) == fit && endsWith(text, ')')) {
        const std::string_view inner = text.substr(fit.size(), text.size() - fit.size() - 1);
        if (const auto fraction = percent(inner)) return {Dimension::FitContentPercent, *fraction};
        if (const auto points = parse(inner)) return {Dimension::FitContentPoints, *points};
      }
    }
  }
  return Dimension::points(number(key, value));
}

LengthPercentage lengthPercentage(PropKey key, const LayoutValue& value) {
  if (value.kind == Kind::Text)
    if (const auto fraction = percent(value.text)) return {true, *fraction};
  return {false, number(key, value)};
}

LengthPercentageAuto lengthPercentageAuto(PropKey key, const LayoutValue& value) {
  return dimension(key, value, false);
}

// --- Enum props -------------------------------------------------------------------

template <typename T>
using Words = std::unordered_map<std::string_view, T>;

template <typename T>
T word(std::string_view text, const Words<T>& words) {
  const auto found = words.find(text);
  if (found == words.end())
    throw std::logic_error("KUITO_LAYOUT_ENUM: the engine has no " + std::string(text) +
                           ": the manifest and native/shared/layout/KuitoLayoutStyle.cpp disagree");
  return found->second;
}

/// "safe center" and "unsafe end" carry an overflow-position modifier.
template <typename A>
A aligned(std::string_view text, const Words<typename A::Keyword>& keywords) {
  for (const auto& [prefix, safety] :
       {std::pair{std::string_view("safe "), Safety::Safe}, std::pair{std::string_view("unsafe "), Safety::Unsafe}})
    if (text.substr(0, prefix.size()) == prefix) return {word(text.substr(prefix.size()), keywords), safety};
  return {word(text, keywords), Safety::Default};
}

/// The engine's value for `Key`'s enum value: its manifest values, each read
/// through `read` once, by index.
template <PropKey Key, typename T, T (*read)(std::string_view)>
const T& choice(const LayoutValue& value) {
  static const std::vector<T> values = [] {
    const PropInfo& info = propInfo(Key);
    std::vector<T> all;
    all.reserve(info.valueCount);
    for (std::size_t index = 0; index < info.valueCount; ++index) all.push_back(read(info.values[index]));
    return all;
  }();
  if (value.kind != Kind::Enum || value.index < 0 || static_cast<std::size_t>(value.index) >= values.size()) {
    const PropInfo& info = propInfo(Key);
    std::string accepted;
    for (std::size_t index = 0; index < info.valueCount; ++index)
      accepted += (index ? ", " : "") + std::string(info.values[index]);
    throw invalid(Key, "expects one of " + accepted + " by its index, got " +
                           (value.kind == Kind::Enum ? "index " + std::to_string(value.index) : "no index"));
  }
  return values[static_cast<std::size_t>(value.index)];
}

const Words<AlignItems::Keyword> itemAlignments{
    {"normal", AlignItems::Normal},        {"start", AlignItems::Start},      {"end", AlignItems::End},
    {"flex-start", AlignItems::FlexStart}, {"flex-end", AlignItems::FlexEnd}, {"center", AlignItems::Center},
    {"baseline", AlignItems::Baseline},    {"stretch", AlignItems::Stretch},  {"self-start", AlignItems::SelfStart},
    {"self-end", AlignItems::SelfEnd},
};

const Words<AlignContent::Keyword> contentAlignments{
    {"normal", AlignContent::Normal},
    {"start", AlignContent::Start},
    {"end", AlignContent::End},
    {"flex-start", AlignContent::FlexStart},
    {"flex-end", AlignContent::FlexEnd},
    {"center", AlignContent::Center},
    {"stretch", AlignContent::Stretch},
    {"space-between", AlignContent::SpaceBetween},
    {"space-around", AlignContent::SpaceAround},
    {"space-evenly", AlignContent::SpaceEvenly},
};

AlignItems itemAlignment(std::string_view text) { return aligned<AlignItems>(text, itemAlignments); }

AlignContent contentAlignment(std::string_view text) { return aligned<AlignContent>(text, contentAlignments); }

/// alignSelf's `auto` is the kind's own alignment: none here.
std::optional<AlignItems> selfAlignment(std::string_view text) {
  if (text == "auto") return std::nullopt;
  return itemAlignment(text);
}

FlexDirection flexDirection(std::string_view text) {
  static const Words<FlexDirection> words{{"row", FlexDirection::Row},
                                          {"column", FlexDirection::Column},
                                          {"row-reverse", FlexDirection::RowReverse},
                                          {"column-reverse", FlexDirection::ColumnReverse}};
  return word(text, words);
}

FlexWrap flexWrap(std::string_view text) {
  static const Words<FlexWrap> words{{"nowrap", FlexWrap::NoWrap},
                                     {"wrap", FlexWrap::Wrap},
                                     {"wrap-reverse", FlexWrap::WrapReverse},
                                     {"balance", FlexWrap::Balance}};
  return word(text, words);
}

Position position(std::string_view text) {
  static const Words<Position> words{{"relative", Position::Relative}, {"absolute", Position::Absolute}};
  return word(text, words);
}

Direction direction(std::string_view text) {
  static const Words<Direction> words{{"ltr", Direction::Ltr}, {"rtl", Direction::Rtl}};
  return word(text, words);
}

BoxSizing boxSizing(std::string_view text) {
  static const Words<BoxSizing> words{{"border-box", BoxSizing::BorderBox}, {"content-box", BoxSizing::ContentBox}};
  return word(text, words);
}

Overflow overflow(std::string_view text) {
  static const Words<Overflow> words{{"visible", Overflow::Visible},
                                     {"hidden", Overflow::Hidden},
                                     {"clip", Overflow::Clip},
                                     {"scroll", Overflow::Scroll}};
  return word(text, words);
}

// --- Setter builders ------------------------------------------------------------

template <Dimension Size2<Dimension>::* Axis, Size2<Dimension> Style::* Field>
void size(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  (style.*Field).*Axis = isNull(value) ? (defaults.*Field).*Axis : dimension(key, value, true);
}

template <LengthPercentageAuto Rect<LengthPercentageAuto>::* Side, Rect<LengthPercentageAuto> Style::* Field>
void edge(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  (style.*Field).*Side = isNull(value) ? (defaults.*Field).*Side : dimension(key, value, false);
}

template <LengthPercentage Rect<LengthPercentage>::* Side>
void paddingSide(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  style.padding.*Side = isNull(value) ? defaults.padding.*Side : lengthPercentage(key, value);
}

template <typename T, InlineEdges<T> Style::* Field, std::optional<T> InlineEdges<T>::* Side,
          T (*read)(PropKey, const LayoutValue&)>
void inlineSide(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  (style.*Field).*Side = isNull(value) ? (defaults.*Field).*Side : std::optional<T>(read(key, value));
}

template <LengthPercentage Size2<LengthPercentage>::* Axis>
void gapAxis(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  style.gap.*Axis = isNull(value) ? defaults.gap.*Axis : lengthPercentage(key, value);
}

template <float Style::* Field>
void factor(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (isNull(value)) {
    style.*Field = defaults.*Field;
    return;
  }
  const float n = number(key, value);
  if (n < 0) throw invalid(key, "must not be negative");
  style.*Field = n;
}

template <PropKey Key, typename T, T Style::* Field, T (*read)(std::string_view)>
void enumerated(Style& style, const Style& defaults, PropKey, const LayoutValue& value) {
  style.*Field = isNull(value) ? defaults.*Field : choice<Key, T, read>(value);
}

void hidden(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  const bool none = isNull(value) ? defaults.display == Display::None : number(key, value) != 0;
  style.display = none ? Display::None : Display::Flex;
}

void ownDirection(Style& style, const Style& defaults, PropKey, const LayoutValue& value) {
  style.ownDirection = isNull(value) ? defaults.ownDirection : choice<PropKey::Direction, Direction, direction>(value);
}

void overflowBoth(Style& style, const Style& defaults, PropKey, const LayoutValue& value) {
  if (isNull(value)) {
    style.overflow = defaults.overflow;
    return;
  }
  const Overflow both = choice<PropKey::Overflow, Overflow, overflow>(value);
  style.overflow = {both, both};
}

void aspectRatio(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (isNull(value)) {
    style.aspectRatio = defaults.aspectRatio;
    return;
  }
  const float ratio = number(key, value);
  if (ratio <= 0) throw invalid(key, "must be greater than 0");
  style.aspectRatio = ratio;
}

void margin(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (isNull(value)) {
    style.margin = defaults.margin;
    return;
  }
  const Dimension m = dimension(key, value, false);
  style.margin = {m, m, m, m};
}

void padding(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (isNull(value)) {
    style.padding = defaults.padding;
    return;
  }
  const LengthPercentage p = lengthPercentage(key, value);
  style.padding = {p, p, p, p};
}

// A uniform border insets the content like padding, as CSS's border box does.
void borderWidth(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (isNull(value)) {
    style.border = defaults.border;
    return;
  }
  const LengthPercentage b{false, number(key, value)};
  style.border = {b, b, b, b};
}

void gap(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (isNull(value)) {
    style.gap = defaults.gap;
    return;
  }
  const LengthPercentage g = lengthPercentage(key, value);
  style.gap = {g, g};
}

void flexLineCount(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (isNull(value)) {
    style.flexLineCount = defaults.flexLineCount;
    return;
  }
  const float n = number(key, value);
  if (n < 1) throw invalid(key, "must be at least 1");
  style.flexLineCount = static_cast<std::uint16_t>(n);
}

void flexBasis(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  style.flexBasis = isNull(value) ? defaults.flexBasis : dimension(key, value, true);
}

// React Native's `flex: n`: grow n, shrink 1, basis 0; `flex: 0` is inflexible.
void flex(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (isNull(value)) {
    style.flexGrow = defaults.flexGrow;
    style.flexShrink = defaults.flexShrink;
    style.flexBasis = defaults.flexBasis;
    return;
  }
  const float n = number(key, value);
  if (n < 0) throw invalid(key, "must not be negative");
  style.flexGrow = n;
  style.flexShrink = n > 0 ? 1 : 0;
  style.flexBasis = n > 0 ? Dimension::points(0) : Dimension::autoValue();
}

void alignSelf(Style& style, const Style& defaults, PropKey, const LayoutValue& value) {
  const std::optional<AlignItems> own =
      isNull(value) ? std::nullopt : choice<PropKey::AlignSelf, std::optional<AlignItems>, selfAlignment>(value);
  style.alignSelf = own ? own : defaults.alignSelf;
}

using Edge = Rect<LengthPercentageAuto>;
using Sizes = Size2<Dimension>;
using AutoInline = InlineEdges<LengthPercentageAuto>;
using PaddingInline = InlineEdges<LengthPercentage>;

/// Each prop the engine applies, by key; null for the rest.
std::array<Setter, kPropCount> table() {
  std::array<Setter, kPropCount> setters{};
  const auto set = [&setters](PropKey key, Setter setter) { setters[static_cast<std::size_t>(key)] = setter; };

  set(PropKey::Hidden, hidden);
  set(PropKey::Position, enumerated<PropKey::Position, Position, &Style::position, position>);
  set(PropKey::Direction, ownDirection);
  set(PropKey::BoxSizing, enumerated<PropKey::BoxSizing, BoxSizing, &Style::boxSizing, boxSizing>);
  set(PropKey::Overflow, overflowBoth);

  set(PropKey::Width, size<&Sizes::width, &Style::size>);
  set(PropKey::Height, size<&Sizes::height, &Style::size>);
  set(PropKey::MinWidth, size<&Sizes::width, &Style::minSize>);
  set(PropKey::MinHeight, size<&Sizes::height, &Style::minSize>);
  set(PropKey::MaxWidth, size<&Sizes::width, &Style::maxSize>);
  set(PropKey::MaxHeight, size<&Sizes::height, &Style::maxSize>);
  set(PropKey::AspectRatio, aspectRatio);

  set(PropKey::Top, edge<&Edge::top, &Style::inset>);
  set(PropKey::Right, edge<&Edge::right, &Style::inset>);
  set(PropKey::Bottom, edge<&Edge::bottom, &Style::inset>);
  set(PropKey::Left, edge<&Edge::left, &Style::inset>);
  set(PropKey::Margin, margin);
  set(PropKey::MarginTop, edge<&Edge::top, &Style::margin>);
  set(PropKey::MarginRight, edge<&Edge::right, &Style::margin>);
  set(PropKey::MarginBottom, edge<&Edge::bottom, &Style::margin>);
  set(PropKey::MarginLeft, edge<&Edge::left, &Style::margin>);
  set(PropKey::MarginInlineStart,
      inlineSide<LengthPercentageAuto, &Style::marginInline, &AutoInline::start, lengthPercentageAuto>);
  set(PropKey::MarginInlineEnd,
      inlineSide<LengthPercentageAuto, &Style::marginInline, &AutoInline::end, lengthPercentageAuto>);
  set(PropKey::InsetInlineStart,
      inlineSide<LengthPercentageAuto, &Style::insetInline, &AutoInline::start, lengthPercentageAuto>);
  set(PropKey::InsetInlineEnd,
      inlineSide<LengthPercentageAuto, &Style::insetInline, &AutoInline::end, lengthPercentageAuto>);

  set(PropKey::Padding, padding);
  set(PropKey::PaddingTop, paddingSide<&Rect<LengthPercentage>::top>);
  set(PropKey::PaddingRight, paddingSide<&Rect<LengthPercentage>::right>);
  set(PropKey::PaddingBottom, paddingSide<&Rect<LengthPercentage>::bottom>);
  set(PropKey::PaddingLeft, paddingSide<&Rect<LengthPercentage>::left>);
  set(PropKey::PaddingInlineStart,
      inlineSide<LengthPercentage, &Style::paddingInline, &PaddingInline::start, lengthPercentage>);
  set(PropKey::PaddingInlineEnd,
      inlineSide<LengthPercentage, &Style::paddingInline, &PaddingInline::end, lengthPercentage>);
  set(PropKey::BorderWidth, borderWidth);

  set(PropKey::Gap, gap);
  set(PropKey::RowGap, gapAxis<&Size2<LengthPercentage>::height>);
  set(PropKey::ColumnGap, gapAxis<&Size2<LengthPercentage>::width>);

  set(PropKey::FlexDirection, enumerated<PropKey::FlexDirection, FlexDirection, &Style::flexDirection, flexDirection>);
  set(PropKey::FlexWrap, enumerated<PropKey::FlexWrap, FlexWrap, &Style::flexWrap, flexWrap>);
  set(PropKey::FlexLineCount, flexLineCount);
  set(PropKey::FlexGrow, factor<&Style::flexGrow>);
  set(PropKey::FlexShrink, factor<&Style::flexShrink>);
  set(PropKey::FlexBasis, flexBasis);
  set(PropKey::Flex, flex);

  set(PropKey::AlignItems, enumerated<PropKey::AlignItems, AlignItems, &Style::alignItems, itemAlignment>);
  set(PropKey::AlignSelf, alignSelf);
  set(PropKey::AlignContent, enumerated<PropKey::AlignContent, AlignContent, &Style::alignContent, contentAlignment>);
  set(PropKey::JustifyContent,
      enumerated<PropKey::JustifyContent, AlignContent, &Style::justifyContent, contentAlignment>);
  return setters;
}

const std::array<Setter, kPropCount> setters = table();

// Kuito's views are flex containers: Stack and its kin stack in a column.
Style column() {
  Style style;
  style.flexDirection = FlexDirection::Column;
  return style;
}

Style row() {
  Style style;
  style.flexDirection = FlexDirection::Row;
  style.alignItems = {AlignItems::Center};
  return style;
}

// Like React Native's ScrollView: it fills the space its parent has left, and
// as a scroll container its automatic minimum size is zero.
Style scrolling(Style style) {
  style.scrolls = true;
  style.flexGrow = 1;
  (isRow(style.flexDirection) ? style.overflow.x : style.overflow.y) = Overflow::Scroll;
  return style;
}

// A native navigation container fills the space its parent has left; its
// screens and tabs are layout roots of their own, sized by the platform.
Style navigation() {
  Style style = column();
  style.flexGrow = 1;
  return style;
}

Style spacer() {
  Style style = column();
  style.flexGrow = 1;
  return style;
}

// Controls are atomic, like replaced elements: they overflow rather than squash.
Style control() {
  Style style = column();
  style.flexShrink = 0;
  return style;
}

Style divider() {
  Style style = column();
  style.minSize.height = Dimension::points(1);
  return style;
}

const std::unordered_map<std::string, KindLayout> kinds{
    {"VStack", {column()}},
    {"Box", {column()}},
    {"Pressable", {column()}},
    {"SafeArea", {column()}},
    {"Sheet", {column()}},
    {"HStack", {row()}},
    {"Scroll", {scrolling(column())}},
    {"HorizontalScroll", {scrolling(row())}},
    // A list's rows are layout roots of their own, so the engine sees a leaf
    // the platform measures: its rows' length along the axis, their height across.
    {"List", {scrolling(column()), true}},
    {"HorizontalList", {scrolling(row()), true}},
    {"ListCell", {column()}},
    {"NavigationStack", {navigation()}},
    {"NavigationTabs", {navigation()}},
    {"NavigationScreen", {column()}},
    {"NavigationTab", {column()}},
    {"Spacer", {spacer()}},
    {"Divider", {divider()}},
    {"Image", {column()}},
    {"Symbol", {column()}},
    {"Text", {column(), true}},
    {"Button", {control(), true}},
    {"TextField", {column(), true}},
    {"MultilineTextField", {column(), true}},
    {"Toggle", {control(), true}},
    {"Spinner", {control(), true}},
};

// A native module's view (`module:<Name>`, docs/native-modules.md#views): an atomic
// leaf sized by its style, since the engine cannot ask a camera or a web view
// for a content size.
const KindLayout moduleView{control()};

} // namespace

const KindLayout& kindLayout(const std::string& kind) {
  if (kind.rfind("module:", 0) == 0) return moduleView;
  const auto found = kinds.find(kind);
  if (found == kinds.end()) throw std::invalid_argument("KUITO_LAYOUT_KIND: no layout defaults for " + kind);
  return found->second;
}

bool isLayoutProperty(PropKey key) {
  return static_cast<std::size_t>(key) < setters.size() && setters[static_cast<std::size_t>(key)];
}

void setLayoutProperty(Style& style, const Style& defaults, PropKey key, const LayoutValue& value) {
  if (!isLayoutProperty(key)) throw invalid(key, "is not a layout property");
  setters[static_cast<std::size_t>(key)](style, defaults, key, value);
}

} // namespace kuito::layout
