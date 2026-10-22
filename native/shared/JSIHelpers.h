#pragma once
// What both Hermes runtimes (KuitoRuntime on the JS thread, UIRuntime on the
// UI thread) use to talk to JavaScript.
#include "EventRecord.h"
#include "Wire.h"
#include "WireWork.h"
#include <jsi/jsi.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace kuito {
namespace jsi = facebook::jsi;

/// A host function with no result. An exception other than a JSError, from
/// decoding or validating a batch, reaches JavaScript as a JSError naming it,
/// with whatever the call queued not kept.
inline void installHost(jsi::Runtime& rt, const char* name, unsigned argCount,
                        std::function<void(jsi::Runtime&, const jsi::Value*, size_t)> callback) {
  auto fn = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, name), argCount,
      [callback = std::move(callback)](jsi::Runtime& runtime, const jsi::Value&, const jsi::Value* args,
                                       size_t count) -> jsi::Value {
        try {
          callback(runtime, args, count);
        } catch (const jsi::JSIException&) { throw; } catch (const std::exception& error) {
          throw jsi::JSError(runtime, error.what());
        }
        return jsi::Value::undefined();
      });
  rt.global().setProperty(rt, name, std::move(fn));
}

/// A scalar argument as text: numbers as JavaScript prints them, null as "".
inline std::string scalarText(jsi::Runtime& rt, const jsi::Value& value) {
  if (value.isString()) return value.asString(rt).utf8(rt);
  if (value.isNumber()) return value.toString(rt).utf8(rt);
  if (value.isBool()) return value.getBool() ? "true" : "false";
  if (value.isNull() || value.isUndefined()) return "";
  throw jsi::JSError(rt, "Kuito host arguments must be scalar values");
}

/// Plain data JavaScript passed, read as it is (PlainValue.h), as the kernel
/// writes it into the host batch: an object's undefined fields are left out,
/// a number JSON cannot hold is null, and a function or a symbol is an error.
inline PlainValue plainValue(jsi::Runtime& rt, const jsi::Value& value, int depth = 0) {
  constexpr int kPlainDepth = 64;
  PlainValue out;
  if (value.isNull() || value.isUndefined()) return out;
  if (value.isNumber()) {
    if (std::isfinite(value.asNumber())) out.kind = PlainValue::Kind::Number, out.number = value.asNumber();
    return out;
  }
  if (value.isBool()) {
    out.kind = PlainValue::Kind::Boolean, out.number = value.getBool() ? 1 : 0;
    return out;
  }
  if (value.isString()) {
    out.kind = PlainValue::Kind::Text, out.text = value.asString(rt).utf8(rt);
    return out;
  }
  if (!value.isObject() || depth >= kPlainDepth)
    throw jsi::JSError(rt, "Kuito takes plain data here: scalars, arrays and plain objects");
  auto object = value.asObject(rt);
  if (object.isFunction(rt)) throw jsi::JSError(rt, "A function is not plain data");
  if (object.isArray(rt)) {
    auto array = object.asArray(rt);
    const std::size_t length = array.size(rt);
    out.kind = PlainValue::Kind::List;
    out.items.reserve(length);
    for (std::size_t i = 0; i < length; ++i)
      out.items.push_back(plainValue(rt, array.getValueAtIndex(rt, i), depth + 1));
    return out;
  }
  out.kind = PlainValue::Kind::Struct;
  auto names = object.getPropertyNames(rt);
  const std::size_t length = names.size(rt);
  out.fields.reserve(length);
  for (std::size_t i = 0; i < length; ++i) {
    auto name = names.getValueAtIndex(rt, i).asString(rt);
    auto field = object.getProperty(rt, jsi::PropNameID::forString(rt, name));
    if (field.isUndefined()) continue;
    out.fields.emplace_back(name.utf8(rt), plainValue(rt, field, depth + 1));
  }
  return out;
}

/// `value` as a JavaScript value: what JSON.parse would have made of it.
inline jsi::Value jsiValue(jsi::Runtime& rt, const PlainValue& value) {
  switch (value.kind) {
  case PlainValue::Kind::Null: return jsi::Value::null();
  case PlainValue::Kind::Number: return jsi::Value(value.number);
  case PlainValue::Kind::Boolean: return jsi::Value(value.number != 0);
  case PlainValue::Kind::Text: return jsi::String::createFromUtf8(rt, value.text);
  case PlainValue::Kind::List: {
    jsi::Array array(rt, value.items.size());
    for (std::size_t i = 0; i < value.items.size(); ++i) array.setValueAtIndex(rt, i, jsiValue(rt, value.items[i]));
    return array;
  }
  case PlainValue::Kind::Struct: {
    jsi::Object object(rt);
    for (const auto& [name, field] : value.fields)
      object.setProperty(rt, jsi::PropNameID::forUtf8(rt, name), jsiValue(rt, field));
    return object;
  }
  }
  return jsi::Value::undefined();
}

/// A prop value as JavaScript passed it: a scalar, or plain data.
inline RawValue rawValue(jsi::Runtime& rt, const jsi::Value& value) {
  RawValue raw;
  if (value.isNull() || value.isUndefined()) return raw;
  if (value.isNumber()) raw.tag = RawValue::Tag::Number, raw.number = value.asNumber();
  else if (value.isBool()) raw.tag = value.getBool() ? RawValue::Tag::True : RawValue::Tag::False;
  else if (value.isString()) raw.tag = RawValue::Tag::Text, raw.text = value.asString(rt).utf8(rt);
  else {
    raw.plain = plainValue(rt, value);
    raw.tag = raw.plain.kind == PlainValue::Kind::List ? RawValue::Tag::List : RawValue::Tag::Struct;
  }
  return raw;
}

/// A view id: a whole number the kernel gave the view.
inline std::uint32_t viewId(jsi::Runtime& rt, const jsi::Value& value) {
  if (!value.isNumber() || value.asNumber() < 0 || value.asNumber() > 4294967295.0)
    throw jsi::JSError(rt, "Kuito view ids are numbers");
  return static_cast<std::uint32_t>(value.asNumber());
}

/// The kernel's batch: `buffer`'s first `length` bytes and the strings they name.
/// `__kuitoHostCommit`'s arguments as the kernel wrote them: valid during the call.
struct RawBatch {
  const std::uint8_t* data;
  size_t length;
  std::vector<std::string> strings;
};

inline RawBatch readRawBatch(jsi::Runtime& rt, const jsi::Value* args, size_t count) {
  if (count != 3 || !args[0].isObject() || !args[1].isNumber() || !args[2].isObject())
    throw jsi::JSError(rt, "commit expects (buffer, byteLength, strings)");
  auto object = args[0].asObject(rt);
  if (!object.isArrayBuffer(rt)) throw jsi::JSError(rt, "commit expects an ArrayBuffer");
  auto buffer = object.getArrayBuffer(rt);
  const double length = args[1].asNumber();
  if (length < 0 || length > static_cast<double>(buffer.size(rt))) throw jsi::JSError(rt, "commit length out of range");
  auto list = args[2].asObject(rt).asArray(rt);
  std::vector<std::string> strings;
  const size_t size = list.size(rt);
  strings.reserve(size);
  for (size_t index = 0; index < size; ++index)
    strings.push_back(list.getValueAtIndex(rt, index).asString(rt).utf8(rt));
  return {buffer.data(rt), static_cast<size_t>(length), std::move(strings)};
}

/// A kernel's live `work` counters (`__kuito.work`, `__kuitoUI.work`), read
/// on its runtime's thread after each job into wireWork(). Destroy it before
/// the runtime: it holds one of its objects.
class WorkReader {
public:
  explicit WorkReader(const char* kernel) : kernel_(kernel) {}

  void read(jsi::Runtime& rt) {
    if (!work_) {
      // Until the kernel has run, it has counted nothing.
      auto kernel = rt.global().getProperty(rt, kernel_);
      if (!kernel.isObject()) return;
      auto work = kernel.getObject(rt).getProperty(rt, "work");
      if (!work.isObject()) return;
      work_ = std::make_unique<jsi::Object>(work.getObject(rt));
    }
    const auto counter = [&](const char* name) {
      auto value = work_->getProperty(rt, name);
      return value.isNumber() ? value.getNumber() : 0.0;
    };
    tally_.read(wireWork(), counter("jsonParses"), counter("bytesStringified"));
  }

private:
  const char* kernel_;
  std::unique_ptr<jsi::Object> work_;
  WorkTally tally_;
};

/// Hands typed event records to a kernel (`__kuito`, `__kuitoUI`;
/// docs/events.md#typed-events): writes each record's numbers into the
/// kernel's reusable buffer and gives back its strings. The first record
/// checks the kernel's layouts are the shell's: a kernel served from a newer
/// manifest would read every field from the wrong slot. Destroy it before
/// the runtime: it holds one of its objects.
class EventSender {
public:
  explicit EventSender(const char* kernel) : kernel_(kernel) {}

  /// The strings argument for the kernel's call: undefined when there are none.
  jsi::Value write(jsi::Runtime& rt, const EventRecord& record) {
    if (!buffer_) attach(rt);
    const std::size_t bytes = record.numbers.size() * sizeof(double);
    if (bytes > buffer_->size(rt))
      throw std::runtime_error(std::string(kernel_) + "'s event record holds fewer numbers than layout " +
                               std::to_string(record.layout));
    if (bytes) std::memcpy(buffer_->data(rt), record.numbers.data(), bytes);
    if (record.strings.empty()) return jsi::Value::undefined();
    jsi::Array strings(rt, record.strings.size());
    for (std::size_t i = 0; i < record.strings.size(); ++i)
      strings.setValueAtIndex(rt, i, jsi::String::createFromUtf8(rt, record.strings[i]));
    return strings;
  }

private:
  void attach(jsi::Runtime& rt) {
    auto kernel = rt.global().getPropertyAsObject(rt, kernel_);
    auto hash = kernel.getProperty(rt, "eventLayoutHash");
    if (!hash.isNumber() || static_cast<std::uint32_t>(hash.getNumber()) != kEventLayoutHash)
      throw std::runtime_error(std::string(kernel_) +
                               "'s event layouts are not this shell's: rebuild the shell for this version of "
                               "Kuito (src/protocol/manifest.ts changed)");
    auto numbers = kernel.getPropertyAsObject(rt, "eventNumbers").getProperty(rt, "buffer");
    if (!numbers.isObject() || !numbers.getObject(rt).isArrayBuffer(rt))
      throw std::runtime_error(std::string(kernel_) + " has no event record");
    buffer_ = std::make_unique<jsi::ArrayBuffer>(numbers.getObject(rt).getArrayBuffer(rt));
  }

  const char* kernel_;
  std::unique_ptr<jsi::ArrayBuffer> buffer_;
};

/// `Name: message`, as the JavaScript console prints a thrown error.
inline std::string describeError(jsi::Runtime& rt, const jsi::JSError& error) {
  try {
    if (error.value().isObject()) {
      auto name = error.value().asObject(rt).getProperty(rt, "name");
      if (name.isString()) return name.asString(rt).utf8(rt) + ": " + error.getMessage();
    }
  } catch (const jsi::JSIException&) {}
  return error.getMessage();
}

} // namespace kuito
