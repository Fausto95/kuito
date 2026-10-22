#include "Standard.h"
#include "JSIHelpers.h"
#include "Utf8.h"

#include <chrono>
#include <cstdlib>
#include <jsi/jsi.h>
#include <utility>

namespace kuito {
namespace {
class OwnedBuffer final : public jsi::MutableBuffer {
public:
  explicit OwnedBuffer(std::vector<std::uint8_t> bytes) : bytes_(std::move(bytes)) {
    // An empty vector may have no storage, and a buffer needs an address.
    bytes_.reserve(1);
  }
  size_t size() const override { return bytes_.size(); }
  uint8_t* data() override { return bytes_.data(); }

private:
  std::vector<std::uint8_t> bytes_;
};

std::vector<std::uint8_t> utf8Bytes(jsi::Runtime& rt, const jsi::String& text) {
  // From UTF-16, so a lone surrogate encodes as U+FFFD whatever the engine's utf8() does.
  auto encoded = encodeUtf8(text.utf16(rt));
  return std::vector<std::uint8_t>(encoded.begin(), encoded.end());
}
} // namespace

jsi::ArrayBuffer ownedArrayBuffer(jsi::Runtime& rt, std::vector<std::uint8_t> bytes) {
  return jsi::ArrayBuffer(rt, std::make_shared<OwnedBuffer>(std::move(bytes)));
}

std::vector<std::uint8_t> bodyBytes(jsi::Runtime& rt, const jsi::Value& value, const char* what) {
  if (value.isString()) return utf8Bytes(rt, value.getString(rt));
  if (value.isObject()) {
    auto object = value.getObject(rt);
    if (object.isArrayBuffer(rt)) {
      auto buffer = object.getArrayBuffer(rt);
      auto* data = buffer.data(rt);
      return std::vector<std::uint8_t>(data, data + buffer.size(rt));
    }
  }
  throw jsi::JSError(rt, std::string(what) + " is a string or an ArrayBuffer");
}

void installStandard(jsi::Runtime& rt) {
  auto encode = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "__kuitoHostEncodeUtf8"), 1,
      [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
        if (count != 1 || !args[0].isString()) throw jsi::JSError(rt, "encodeUtf8 expects (text)");
        return ownedArrayBuffer(rt, utf8Bytes(rt, args[0].getString(rt)));
      });
  rt.global().setProperty(rt, "__kuitoHostEncodeUtf8", std::move(encode));
  auto decode = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "__kuitoHostDecodeUtf8"), 3,
      [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
        if (count != 3 || !args[0].isObject() || !args[0].getObject(rt).isArrayBuffer(rt) || !args[1].isNumber() ||
            !args[2].isNumber())
          throw jsi::JSError(rt, "decodeUtf8 expects (buffer, offset, length)");
        auto buffer = args[0].getObject(rt).getArrayBuffer(rt);
        auto offset = args[1].asNumber(), length = args[2].asNumber();
        auto size = static_cast<double>(buffer.size(rt));
        if (offset < 0 || length < 0 || offset + length > size)
          throw jsi::JSError(rt, "decodeUtf8's range is outside the buffer");
        auto text = decodeUtf8(buffer.data(rt) + static_cast<size_t>(offset), static_cast<size_t>(length));
        return jsi::String::createFromUtf16(rt, text.data(), text.size());
      });
  rt.global().setProperty(rt, "__kuitoHostDecodeUtf8", std::move(decode));
  // crypto.getRandomValues: arc4random_buf is the platform CSPRNG on both
  // iOS and Android (bionic), and never fails or blocks.
  auto fill = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "__kuitoHostFillRandom"), 3,
      [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
        if (count != 3 || !args[0].isObject() || !args[0].getObject(rt).isArrayBuffer(rt) || !args[1].isNumber() ||
            !args[2].isNumber())
          throw jsi::JSError(rt, "fillRandom expects (buffer, offset, length)");
        auto buffer = args[0].getObject(rt).getArrayBuffer(rt);
        auto offset = args[1].asNumber(), length = args[2].asNumber();
        if (offset < 0 || length < 0 || offset + length > static_cast<double>(buffer.size(rt)))
          throw jsi::JSError(rt, "fillRandom's range is outside the buffer");
        arc4random_buf(buffer.data(rt) + static_cast<size_t>(offset), static_cast<size_t>(length));
        return jsi::Value::undefined();
      });
  rt.global().setProperty(rt, "__kuitoHostFillRandom", std::move(fill));
  // performance.now: milliseconds since this runtime started, monotonic.
  auto now = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "__kuitoHostNow"), 0,
      [started = std::chrono::steady_clock::now()](jsi::Runtime&, const jsi::Value&, const jsi::Value*,
                                                   size_t) -> jsi::Value {
        const std::chrono::duration<double, std::milli> since = std::chrono::steady_clock::now() - started;
        return jsi::Value(since.count());
      });
  rt.global().setProperty(rt, "__kuitoHostNow", std::move(now));
}

} // namespace kuito
