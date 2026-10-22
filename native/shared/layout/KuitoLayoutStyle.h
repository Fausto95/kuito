#pragma once
#include "../PropKeys.generated.h"
#include "FlexLayout.h"
#include <cstdint>
#include <string>
#include <string_view>

// Kuito's layout vocabulary on top of the generic engine: each view kind's
// default style, and the layout props by key. Shared by every renderer so
// iOS and Android lay out the same tree identically.
namespace kuito::layout {

// A layout prop's value as the host batch typed it (native/shared/Wire.h),
// read in place: nothing is copied or looked up by name on the way in.
struct LayoutValue {
  enum class Kind : std::uint8_t {
    // Resets the prop to the kind's default.
    Null,
    // A number; a boolean as 0 or 1.
    Number,
    // A length as written: "50%", "auto", "fit-content(120)", or a number's digits.
    Text,
    // The index of the value among the prop's manifest values.
    Enum,
  };
  Kind kind = Kind::Null;
  double number = 0;
  std::int32_t index = 0;
  std::string_view text;

  static LayoutValue null() { return {}; }
  static LayoutValue of(double number) { return {Kind::Number, number, 0, {}}; }
  static LayoutValue length(std::string_view text) { return {Kind::Text, 0, 0, text}; }
  static LayoutValue choice(std::int32_t index) { return {Kind::Enum, 0, index, {}}; }
};

struct KindLayout {
  Style style;
  // The platform sizes this kind (text, controls) through Node::measure.
  bool measured = false;
};

// Throws std::invalid_argument for a kind Kuito does not have.
const KindLayout& kindLayout(const std::string& kind);

// Whether the engine applies the prop: the manifest's layout props and the
// decoration props that lay out too (a border, overflow).
bool isLayoutProperty(PropKey key);

// Throws std::invalid_argument naming the prop for one the engine does not
// apply or an invalid value. `defaults` is the kind's style, restored by a
// null value.
void setLayoutProperty(Style& style, const Style& defaults, PropKey key, const LayoutValue& value);

} // namespace kuito::layout
