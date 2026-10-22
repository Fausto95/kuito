#pragma once
// UTF-8 to and from JavaScript's UTF-16, as the Encoding standard's TextEncoder
// and TextDecoder do it: a lone surrogate encodes as U+FFFD, and each maximal
// invalid subpart of a byte sequence decodes as one U+FFFD.
#include <cstddef>
#include <cstdint>
#include <string>

namespace kuito {

inline void appendUtf8(std::string& out, char32_t point) {
  if (point < 0x80) {
    out += static_cast<char>(point);
  } else if (point < 0x800) {
    out += static_cast<char>(0xC0 | (point >> 6));
    out += static_cast<char>(0x80 | (point & 0x3F));
  } else if (point < 0x10000) {
    out += static_cast<char>(0xE0 | (point >> 12));
    out += static_cast<char>(0x80 | ((point >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (point & 0x3F));
  } else {
    out += static_cast<char>(0xF0 | (point >> 18));
    out += static_cast<char>(0x80 | ((point >> 12) & 0x3F));
    out += static_cast<char>(0x80 | ((point >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (point & 0x3F));
  }
}

inline std::string encodeUtf8(const std::u16string& text) {
  std::string out;
  out.reserve(text.size());
  for (std::size_t at = 0; at < text.size(); ++at) {
    char32_t unit = text[at];
    bool high = unit >= 0xD800 && unit <= 0xDBFF;
    bool low = unit >= 0xDC00 && unit <= 0xDFFF;
    if (high && at + 1 < text.size() && text[at + 1] >= 0xDC00 && text[at + 1] <= 0xDFFF) {
      appendUtf8(out, 0x10000 + ((unit - 0xD800) << 10) + (text[at + 1] - 0xDC00));
      ++at;
    } else {
      appendUtf8(out, high || low ? 0xFFFD : unit);
    }
  }
  return out;
}

inline void appendUtf16(std::u16string& out, char32_t point) {
  if (point < 0x10000) {
    out += static_cast<char16_t>(point);
  } else {
    point -= 0x10000;
    out += static_cast<char16_t>(0xD800 + (point >> 10));
    out += static_cast<char16_t>(0xDC00 + (point & 0x3FF));
  }
}

inline std::u16string decodeUtf8(const std::uint8_t* bytes, std::size_t length) {
  std::u16string out;
  out.reserve(length);
  std::size_t at = 0;
  while (at < length) {
    std::uint8_t lead = bytes[at];
    if (lead < 0x80) {
      out += static_cast<char16_t>(lead);
      ++at;
      continue;
    }
    // The lead byte fixes how many continuation bytes follow and the range
    // the second may take, which rules out overlongs and surrogates.
    std::size_t needed = 0;
    std::uint8_t lower = 0x80, upper = 0xBF;
    char32_t point = 0;
    if (lead >= 0xC2 && lead <= 0xDF) needed = 1, point = lead & 0x1F;
    else if (lead >= 0xE0 && lead <= 0xEF) {
      needed = 2, point = lead & 0x0F;
      if (lead == 0xE0) lower = 0xA0;
      if (lead == 0xED) upper = 0x9F;
    } else if (lead >= 0xF0 && lead <= 0xF4) {
      needed = 3, point = lead & 0x07;
      if (lead == 0xF0) lower = 0x90;
      if (lead == 0xF4) upper = 0x8F;
    } else {
      out += u'\uFFFD';
      ++at;
      continue;
    }
    std::size_t next = at + 1;
    bool valid = true;
    for (std::size_t seen = 0; seen < needed; ++seen, ++next) {
      if (next >= length || bytes[next] < lower || bytes[next] > upper) {
        valid = false;
        break;
      }
      point = (point << 6) | (bytes[next] & 0x3F);
      lower = 0x80, upper = 0xBF;
    }
    if (valid) appendUtf16(out, point);
    else out += u'\uFFFD';
    at = next;
  }
  return out;
}

} // namespace kuito
