// Decodes a ThumbHash (https://evanw.github.io/thumbhash/) into the small RGBA
// preview an Image shows while its image loads (its `thumbhash` prop).
//
// A C++ port of ThumbHash's reference decoder (https://github.com/evanw/thumbhash,
// js/thumbhash.js: thumbHashToRGBA and thumbHashToApproximateAspectRatio), MIT
// License, Copyright (c) 2023 Evan Wallace. See LICENSE-thumbhash in this
// directory. decode follows the reference's steps and comments so the two can
// be compared side by side; parse adds the checks the reference leaves to
// JavaScript, where reading past the hash gives undefined.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>
#include <string_view>
#include <utility>
#include <vector>

namespace kuito {

/// `width` × `height` pixels, row by row, RGBA not premultiplied by alpha.
struct ThumbHashPreview {
  int width;
  int height;
  std::vector<uint8_t> rgba;
};

class ThumbHash {
public:
  /// The hash a base64 or base64url string holds (padding optional); nullopt for text that
  /// is not base64, a hash shorter than its header says, or one whose preview
  /// would have no pixels.
  static std::optional<ThumbHash> parse(std::string_view base64) {
    auto bytes = decodeBase64(base64);

    if (!bytes || bytes->size() < 5) return std::nullopt;

    ThumbHash hash(std::move(*bytes));
    auto& h = hash.hash_;
    bool hasAlpha = h[2] & 0x80;
    int lx = std::max(3, hash.lx()), ly = std::max(3, hash.ly());
    size_t factors = count(lx, ly) + 2 * count(3, 3) + (hasAlpha ? count(5, 5) : 0);
    size_t start = hasAlpha ? 6 : 5;

    if (h.size() < start + (factors + 1) / 2) return std::nullopt;
    if (hash.lx() == 0 || hash.ly() == 0) return std::nullopt;

    return hash;
  }

  /// The preview, at most 32 pixels on its longer side. Run it off the main
  /// thread: it is an image decode.
  ThumbHashPreview decode() const {
    const double PI = 3.14159265358979323846;
    auto& hash = hash_;

    // Read the constants
    uint32_t header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16);
    uint32_t header16 = hash[3] | (hash[4] << 8);
    double l_dc = (header24 & 63) / 63.0;
    double p_dc = ((header24 >> 6) & 63) / 31.5 - 1;
    double q_dc = ((header24 >> 12) & 63) / 31.5 - 1;
    double l_scale = ((header24 >> 18) & 31) / 31.0;
    bool hasAlpha = header24 >> 23;
    double p_scale = ((header16 >> 3) & 63) / 63.0;
    double q_scale = ((header16 >> 9) & 63) / 63.0;
    bool isLandscape = header16 >> 15;
    int lx = std::max(3, isLandscape ? hasAlpha ? 5 : 7 : int(header16 & 7));
    int ly = std::max(3, isLandscape ? int(header16 & 7) : hasAlpha ? 5 : 7);
    double a_dc = hasAlpha ? (hash[5] & 15) / 15.0 : 1;
    double a_scale = (hash[5] >> 4) / 15.0;

    // Read the varying factors (boost saturation by 1.25x to compensate for quantization)
    size_t ac_start = hasAlpha ? 6 : 5;
    size_t ac_index = 0;
    auto decodeChannel = [&](int nx, int ny, double scale) {
      std::vector<double> ac;
      for (int cy = 0; cy < ny; cy++)
        for (int cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++, ac_index++)
          ac.push_back((((hash[ac_start + (ac_index >> 1)] >> ((ac_index & 1) << 2)) & 15) / 7.5 - 1) * scale);
      return ac;
    };
    auto l_ac = decodeChannel(lx, ly, l_scale);
    auto p_ac = decodeChannel(3, 3, p_scale * 1.25);
    auto q_ac = decodeChannel(3, 3, q_scale * 1.25);
    auto a_ac = hasAlpha ? decodeChannel(5, 5, a_scale) : std::vector<double>();

    // Decode using the DCT into RGB
    double ratio = double(this->lx()) / this->ly();
    int w = int(std::round(ratio > 1 ? 32 : 32 * ratio));
    int h = int(std::round(ratio > 1 ? 32 / ratio : 32));
    std::vector<uint8_t> rgba(size_t(w) * h * 4);
    std::vector<double> fx(std::max(lx, hasAlpha ? 5 : 3)), fy(std::max(ly, hasAlpha ? 5 : 3));
    for (int y = 0, i = 0; y < h; y++) {
      for (int x = 0; x < w; x++, i += 4) {
        double l = l_dc, p = p_dc, q = q_dc, a = a_dc;

        // Precompute the coefficients
        for (size_t cx = 0; cx < fx.size(); cx++) fx[cx] = std::cos(PI / w * (x + 0.5) * cx);
        for (size_t cy = 0; cy < fy.size(); cy++) fy[cy] = std::cos(PI / h * (y + 0.5) * cy);

        // Decode L
        for (int cy = 0, j = 0; cy < ly; cy++)
          for (int cx = cy ? 0 : 1; cx * ly < lx * (ly - cy); cx++, j++) l += l_ac[j] * fx[cx] * fy[cy] * 2;

        // Decode P and Q
        for (int cy = 0, j = 0; cy < 3; cy++) {
          for (int cx = cy ? 0 : 1; cx < 3 - cy; cx++, j++) {
            double f = fx[cx] * fy[cy] * 2;
            p += p_ac[j] * f;
            q += q_ac[j] * f;
          }
        }

        // Decode A
        if (hasAlpha)
          for (int cy = 0, j = 0; cy < 5; cy++)
            for (int cx = cy ? 0 : 1; cx < 5 - cy; cx++, j++) a += a_ac[j] * fx[cx] * fy[cy] * 2;

        // Convert to RGB
        double b = l - 2.0 / 3 * p;
        double r = (3 * l - b + q) / 2;
        double g = r - q;
        rgba[i] = channel(r);
        rgba[i + 1] = channel(g);
        rgba[i + 2] = channel(b);
        rgba[i + 3] = channel(a);
      }
    }
    return {w, h, std::move(rgba)};
  }

private:
  explicit ThumbHash(std::vector<uint8_t> bytes) : hash_(std::move(bytes)) {}

  /// The factors' grid before the decoder's minimum of 3, as
  /// thumbHashToApproximateAspectRatio reads it: zero for a side with none.
  int lx() const {
    bool hasAlpha = hash_[2] & 0x80, isLandscape = hash_[4] & 0x80;
    return isLandscape ? hasAlpha ? 5 : 7 : hash_[3] & 7;
  }

  int ly() const {
    bool hasAlpha = hash_[2] & 0x80, isLandscape = hash_[4] & 0x80;
    return isLandscape ? hash_[3] & 7 : hasAlpha ? 5 : 7;
  }

  /// How many factors decodeChannel reads for an `nx` × `ny` channel.
  static size_t count(int nx, int ny) {
    size_t n = 0;
    for (int cy = 0; cy < ny; cy++)
      for (int cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) n++;
    return n;
  }

  /// As a Uint8Array stores it: clamped, then truncated.
  static uint8_t channel(double value) { return uint8_t(std::max(0.0, 255 * std::min(1.0, value))); }

  static std::optional<std::vector<uint8_t>> decodeBase64(std::string_view text) {
    while (!text.empty() && text.back() == '=') text.remove_suffix(1);

    std::vector<uint8_t> bytes;
    uint32_t bits = 0;
    int pending = 0;
    for (char c : text) {
      int value = c >= 'A' && c <= 'Z'   ? c - 'A'
                  : c >= 'a' && c <= 'z' ? c - 'a' + 26
                  : c >= '0' && c <= '9' ? c - '0' + 52
                  : c == '+' || c == '-' ? 62
                  : c == '/' || c == '_' ? 63
                                         : -1;
      if (value < 0) return std::nullopt;
      bits = (bits << 6) | uint32_t(value);
      pending += 6;
      if (pending >= 8) {
        pending -= 8;
        bytes.push_back(uint8_t(bits >> pending));
      }
    }
    // One character left over holds no whole byte.
    if (pending >= 6) return std::nullopt;
    return bytes;
  }

  std::vector<uint8_t> hash_;
};

} // namespace kuito
