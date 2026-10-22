#pragma once
#include "HexColor.h"
#include "Mutation.h"
#include "Schema.h"
#include <cstddef>
#include <climits>
#include <cstdint>
#include <cstring>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace kuito {

/// A value as JavaScript passed it, before the prop's kind types it. Struct
/// and List are plain data the kernel writes field by field
/// (docs/native-scheduling.md); Json, JSON text, is what recordings made
/// before them hold.
struct RawValue {
  enum class Tag : std::uint8_t { Null, Number, False, True, Text, Json, Keys, Struct, List };
  Tag tag = Tag::Null;
  double number = 0;
  std::string text;
  std::vector<KeyEdit> edits;
  /// Struct and List.
  PlainValue plain;
};

namespace wire {

[[noreturn]] inline void reject(std::string_view prop, std::string_view expected, const RawValue& raw) {
  std::string got;
  switch (raw.tag) {
  case RawValue::Tag::Null: got = "null"; break;
  case RawValue::Tag::Number: got = "a number"; break;
  case RawValue::Tag::False:
  case RawValue::Tag::True: got = "a boolean"; break;
  case RawValue::Tag::Text: got = "\"" + raw.text + "\""; break;
  case RawValue::Tag::Json: got = "an object"; break;
  case RawValue::Tag::Keys: got = "a key diff"; break;
  case RawValue::Tag::Struct: got = "an object"; break;
  case RawValue::Tag::List: got = "a list"; break;
  }
  throw std::invalid_argument("KUITO_PROP_INVALID: " + std::string(prop) + " expects " + std::string(expected) +
                              ", got " + got);
}

inline bool isBoolean(const RawValue& raw) { return raw.tag == RawValue::Tag::False || raw.tag == RawValue::Tag::True; }

/// A JavaScript number as the text an enum value is written as: 600, not 600.0.
inline std::string numberText(double number) {
  const auto whole = static_cast<long long>(number);
  if (static_cast<double>(whole) == number) return std::to_string(whole);
  return std::to_string(number);
}

} // namespace wire

/// Types `raw` by the prop's manifest kind into `into`: a color parses to
/// 0xRRGGBBAA, an enum to its index. A value of the wrong kind throws.
inline void typeValue(Mutation& into, RawValue raw) {
  using Tag = RawValue::Tag;
  if (raw.tag == Tag::Null) {
    into.kind = Value::Null;
    return;
  }
  if (into.key == kNamedProp) {
    switch (raw.tag) {
    case Tag::Number: into.kind = Value::Number, into.number = raw.number; return;
    case Tag::False:
    case Tag::True: into.kind = Value::Boolean, into.number = raw.tag == Tag::True ? 1 : 0; return;
    case Tag::Text: into.kind = Value::Text, into.text = std::move(raw.text); return;
    case Tag::Json: into.kind = Value::Json, into.text = std::move(raw.text); return;
    // A module view's props are untyped: an object reaches it as JSON.
    case Tag::Struct:
    case Tag::List: into.kind = Value::Json, into.text = toJson(raw.plain); return;
    case Tag::Keys: wire::reject(into.name, "a scalar or JSON", raw);
    case Tag::Null: return;
    }
  }
  const PropInfo& info = propInfo(into.key);
  switch (info.kind) {
  case ValueKind::Number:
    if (raw.tag != Tag::Number) wire::reject(info.name, "a number", raw);
    into.kind = Value::Number, into.number = raw.number;
    return;
  case ValueKind::Boolean:
    if (!wire::isBoolean(raw)) wire::reject(info.name, "a boolean", raw);
    into.kind = Value::Boolean, into.number = raw.tag == Tag::True ? 1 : 0;
    return;
  case ValueKind::String:
    if (raw.tag != Tag::Text) wire::reject(info.name, "a string", raw);
    into.kind = Value::Text, into.text = std::move(raw.text);
    return;
  case ValueKind::Color: {
    const auto color = raw.tag == Tag::Text ? parseHexColor(raw.text) : std::nullopt;
    if (!color) wire::reject(info.name, "a hex color", raw);
    into.kind = Value::Color, into.color = *color;
    return;
  }
  case ValueKind::Enum: {
    const std::string digits = raw.tag == Tag::Number ? wire::numberText(raw.number) : std::string();
    const std::string_view text = raw.tag == Tag::Number ? std::string_view(digits) : std::string_view(raw.text);
    const auto index =
        raw.tag == Tag::Number || raw.tag == Tag::Text ? enumValue(into.key, text) : std::optional<std::int32_t>();
    if (!index) wire::reject(info.name, "one of its enum values", raw);
    into.kind = Value::Enum, into.enumValue = *index;
    return;
  }
  case ValueKind::Length:
  case ValueKind::LengthAuto:
  case ValueKind::Size:
    if (raw.tag == Tag::Number) into.kind = Value::Number, into.number = raw.number;
    else if (raw.tag == Tag::Text) into.kind = Value::Text, into.text = std::move(raw.text);
    else wire::reject(info.name, "a length", raw);
    return;
  case ValueKind::Json: {
    // JSON text is what a recording made before structured props holds.
    if (raw.tag == Tag::Json) {
      into.kind = Value::Json, into.text = std::move(raw.text);
      return;
    }
    // Anything else is checked against the prop's schema once, here: a plain
    // string or number some take (an image's URL, a field's count of lines)
    // is one of its variants.
    PlainValue plain;
    switch (raw.tag) {
    case Tag::Number: plain.kind = PlainValue::Kind::Number, plain.number = raw.number; break;
    case Tag::False:
    case Tag::True: plain.kind = PlainValue::Kind::Boolean, plain.number = raw.tag == Tag::True ? 1 : 0; break;
    case Tag::Text: plain.kind = PlainValue::Kind::Text, plain.text = std::move(raw.text); break;
    case Tag::Struct:
    case Tag::List: plain = std::move(raw.plain); break;
    case Tag::Keys:
    case Tag::Null:
    case Tag::Json: wire::reject(info.name, "structured data", raw);
    }
    into.kind = Value::Struct;
    into.record = structRecord(into.key, plain);
    into.plain = std::move(plain);
    return;
  }
  case ValueKind::Keys:
    if (raw.tag != Tag::Keys) wire::reject(info.name, "a key diff", raw);
    into.kind = Value::Keys, into.edits = std::move(raw.edits);
    return;
  }
}

/// A prop write by name, as the UI-thread kernel makes one.
inline Mutation propMutation(std::uint32_t id, std::string_view name, RawValue raw) {
  Mutation change;
  change.op = Op::Prop;
  change.id = id;
  if (auto key = propKey(name)) change.key = *key;
  else change.name = std::string(name);
  typeValue(change, std::move(raw));
  return change;
}

/// Reads the records src/runtime/wire.ts writes: little-endian and packed,
/// strings as indexes into `strings` (docs/native-scheduling.md).
class WireReader {
public:
  WireReader(const std::uint8_t* data, std::size_t length, const std::vector<std::string>& strings)
      : data_(data), length_(length), strings_(strings) {}
  struct Take {};
  /// Takes each string from `strings` rather than copying it: the kernel
  /// names each one once, so a second use of an index is malformed.
  WireReader(Take, const std::uint8_t* data, std::size_t length, std::vector<std::string>& strings)
      : data_(data), length_(length), strings_(strings), owned_(&strings), taken_(strings.size()) {}

  bool done() const { return offset_ == length_; }

  template <class T>
  T scalar() {
    if (length_ - offset_ < sizeof(T)) throw std::invalid_argument("KUITO_WIRE_TRUNCATED: a record ends early");
    T value;
    // The wire is little-endian, as every platform Kuito runs on.
    std::memcpy(&value, data_ + offset_, sizeof(T));
    offset_ += sizeof(T);
    return value;
  }

  std::string text() {
    const auto index = scalar<std::uint32_t>();
    if (index >= strings_.size()) throw std::invalid_argument("KUITO_WIRE_STRING: no string " + std::to_string(index));
    if (!owned_) return strings_[index];
    if (taken_[index])
      throw std::invalid_argument("KUITO_WIRE_STRING: string " + std::to_string(index) + " is named twice");
    taken_[index] = true;
    return std::move((*owned_)[index]);
  }

  RawValue value() {
    RawValue raw;
    const auto tag = scalar<std::uint8_t>();
    if (tag > static_cast<std::uint8_t>(RawValue::Tag::List))
      throw std::invalid_argument("KUITO_WIRE_VALUE: unknown value tag " + std::to_string(tag));
    raw.tag = static_cast<RawValue::Tag>(tag);
    if (raw.tag == RawValue::Tag::Number) raw.number = scalar<double>();
    if (raw.tag == RawValue::Tag::Text || raw.tag == RawValue::Tag::Json) raw.text = text();
    if (raw.tag == RawValue::Tag::Keys) raw.edits = edits();
    if (raw.tag == RawValue::Tag::Struct || raw.tag == RawValue::Tag::List) raw.plain = plain(raw.tag, 0);
    return raw;
  }

  /// A Struct or List, read whole: a count, then each field's name and value,
  /// or each item. Nested no deeper than kPlainDepth.
  PlainValue plain(RawValue::Tag tag, int depth) {
    constexpr int kPlainDepth = 64;
    if (depth >= kPlainDepth)
      throw std::invalid_argument("KUITO_WIRE_VALUE: data nests deeper than " + std::to_string(kPlainDepth));
    PlainValue out;
    const bool isStruct = tag == RawValue::Tag::Struct;
    out.kind = isStruct ? PlainValue::Kind::Struct : PlainValue::Kind::List;
    const auto count = scalar<std::uint32_t>();
    // Every field or item takes at least its tag byte.
    if (count > length_ - offset_) throw std::invalid_argument("KUITO_WIRE_TRUNCATED: data ends early");
    if (isStruct) out.fields.reserve(count);
    else out.items.reserve(count);
    for (std::uint32_t i = 0; i < count; ++i) {
      if (isStruct) {
        auto name = text();
        out.fields.emplace_back(std::move(name), item(depth));
      } else {
        out.items.push_back(item(depth));
      }
    }
    return out;
  }

  /// One field or item of plain data: a scalar, or a Struct or List.
  PlainValue item(int depth) {
    PlainValue out;
    const auto tag = scalar<std::uint8_t>();
    switch (static_cast<RawValue::Tag>(tag)) {
    case RawValue::Tag::Null: return out;
    case RawValue::Tag::Number: out.kind = PlainValue::Kind::Number, out.number = scalar<double>(); return out;
    case RawValue::Tag::False:
    case RawValue::Tag::True:
      out.kind = PlainValue::Kind::Boolean, out.number = tag == static_cast<std::uint8_t>(RawValue::Tag::True);
      return out;
    case RawValue::Tag::Text: out.kind = PlainValue::Kind::Text, out.text = text(); return out;
    case RawValue::Tag::Struct:
    case RawValue::Tag::List: return plain(static_cast<RawValue::Tag>(tag), depth + 1);
    case RawValue::Tag::Json:
    case RawValue::Tag::Keys: break;
    }
    throw std::invalid_argument("KUITO_WIRE_VALUE: tag " + std::to_string(tag) + " inside plain data");
  }

  /// A key diff: a count, then each edit as its op, index and key.
  std::vector<KeyEdit> edits() {
    constexpr std::size_t kEditBytes = 1 + 4 + 4;
    const auto count = scalar<std::uint32_t>();
    if (count > (length_ - offset_) / kEditBytes)
      throw std::invalid_argument("KUITO_WIRE_TRUNCATED: a key diff ends early");
    std::vector<KeyEdit> edits(count);
    for (KeyEdit& edit : edits) {
      const auto op = scalar<std::uint8_t>();
      if (op > static_cast<std::uint8_t>(KeyEdit::Op::Move))
        throw std::invalid_argument("KUITO_WIRE_VALUE: unknown key edit " + std::to_string(op));
      const auto index = scalar<std::uint32_t>();
      if (index > static_cast<std::uint32_t>(INT32_MAX))
        throw std::invalid_argument("KUITO_WIRE_VALUE: key edit index " + std::to_string(index) + " is out of range");
      edit.op = static_cast<KeyEdit::Op>(op);
      edit.index = static_cast<std::int32_t>(index);
      edit.key = text();
    }
    return edits;
  }

  void key(Mutation& into) {
    const auto key = scalar<std::uint16_t>();
    if (key == static_cast<std::uint16_t>(kNamedProp)) into.name = text();
    else if (key >= kPropCount) throw std::invalid_argument("KUITO_WIRE_PROP: no prop key " + std::to_string(key));
    into.key = static_cast<PropKey>(key);
  }

private:
  const std::uint8_t* data_;
  std::size_t length_;
  std::size_t offset_ = 0;
  const std::vector<std::string>& strings_;
  std::vector<std::string>* owned_ = nullptr;
  std::vector<bool> taken_;
};

/// How a batch's records were encoded: Json is what a recording made before
/// plain data holds, its UI operations JSON text (Recording.h).
enum class WireFormat : std::uint8_t { Current, Json };

/// The records `in` reads as typed mutations. Throws std::invalid_argument,
/// naming what was wrong, for a malformed record or a value of the wrong kind.
inline std::vector<Mutation> decodeRecords(WireReader& in, WireFormat format) {
  std::vector<Mutation> batch;
  while (!in.done()) {
    Mutation m;
    const auto op = in.scalar<std::uint8_t>();
    if (op < static_cast<std::uint8_t>(Op::Create) || op > static_cast<std::uint8_t>(Op::UIBundle))
      throw std::invalid_argument("KUITO_WIRE_OP: unknown operation " + std::to_string(op));
    m.op = static_cast<Op>(op);
    switch (m.op) {
    case Op::Create:
      m.id = in.scalar<std::uint32_t>();
      m.parent = in.scalar<std::uint32_t>();
      m.text = in.text();
      m.name = in.text();
      m.flattened = in.scalar<std::uint8_t>() != 0;
      break;
    case Op::Remove: m.id = in.scalar<std::uint32_t>(); break;
    case Op::Move:
      m.id = in.scalar<std::uint32_t>();
      m.parent = in.scalar<std::uint32_t>();
      m.index = static_cast<std::int32_t>(in.scalar<std::uint32_t>());
      break;
    case Op::Flatten:
      m.id = in.scalar<std::uint32_t>();
      m.flattened = in.scalar<std::uint8_t>() != 0;
      break;
    case Op::Prop:
      m.id = in.scalar<std::uint32_t>();
      in.key(m);
      typeValue(m, in.value());
      break;
    case Op::Command:
      m.id = in.scalar<std::uint32_t>();
      m.name = in.text();
      m.text = in.text();
      break;
    case Op::UI: {
      // An old recording's operations are JSON text, which only a runtime would read.
      if (format == WireFormat::Json) {
        m.text = in.text();
        break;
      }
      auto operations = in.value();
      if (operations.tag != RawValue::Tag::List)
        throw std::invalid_argument("KUITO_WIRE_VALUE: UI operations come as a list");
      m.plain = std::move(operations.plain);
      break;
    }
    case Op::UIScript:
    case Op::UIBundle:
      m.text = in.text();
      m.name = in.text();
      break;
    case Op::UIKernel: m.text = in.text(); break;
    }
    batch.push_back(std::move(m));
  }
  return batch;
}

/// The kernel's batch as typed mutations, its strings taken from `strings`.
inline std::vector<Mutation> decodeBatch(const std::uint8_t* data, std::size_t length,
                                         std::vector<std::string>&& strings, WireFormat format = WireFormat::Current) {
  WireReader in(WireReader::Take{}, data, length, strings);
  return decodeRecords(in, format);
}

/// A batch read again, as a recording's: its strings are copied.
inline std::vector<Mutation> decodeBatch(const std::uint8_t* data, std::size_t length,
                                         const std::vector<std::string>& strings,
                                         WireFormat format = WireFormat::Current) {
  WireReader in(data, length, strings);
  return decodeRecords(in, format);
}

} // namespace kuito
