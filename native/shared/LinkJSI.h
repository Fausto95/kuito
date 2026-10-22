#pragma once
// Link values to and from JavaScript (native/shared/Link.h), typed by the
// member's signature: a struct's fields are read by the names it declares and
// cross in its order, so no JSON and no property listing is needed. The kernel
// has checked the arguments against the bundle's copy of the same spec, so a
// mismatch here is a shell built from another spec, and fails the call.
#include "Link.h"
#include <cmath>
#include <cstring>
#include <memory>
#include <jsi/jsi.h>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace kuito {
namespace jsi = facebook::jsi;

namespace link {

inline const char* expected(LinkType::Kind kind) {
  switch (kind) {
  case LinkType::Kind::Null: return "null";
  case LinkType::Kind::Number: return "a number";
  case LinkType::Kind::Text:
  case LinkType::Kind::Enum: return "a string";
  case LinkType::Kind::Boolean: return "true or false";
  case LinkType::Kind::Json: return "plain data";
  case LinkType::Kind::Bytes: return "an ArrayBuffer";
  case LinkType::Kind::Nullable: return "a value or null";
  case LinkType::Kind::Array: return "an array";
  case LinkType::Kind::Record:
  case LinkType::Kind::Struct:
  case LinkType::Kind::Reference: return "an object";
  }
  return "a value";
}

[[noreturn]] inline void argumentMismatch(const std::string& at, LinkType::Kind kind) {
  throw LinkMismatch("ERR_ARGUMENT", at + " must be " + expected(kind));
}

/// A platform's bytes as an ArrayBuffer's: JavaScript reads and writes them in place.
class SharedBytes final : public jsi::MutableBuffer {
public:
  explicit SharedBytes(std::shared_ptr<LinkBuffer> bytes) : bytes_(std::move(bytes)) {}
  size_t size() const override { return bytes_->size(); }
  uint8_t* data() override { return bytes_->data(); }
  const std::shared_ptr<LinkBuffer>& bytes() const { return bytes_; }

private:
  std::shared_ptr<LinkBuffer> bytes_;
};

/// An ArrayBuffer's bytes for the platform. One made from a platform's
/// buffer is that buffer. Hermes keeps the bytes of one JavaScript made in
/// its garbage-collected heap, where no other thread may read them, so those
/// are copied once into memory the platform allocates.
inline std::shared_ptr<LinkBuffer> bytesOf(jsi::Runtime& rt, const jsi::ArrayBuffer& buffer,
                                           const LinkAllocate& allocate) {
  if (auto shared = std::dynamic_pointer_cast<SharedBytes>(buffer.tryGetMutableBuffer(rt))) return shared->bytes();
  const auto size = buffer.size(rt);
  auto copy = allocate ? allocate(size) : std::make_shared<LinkBytes>(size);
  if (!copy || copy->size() != size) throw std::runtime_error("The platform allocated no room for an ArrayBuffer");
  if (size) std::memcpy(copy->data(), buffer.data(rt), size);
  return copy;
}

/// Plain data of no declared shape (`Json`): objects by their own keys.
inline LinkValue untyped(jsi::Runtime& rt, const jsi::Value& value, const std::string& at) {
  if (value.isNull() || value.isUndefined()) return {};
  if (value.isBool()) return LinkValue::boolean(value.getBool());
  if (value.isNumber() && std::isfinite(value.asNumber())) return LinkValue::numeric(value.asNumber());
  if (value.isString()) return LinkValue::string(value.asString(rt).utf8(rt));
  if (!value.isObject()) argumentMismatch(at, LinkType::Kind::Json);
  auto object = value.asObject(rt);
  if (object.isFunction(rt)) argumentMismatch(at, LinkType::Kind::Json);
  if (object.isArray(rt)) {
    auto array = object.asArray(rt);
    const auto length = array.size(rt);
    std::vector<LinkValue> items;
    items.reserve(length);
    for (size_t i = 0; i < length; ++i)
      items.push_back(untyped(rt, array.getValueAtIndex(rt, i), at + "[" + std::to_string(i) + "]"));
    return LinkValue::list(std::move(items));
  }
  auto names = object.getPropertyNames(rt);
  const auto length = names.size(rt);
  std::vector<std::string> keys;
  std::vector<LinkValue> items;
  keys.reserve(length);
  items.reserve(length);
  for (size_t i = 0; i < length; ++i) {
    auto name = names.getValueAtIndex(rt, i).asString(rt);
    auto field = object.getProperty(rt, jsi::PropNameID::forString(rt, name));
    // An undefined field is left out, as JSON leaves it.
    if (field.isUndefined()) continue;
    auto key = name.utf8(rt);
    items.push_back(untyped(rt, field, at + "." + key));
    keys.push_back(std::move(key));
  }
  return LinkValue::entries(std::move(keys), std::move(items));
}

} // namespace link

/// `value` as `type` declares it; `at` names it in a mismatch (`argument 1.mode`).
inline LinkValue linkValue(jsi::Runtime& rt, const jsi::Value& value, const LinkType& type, const std::string& at,
                           const LinkAllocate& allocate = {}) {
  using Kind = LinkType::Kind;
  switch (type.kind) {
  case Kind::Null: return {};
  case Kind::Reference: return linkValue(rt, value, *type.target, at, allocate);
  case Kind::Bytes: {
    if (!value.isObject()) link::argumentMismatch(at, type.kind);
    auto object = value.asObject(rt);
    if (!object.isArrayBuffer(rt)) link::argumentMismatch(at, type.kind);
    return LinkValue::buffer(link::bytesOf(rt, object.getArrayBuffer(rt), allocate));
  }
  case Kind::Json: return link::untyped(rt, value, at);
  case Kind::Nullable:
    if (value.isNull() || value.isUndefined()) return {};
    return linkValue(rt, value, type.of[0], at, allocate);
  case Kind::Number:
    // Finite, as the kernel checks: UI-thread code calls main-thread functions without it.
    if (!value.isNumber() || !std::isfinite(value.asNumber())) link::argumentMismatch(at, type.kind);
    return LinkValue::numeric(value.asNumber());
  case Kind::Boolean:
    if (!value.isBool()) link::argumentMismatch(at, type.kind);
    return LinkValue::boolean(value.getBool());
  case Kind::Text:
  case Kind::Enum:
    if (!value.isString()) link::argumentMismatch(at, type.kind);
    return LinkValue::string(value.asString(rt).utf8(rt));
  case Kind::Array: {
    if (!value.isObject()) link::argumentMismatch(at, type.kind);
    auto object = value.asObject(rt);
    if (!object.isArray(rt)) link::argumentMismatch(at, type.kind);
    auto array = object.asArray(rt);
    const auto length = array.size(rt);
    std::vector<LinkValue> items;
    items.reserve(length);
    for (size_t i = 0; i < length; ++i)
      items.push_back(
          linkValue(rt, array.getValueAtIndex(rt, i), type.of[0], at + "[" + std::to_string(i) + "]", allocate));
    return LinkValue::list(std::move(items));
  }
  case Kind::Record: {
    if (!value.isObject()) link::argumentMismatch(at, type.kind);
    auto object = value.asObject(rt);
    if (object.isArray(rt) || object.isFunction(rt)) link::argumentMismatch(at, type.kind);
    auto names = object.getPropertyNames(rt);
    const auto length = names.size(rt);
    std::vector<std::string> keys;
    std::vector<LinkValue> items;
    keys.reserve(length);
    items.reserve(length);
    for (size_t i = 0; i < length; ++i) {
      auto name = names.getValueAtIndex(rt, i).asString(rt);
      auto key = name.utf8(rt);
      items.push_back(linkValue(rt, object.getProperty(rt, jsi::PropNameID::forString(rt, name)), type.of[0],
                                at + "." + key, allocate));
      keys.push_back(std::move(key));
    }
    return LinkValue::entries(std::move(keys), std::move(items));
  }
  case Kind::Struct: {
    if (!value.isObject()) link::argumentMismatch(at, type.kind);
    auto object = value.asObject(rt);
    if (object.isArray(rt) || object.isFunction(rt)) link::argumentMismatch(at, type.kind);
    std::vector<LinkValue> fields;
    fields.reserve(type.fields.size());
    for (size_t i = 0; i < type.fields.size(); ++i) {
      const auto& field = type.fields[i];
      auto read = object.getProperty(rt, field.name.c_str());
      const bool absent = read.isUndefined() || (field.optional && read.isNull());
      fields.push_back(absent && field.optional ? LinkValue()
                                                : linkValue(rt, read, type.of[i], at + "." + field.name, allocate));
    }
    return LinkValue::list(std::move(fields));
  }
  }
  return {};
}

/// The arguments of a call, from `args[from]` on. Without a signature (a
/// member the shell does not link) none cross, and the platform's table
/// fails the call.
inline std::vector<LinkValue> linkArguments(jsi::Runtime& rt, const jsi::Value* args, size_t from, size_t count,
                                            const LinkSignature* signature, const LinkAllocate& allocate = {}) {
  std::vector<LinkValue> values;
  if (!signature) return values;
  const size_t given = count > from ? count - from : 0;
  if (given > signature->arguments.size())
    throw LinkMismatch("ERR_ARGUMENT", "takes " + std::to_string(signature->arguments.size()) + " arguments, not " +
                                           std::to_string(given));
  values.reserve(given);
  for (size_t i = 0; i < given; ++i)
    values.push_back(
        linkValue(rt, args[from + i], signature->arguments[i], "argument " + std::to_string(i + 1), allocate));
  return values;
}

namespace link {

/// An entry as an own property: `__proto__` set plainly would replace the prototype, as JSON.parse never does.
inline void setEntry(jsi::Runtime& rt, jsi::Object& object, const std::string& key, jsi::Value value) {
  if (key != "__proto__") return object.setProperty(rt, jsi::PropNameID::forUtf8(rt, key), std::move(value));
  jsi::Object descriptor(rt);
  descriptor.setProperty(rt, "value", std::move(value));
  for (const char* flag : {"writable", "enumerable", "configurable"}) descriptor.setProperty(rt, flag, true);
  rt.global()
      .getPropertyAsObject(rt, "Object")
      .getPropertyAsFunction(rt, "defineProperty")
      .call(rt, object, jsi::String::createFromUtf8(rt, key), descriptor);
}

[[noreturn]] inline void resultMismatch(LinkType::Kind kind) {
  throw LinkMismatch("ERR_ENCODE", std::string("the result is not ") + expected(kind));
}

inline jsi::Value untypedValue(jsi::Runtime& rt, const LinkValue& value) {
  switch (value.kind) {
  case LinkValue::Kind::Null: return jsi::Value::null();
  case LinkValue::Kind::Boolean: return jsi::Value(value.flag);
  case LinkValue::Kind::Number: return jsi::Value(value.number);
  case LinkValue::Kind::Text: return jsi::String::createFromUtf8(rt, value.text);
  case LinkValue::Kind::Bytes: return jsi::ArrayBuffer(rt, std::make_shared<SharedBytes>(value.bytes));
  case LinkValue::Kind::List: {
    jsi::Array array(rt, value.items.size());
    for (size_t i = 0; i < value.items.size(); ++i) array.setValueAtIndex(rt, i, untypedValue(rt, value.items[i]));
    return array;
  }
  case LinkValue::Kind::Entries: {
    jsi::Object object(rt);
    for (size_t i = 0; i < value.items.size(); ++i)
      setEntry(rt, object, value.keys[i], untypedValue(rt, value.items[i]));
    return object;
  }
  }
  return jsi::Value::null();
}

} // namespace link

/// What the platform answered or sent, as `type` declares it. A struct's
/// absent optional field is left out; a nullable one is null.
inline jsi::Value jsiValue(jsi::Runtime& rt, const LinkValue& value, const LinkType& type) {
  using Kind = LinkType::Kind;
  using Value = LinkValue::Kind;
  switch (type.kind) {
  case Kind::Null: return jsi::Value::null();
  case Kind::Reference: return jsiValue(rt, value, *type.target);
  case Kind::Bytes:
    if (value.kind != Value::Bytes) link::resultMismatch(type.kind);
    return jsi::ArrayBuffer(rt, std::make_shared<link::SharedBytes>(value.bytes));
  case Kind::Json: return link::untypedValue(rt, value);
  case Kind::Nullable: return value.kind == Value::Null ? jsi::Value::null() : jsiValue(rt, value, type.of[0]);
  case Kind::Number:
    if (value.kind != Value::Number) link::resultMismatch(type.kind);
    return jsi::Value(value.number);
  case Kind::Boolean:
    if (value.kind != Value::Boolean) link::resultMismatch(type.kind);
    return jsi::Value(value.flag);
  case Kind::Text:
  case Kind::Enum:
    if (value.kind != Value::Text) link::resultMismatch(type.kind);
    return jsi::String::createFromUtf8(rt, value.text);
  case Kind::Array: {
    if (value.kind != Value::List) link::resultMismatch(type.kind);
    jsi::Array array(rt, value.items.size());
    for (size_t i = 0; i < value.items.size(); ++i)
      array.setValueAtIndex(rt, i, jsiValue(rt, value.items[i], type.of[0]));
    return array;
  }
  case Kind::Record: {
    if (value.kind != Value::Entries) link::resultMismatch(type.kind);
    jsi::Object object(rt);
    for (size_t i = 0; i < value.items.size(); ++i)
      link::setEntry(rt, object, value.keys[i], jsiValue(rt, value.items[i], type.of[0]));
    return object;
  }
  case Kind::Struct: {
    if (value.kind != Value::List || value.items.size() != type.fields.size()) link::resultMismatch(type.kind);
    jsi::Object object(rt);
    for (size_t i = 0; i < type.fields.size(); ++i) {
      const auto& field = value.items[i];
      if (field.kind == Value::Null && type.fields[i].optional && type.of[i].kind != Kind::Nullable) continue;
      object.setProperty(rt, type.fields[i].name.c_str(), jsiValue(rt, field, type.of[i]));
    }
    return object;
  }
  }
  return jsi::Value::null();
}

} // namespace kuito
