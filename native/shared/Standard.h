#pragma once
// The platform half of Kuito's standard library (docs/web-apis.md): what the
// kernel can't do in JavaScript, or can't do fast, installed as
// `__kuitoHost*` functions on every host.
#include <cstdint>
#include <memory>
#include <vector>

namespace facebook {
namespace jsi {
class ArrayBuffer;
class Runtime;
class Value;
} // namespace jsi
} // namespace facebook

namespace kuito {

void installStandard(facebook::jsi::Runtime& rt);

/// `bytes` as an ArrayBuffer JavaScript owns, without another copy.
facebook::jsi::ArrayBuffer ownedArrayBuffer(facebook::jsi::Runtime& rt, std::vector<std::uint8_t> bytes);

/// A string's UTF-8, or an ArrayBuffer's bytes; throws a JSError naming `what` otherwise.
std::vector<std::uint8_t> bodyBytes(facebook::jsi::Runtime& rt, const facebook::jsi::Value& value, const char* what);

} // namespace kuito
