#include "Utf8.h"
#include "check.h"
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

using kuito::decodeUtf8;
using kuito::encodeUtf8;

namespace {
std::u16string decode(const std::vector<std::uint8_t> &bytes) {
  return decodeUtf8(bytes.data(), bytes.size());
}
} // namespace

int main() {
  // One, two, three and four bytes, round trip.
  std::u16string text = u"aé✓\U0001F600";
  CHECK(encodeUtf8(text) == "a\xC3\xA9\xE2\x9C\x93\xF0\x9F\x98\x80");
  auto encoded = encodeUtf8(text);
  CHECK(decodeUtf8(reinterpret_cast<const std::uint8_t *>(encoded.data()),
                   encoded.size()) == text);
  CHECK(decode({}).empty());

  // A lone surrogate encodes as U+FFFD, as TextEncoder's USVString does.
  CHECK(encodeUtf8(std::u16string(1, char16_t(0xD800)) + u"x") ==
        "\xEF\xBF\xBDx");
  CHECK(encodeUtf8(u"x" + std::u16string(1, char16_t(0xDC00))) ==
        "x\xEF\xBF\xBD");

  // Each maximal invalid subpart is one U+FFFD (Encoding standard).
  CHECK(decode({0xFF, 0x41}) == u"�A");
  CHECK(decode({0xC0, 0xAF}) == u"��");               // overlong lead
  CHECK(decode({0xE0, 0x80, 0x80}) == u"���");        // overlong three bytes
  CHECK(decode({0xED, 0xA0, 0x80}) == u"���");        // encoded surrogate
  CHECK(decode({0xF4, 0x90, 0x80, 0x80}) == u"����"); // past U+10FFFF
  CHECK(decode({0xE2, 0x9C}) == u"�");                // truncated at the end
  CHECK(decode({0xE2, 0x9C, 0x41}) == u"�A");         // truncated mid-text
  CHECK(decode({0xF0, 0x9F, 0x98, 0x80}) == u"\U0001F600");

  std::cout << "KUITO_UTF8_PASS\n";
  return 0;
}
