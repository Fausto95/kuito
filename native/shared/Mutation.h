#pragma once
#include "PlainValue.h"
#include "PropKeys.generated.h"
#include <cstdint>
#include <string>
#include <vector>

namespace kuito {

/// What a record of the kernel's batch does (src/runtime/wire.ts writes them).
enum class Op : std::uint8_t { Create = 1, Remove, Move, Flatten, Prop, Command, UI, UIScript, UIKernel, UIBundle };

/// The value a prop write carries, typed by the prop's manifest kind.
enum class Value : std::uint8_t { Null, Number, Boolean, Text, Color, Enum, Json, Keys, Struct };

/// One edit of a list's keys, applied to the keys the edits before it left
/// (docs/lists.md#keys). `index` is where the key lands; for a removal, where
/// it is. A move's index counts once the key has left its place.
struct KeyEdit {
  enum class Op : std::uint8_t { Insert, Remove, Move };
  Op op = Op::Insert;
  std::int32_t index = 0;
  std::string key;
};

/// A structured prop's value, checked against its schema and laid out for the
/// renderers' generated value types (PropSchemas.generated.h): numbers and
/// strings in the schema's order.
struct StructRecord {
  std::vector<double> numbers;
  std::vector<std::string> strings;
};

/// A prop the manifest does not list (a native module's view's own): it goes by `name`.
inline constexpr PropKey kNamedProp = static_cast<PropKey>(0xffff);

/// One view mutation, decoded once from the kernel's batch.
///   Create:   id, parent (0 is the root), text = kind, name = label, flattened
///   Remove:   id
///   Move:     id, parent, index
///   Flatten:  id, flattened
///   Prop:     id, key (or kNamedProp and name), kind and its value; Keys in edits,
///             Struct in record (and the value as written in plain)
///   Command:  id (0 is the app), name, text = argument
///   UI:       plain = the list of UI-thread operations
///   UIScript: text = source, name = url: an app's UI bundle
///   UIKernel: text = the hash of the UI kernel to load, the one the shell ships (UIKernel.h)
///   UIBundle: text = the hash of the app's UI bundle to load, the one the shell ships; name = url
struct Mutation {
  Op op = Op::Prop;
  std::uint32_t id = 0;
  std::uint32_t parent = 0;
  std::int32_t index = 0;
  PropKey key = kNamedProp;
  Value kind = Value::Null;
  /// Number, or Boolean as 0 or 1.
  double number = 0;
  /// 0xRRGGBBAA.
  std::uint32_t color = 0;
  /// The index of an Enum among the prop's manifest values.
  std::int32_t enumValue = 0;
  bool flattened = false;
  /// Text and Json. An Enum is its index alone: the renderers read its text from their generated tables.
  std::string text;
  std::string name;
  /// Keys: the edits, in order.
  std::vector<KeyEdit> edits;
  /// Struct: the value laid out by its schema.
  StructRecord record;
  /// UI: the operations; Struct: the value as the kernel wrote it.
  PlainValue plain;
};

} // namespace kuito
