#pragma once
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

namespace kuito {

/// Plain data as JavaScript wrote it into the host batch (docs/native-scheduling.md):
/// what JSON would hold, decoded once without JSON. A struct keeps its fields in
/// the order they were written.
struct PlainValue {
  enum class Kind : unsigned char { Null, Number, Boolean, Text, List, Struct };
  Kind kind = Kind::Null;
  /// Number, or Boolean as 0 or 1.
  double number = 0;
  std::string text;
  std::vector<PlainValue> items;
  std::vector<std::pair<std::string, PlainValue>> fields;

  /// A struct's field named `name`, or nullptr.
  const PlainValue* field(const std::string& name) const {
    for (const auto& [key, value] : fields)
      if (key == name) return &value;
    return nullptr;
  }
};

namespace plain {

inline void quote(std::string& out, const std::string& text) {
  static const char* const hex = "0123456789abcdef";
  out += '"';
  for (const char c : text) {
    const auto byte = static_cast<unsigned char>(c);
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (byte < 0x20) {
      out += "\\u00";
      out += hex[byte >> 4];
      out += hex[byte & 0xf];
    } else {
      out += c;
    }
  }
  out += '"';
}

} // namespace plain

/// `value` as JSON text: for what still takes JSON, a module view's object prop.
inline void writeJson(std::string& out, const PlainValue& value);

inline std::string toJson(const PlainValue& value) {
  std::string out;
  writeJson(out, value);
  return out;
}

inline void writeJson(std::string& out, const PlainValue& value) {
  switch (value.kind) {
  case PlainValue::Kind::Null: out += "null"; return;
  case PlainValue::Kind::Boolean: out += value.number != 0 ? "true" : "false"; return;
  case PlainValue::Kind::Number: {
    // The kernel writes a number JSON cannot hold as null: every number here is finite.
    char shortest[32];
    std::snprintf(shortest, sizeof shortest, "%.17g", value.number);
    out += shortest;
    return;
  }
  case PlainValue::Kind::Text: plain::quote(out, value.text); return;
  case PlainValue::Kind::List:
    out += '[';
    for (std::size_t i = 0; i < value.items.size(); ++i) {
      if (i) out += ',';
      writeJson(out, value.items[i]);
    }
    out += ']';
    return;
  case PlainValue::Kind::Struct:
    out += '{';
    for (std::size_t i = 0; i < value.fields.size(); ++i) {
      if (i) out += ',';
      plain::quote(out, value.fields[i].first);
      out += ':';
      writeJson(out, value.fields[i].second);
    }
    out += '}';
    return;
  }
}

} // namespace kuito
