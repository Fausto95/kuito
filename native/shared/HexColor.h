#pragma once
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>

namespace kuito {

/// `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` (the style compiler's output) as 0xRRGGBBAA.
inline std::optional<std::uint32_t> parseHexColor(std::string_view text) {
  if (text.empty() || text.front() != '#') return std::nullopt;
  const std::string_view digits = text.substr(1);
  if (digits.size() != 3 && digits.size() != 4 && digits.size() != 6 && digits.size() != 8) return std::nullopt;
  std::uint32_t value = 0;
  for (char c : digits) {
    std::uint32_t digit;
    if (c >= '0' && c <= '9') digit = static_cast<std::uint32_t>(c - '0');
    else if (c >= 'a' && c <= 'f') digit = static_cast<std::uint32_t>(c - 'a' + 10);
    else if (c >= 'A' && c <= 'F') digit = static_cast<std::uint32_t>(c - 'A' + 10);
    else return std::nullopt;
    value = value << 4 | digit;
  }
  if (digits.size() > 4) return digits.size() == 6 ? value << 8 | 0xff : value;
  // Short forms repeat each digit: #f80 is #ff8800.
  std::uint32_t full = 0;
  for (std::size_t shift = digits.size(); shift-- > 0;) {
    const std::uint32_t digit = value >> (shift * 4) & 0xf;
    full = full << 8 | digit << 4 | digit;
  }
  return digits.size() == 3 ? full << 8 | 0xff : full;
}

} // namespace kuito
