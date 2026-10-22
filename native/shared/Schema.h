#pragma once
// A structured prop's value checked against its schema and laid out for the
// renderers (docs/native-scheduling.md#structured-props), once, as the batch
// is decoded. The schemas are tables src/protocol/manifest.ts generates; the
// renderers' generated value types read the record in the same order:
//   number, integer, boolean, color, enum  one number (a boolean 0 or 1, a
//                                          color 0xRRGGBBAA, an enum its index)
//   string                                 one string
//   optional                               a number, 1 when present, then the value
//   list                                   its count, then each item
//   map                                    its count, then each key (a string) and value
//   struct                                 each field, in the schema's order
//   oneOf                                  the variant's index, then the variant
#include "HexColor.h"
#include "Mutation.h"
#include "PropSchemas.generated.h"
#include <cmath>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>

namespace kuito {
namespace schema {

[[noreturn]] inline void reject(const std::string& path, std::string_view expected, const PlainValue& value) {
  std::string got;
  switch (value.kind) {
  case PlainValue::Kind::Null: got = "null"; break;
  case PlainValue::Kind::Number: got = "a number"; break;
  case PlainValue::Kind::Boolean: got = "a boolean"; break;
  case PlainValue::Kind::Text: got = "\"" + value.text + "\""; break;
  case PlainValue::Kind::List: got = "a list"; break;
  case PlainValue::Kind::Struct: got = "an object"; break;
  }
  throw std::invalid_argument("KUITO_PROP_INVALID: " + path + " expects " + std::string(expected) + ", got " + got);
}

/// `name` after "a" or "an", as its first letter says.
inline std::string article(const char* name) {
  const char first = name[0];
  const bool vowel = first == 'A' || first == 'E' || first == 'I' || first == 'O' || first == 'U';
  return std::string(vowel ? "an " : "a ") + name;
}

inline bool matches(const SchemaVariant& variant, const PlainValue& value) {
  switch (variant.when) {
  case SchemaWhen::String: return value.kind == PlainValue::Kind::Text;
  case SchemaWhen::Number: return value.kind == PlainValue::Kind::Number;
  case SchemaWhen::Boolean: return value.kind == PlainValue::Kind::Boolean;
  case SchemaWhen::List: return value.kind == PlainValue::Kind::List;
  case SchemaWhen::Struct: return value.kind == PlainValue::Kind::Struct;
  case SchemaWhen::Has: return value.kind == PlainValue::Kind::Struct && value.field(variant.field);
  case SchemaWhen::Is: {
    if (value.kind != PlainValue::Kind::Struct) return false;
    const PlainValue* field = value.field(variant.field);
    return field && field->kind == PlainValue::Kind::Text && field->text == variant.is;
  }
  }
  return false;
}

inline void flatten(const PlainValue& value, std::uint16_t node, StructRecord& out, const std::string& path) {
  const SchemaNode& schema = kSchemaNodes[node];
  switch (schema.kind) {
  case SchemaKind::Number:
    if (value.kind != PlainValue::Kind::Number) reject(path, "a number", value);
    out.numbers.push_back(value.number);
    return;
  case SchemaKind::Integer:
    // The renderers read it as a 32-bit Int: a larger one would trap or wrap there.
    if (value.kind != PlainValue::Kind::Number || std::floor(value.number) != value.number ||
        value.number < -2147483648.0 || value.number > 2147483647.0)
      reject(path, "a whole number", value);
    out.numbers.push_back(value.number);
    return;
  case SchemaKind::Boolean:
    if (value.kind != PlainValue::Kind::Boolean) reject(path, "a boolean", value);
    out.numbers.push_back(value.number);
    return;
  case SchemaKind::String:
    if (value.kind != PlainValue::Kind::Text) reject(path, "a string", value);
    out.strings.push_back(value.text);
    return;
  case SchemaKind::Color: {
    const auto color = value.kind == PlainValue::Kind::Text ? parseHexColor(value.text) : std::nullopt;
    if (!color) reject(path, "a hex color", value);
    out.numbers.push_back(static_cast<double>(*color));
    return;
  }
  case SchemaKind::Enum:
    if (value.kind == PlainValue::Kind::Text)
      for (std::uint16_t i = 0; i < schema.count; ++i)
        if (value.text == kSchemaStrings[schema.first + i]) {
          out.numbers.push_back(i);
          return;
        }
    reject(path, std::string("one of ") + schema.name, value);
  case SchemaKind::List:
    if (value.kind != PlainValue::Kind::List) reject(path, "a list", value);
    out.numbers.push_back(static_cast<double>(value.items.size()));
    for (std::size_t i = 0; i < value.items.size(); ++i)
      flatten(value.items[i], schema.first, out, path + "[" + std::to_string(i) + "]");
    return;
  case SchemaKind::Map:
    if (value.kind != PlainValue::Kind::Struct) reject(path, "an object", value);
    out.numbers.push_back(static_cast<double>(value.fields.size()));
    for (const auto& [name, field] : value.fields) {
      out.strings.push_back(name);
      flatten(field, schema.first, out, path + "." + name);
    }
    return;
  case SchemaKind::Struct: {
    if (value.kind != PlainValue::Kind::Struct) reject(path, article(schema.name) + " object", value);
    for (const auto& [name, field] : value.fields) {
      bool known = false;
      for (std::uint16_t i = 0; i < schema.count && !known; ++i) known = name == kSchemaFields[schema.first + i].name;
      if (!known) throw std::invalid_argument("KUITO_PROP_INVALID: " + path + " has no field \"" + name + "\"");
    }
    for (std::uint16_t i = 0; i < schema.count; ++i) {
      const SchemaField& field = kSchemaFields[schema.first + i];
      const PlainValue* given = value.field(field.name);
      const bool present = given && given->kind != PlainValue::Kind::Null;
      if (field.optional) out.numbers.push_back(present ? 1 : 0);
      if (present) flatten(*given, field.node, out, path + "." + field.name);
      else if (!field.optional) throw std::invalid_argument("KUITO_PROP_INVALID: " + path + " needs " + field.name);
    }
    return;
  }
  case SchemaKind::OneOf:
    for (std::uint16_t i = 0; i < schema.count; ++i) {
      const SchemaVariant& variant = kSchemaVariants[schema.first + i];
      if (!matches(variant, value)) continue;
      out.numbers.push_back(i);
      flatten(value, variant.node, out, path);
      return;
    }
    reject(path, article(schema.name), value);
  }
}

} // namespace schema

/// `value` checked against prop `key`'s schema and laid out for its renderers.
/// Throws std::invalid_argument naming the field that does not fit.
static_assert(sizeof(kPropSchemas) / sizeof(kPropSchemas[0]) == kPropCount, "a schema slot for every prop");

inline StructRecord structRecord(PropKey key, const PlainValue& value) {
  const auto node = kPropSchemas[static_cast<std::size_t>(key)];
  const std::string name(propInfo(key).name);
  if (node < 0) throw std::invalid_argument("KUITO_PROP_INVALID: " + name + " has no schema");
  StructRecord record;
  schema::flatten(value, static_cast<std::uint16_t>(node), record, name);
  return record;
}

} // namespace kuito
