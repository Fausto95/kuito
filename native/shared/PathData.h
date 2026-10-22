#pragma once

// SVG path data (a Drawing Path's `d`, docs/drawing.md) as the verbs and
// points both renderers replay: CGPath on iOS, android.graphics.Path on
// Android. Absolute coordinates only; horizontal and vertical lines become
// lines, smooth curves get their reflected control points, and arcs become
// cubics, so a renderer knows five verbs. Grammar and arc rules from SVG 2,
// paths chapter (https://www.w3.org/TR/SVG2/paths.html) and its
// implementation notes on arcs (appendix B.2). Pure and header-only.
//
// Malformed data throws std::invalid_argument: "KUITO_PATH: <what>, at
// <offset> in \"<data>\"". SVG renders up to the first error; Kuito fails
// instead, as an invalid prop does.

#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <initializer_list>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace kuito::path {

enum class Verb : std::uint8_t { Move, Line, Quad, Cubic, Close };

/// The points a verb takes, two numbers each: none for Close.
constexpr std::size_t pointCount(Verb verb) {
  switch (verb) {
  case Verb::Move:
  case Verb::Line: return 2;
  case Verb::Quad: return 4;
  case Verb::Cubic: return 6;
  case Verb::Close: return 0;
  }
  return 0;
}

struct Path {
  std::vector<Verb> verbs;
  /// x, y pairs, pointCount(verb) numbers for each verb in order.
  std::vector<float> points;
};

namespace detail {

constexpr double pi = 3.14159265358979323846;

// Longer data is cut short in an error, so a message stays readable.
constexpr std::size_t quotedLength = 64;

class Parser {
public:
  explicit Parser(std::string_view data) : data_(data) {}

  Path parse() {
    skipSpace();
    if (done()) return std::move(path_);
    if (peek() != 'M' && peek() != 'm')
      fail(std::string("path data starts with a moveto, not ") + describe(peek()), at_);

    while (true) {
      skipSpace();
      if (done()) break;

      const char command = peek();
      if (!isCommand(command)) fail(describe(command) + " is no path command", at_);
      ++at_;
      run(command);
    }
    return std::move(path_);
  }

private:
  std::string_view data_;
  std::size_t at_ = 0;
  Path path_;
  double x_ = 0, y_ = 0;           // the current point
  double startX_ = 0, startY_ = 0; // the current subpath's start
  // The last curve's second control point, for S and T.
  double controlX_ = 0, controlY_ = 0;
  char previous_ = 0;

  bool done() const { return at_ >= data_.size(); }
  char peek() const { return data_[at_]; }

  static bool isSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f'; }
  static bool isDigit(char c) { return c >= '0' && c <= '9'; }
  static bool isCommand(char c) {
    switch (c) {
    case 'M':
    case 'm':
    case 'L':
    case 'l':
    case 'H':
    case 'h':
    case 'V':
    case 'v':
    case 'C':
    case 'c':
    case 'S':
    case 's':
    case 'Q':
    case 'q':
    case 'T':
    case 't':
    case 'A':
    case 'a':
    case 'Z':
    case 'z': return true;
    default: return false;
    }
  }

  static std::string describe(char c) {
    const auto byte = static_cast<unsigned char>(c);
    if (byte >= 0x21 && byte < 0x7f) return std::string(1, c);
    static const char hex[] = "0123456789abcdef";
    return std::string("byte 0x") + hex[byte >> 4] + hex[byte & 15];
  }

  [[noreturn]] void fail(const std::string& what, std::size_t offset) const {
    std::string quoted(data_.substr(0, quotedLength));
    if (data_.size() > quotedLength) quoted += "...";
    for (char& c : quoted)
      if (static_cast<unsigned char>(c) < 0x20 || static_cast<unsigned char>(c) >= 0x7f || c == '"') c = '?';
    throw std::invalid_argument("KUITO_PATH: " + what + ", at " + std::to_string(offset) + " in \"" + quoted + "\"");
  }

  void skipSpace() {
    while (!done() && isSpace(peek())) ++at_;
  }

  // Whitespace, then at most one comma and more whitespace: SVG's comma-wsp.
  void skipSeparator() {
    skipSpace();
    if (!done() && peek() == ',') {
      ++at_;
      skipSpace();
      if (done() || !startsNumber()) fail("a comma comes between numbers", at_);
    }
  }

  bool startsNumber() const {
    const char c = peek();
    return isDigit(c) || c == '.' || c == '-' || c == '+';
  }

  bool hasNumber() {
    skipSpace();
    return !done() && startsNumber();
  }

  double number() {
    const std::size_t start = at_;
    std::size_t end = at_;
    if (end < data_.size() && (data_[end] == '-' || data_[end] == '+')) ++end;
    bool digits = false;
    while (end < data_.size() && isDigit(data_[end])) ++end, digits = true;
    if (end < data_.size() && data_[end] == '.') {
      ++end;
      while (end < data_.size() && isDigit(data_[end])) ++end, digits = true;
    }
    if (!digits) fail("a number is digits, with a sign and a dot", start);
    if (end < data_.size() && (data_[end] == 'e' || data_[end] == 'E')) {
      std::size_t exponent = end + 1;
      if (exponent < data_.size() && (data_[exponent] == '-' || data_[exponent] == '+')) ++exponent;
      if (exponent < data_.size() && isDigit(data_[exponent])) {
        while (exponent < data_.size() && isDigit(data_[exponent])) ++exponent;
        end = exponent;
      }
    }

    const std::string text(data_.substr(start, end - start));
    const double value = std::strtod(text.c_str(), nullptr);
    if (!std::isfinite(value) || std::fabs(value) > 3.0e38) fail(text + " is no finite number", start);
    at_ = end;
    skipSeparator();
    return value;
  }

  bool flag() {
    skipSpace();
    const std::size_t start = at_;
    if (done() || (peek() != '0' && peek() != '1')) fail("an arc's flag is 0 or 1", start);
    const bool set = peek() == '1';
    ++at_;
    skipSeparator();
    return set;
  }

  // The numbers a command takes, read after checking they are there.
  void arguments(char command, std::size_t count, double* into) {
    for (std::size_t i = 0; i < count; ++i) {
      if (!hasNumber())
        fail(std::string(1, command) + " takes " + std::to_string(count) + " numbers, got " + std::to_string(i), at_);
      into[i] = number();
    }
  }

  void emit(Verb verb, std::initializer_list<double> values) {
    for (double value : values)
      if (!(std::fabs(value) <= FLT_MAX)) fail("the path reaches past the numbers a renderer draws", at_);
    path_.verbs.push_back(verb);
    for (double value : values) path_.points.push_back(static_cast<float>(value));
  }

  void run(char command) {
    const bool relative = command >= 'a';
    const char upper = static_cast<char>(relative ? command - 32 : command);

    if (upper == 'Z') {
      emit(Verb::Close, {});
      x_ = startX_, y_ = startY_;
      previous_ = 'Z';
      return;
    }

    bool first = true;
    do {
      segment(command, relative, first ? upper : (upper == 'M' ? 'L' : upper));
      first = false;
    } while (hasNumber());
  }

  void segment(char command, bool relative, char as) {
    const double dx = relative ? x_ : 0, dy = relative ? y_ : 0;
    double a[7];

    switch (as) {
    case 'M':
      arguments(command, 2, a);
      x_ = startX_ = a[0] + dx, y_ = startY_ = a[1] + dy;
      emit(Verb::Move, {x_, y_});
      break;
    case 'L':
      arguments(command, 2, a);
      lineTo(a[0] + dx, a[1] + dy);
      break;
    case 'H':
      arguments(command, 1, a);
      lineTo(a[0] + dx, y_);
      break;
    case 'V':
      arguments(command, 1, a);
      lineTo(x_, a[0] + dy);
      break;
    case 'C':
      arguments(command, 6, a);
      cubicTo(a[0] + dx, a[1] + dy, a[2] + dx, a[3] + dy, a[4] + dx, a[5] + dy);
      break;
    case 'S': {
      arguments(command, 4, a);
      const bool smooth = previous_ == 'C' || previous_ == 'S';
      cubicTo(smooth ? 2 * x_ - controlX_ : x_, smooth ? 2 * y_ - controlY_ : y_, a[0] + dx, a[1] + dy, a[2] + dx,
              a[3] + dy);
      break;
    }
    case 'Q':
      arguments(command, 4, a);
      quadTo(a[0] + dx, a[1] + dy, a[2] + dx, a[3] + dy);
      break;
    case 'T': {
      arguments(command, 2, a);
      const bool smooth = previous_ == 'Q' || previous_ == 'T';
      quadTo(smooth ? 2 * x_ - controlX_ : x_, smooth ? 2 * y_ - controlY_ : y_, a[0] + dx, a[1] + dy);
      break;
    }
    case 'A': {
      for (int i = 0; i < 3; ++i) {
        if (!hasNumber()) fail(std::string(1, command) + " takes 7 numbers, got " + std::to_string(i), at_);
        a[i] = number();
      }
      const bool large = flag();
      const bool sweep = flag();
      for (int i = 5; i < 7; ++i) {
        if (!hasNumber()) fail(std::string(1, command) + " takes 7 numbers, got " + std::to_string(i), at_);
        a[i] = number();
      }
      arcTo(a[0], a[1], a[2], large, sweep, a[5] + dx, a[6] + dy);
      break;
    }
    }
    previous_ = as;
  }

  void lineTo(double x, double y) {
    emit(Verb::Line, {x, y});
    x_ = x, y_ = y;
  }

  void cubicTo(double x1, double y1, double x2, double y2, double x, double y) {
    emit(Verb::Cubic, {x1, y1, x2, y2, x, y});
    controlX_ = x2, controlY_ = y2;
    x_ = x, y_ = y;
  }

  void quadTo(double x1, double y1, double x, double y) {
    emit(Verb::Quad, {x1, y1, x, y});
    controlX_ = x1, controlY_ = y1;
    x_ = x, y_ = y;
  }

  // SVG 2 appendix B.2.5 and B.2.4: out-of-range radii are corrected, and
  // the arc is drawn as cubics of at most a quarter turn each.
  void arcTo(double rx, double ry, double degrees, bool large, bool sweep, double x, double y) {
    if (x == x_ && y == y_) return;
    rx = std::fabs(rx), ry = std::fabs(ry);
    if (rx == 0 || ry == 0) return lineTo(x, y);

    const double phi = std::fmod(degrees, 360.0) * pi / 180.0;
    const double cosPhi = std::cos(phi), sinPhi = std::sin(phi);
    const double hx = (x_ - x) / 2, hy = (y_ - y) / 2;
    const double x1p = cosPhi * hx + sinPhi * hy;
    const double y1p = -sinPhi * hx + cosPhi * hy;

    const double lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
      const double scale = std::sqrt(lambda);
      rx *= scale, ry *= scale;
    }

    const double numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const double denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    double root = denominator == 0 ? 0 : std::sqrt(std::fmax(numerator / denominator, 0.0));
    if (large == sweep) root = -root;
    const double cxp = root * rx * y1p / ry;
    const double cyp = -root * ry * x1p / rx;
    const double cx = cosPhi * cxp - sinPhi * cyp + (x_ + x) / 2;
    const double cy = sinPhi * cxp + cosPhi * cyp + (y_ + y) / 2;

    const double theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    double delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && delta > 0) delta -= 2 * pi;
    if (sweep && delta < 0) delta += 2 * pi;

    const int segments = static_cast<int>(std::ceil(std::fabs(delta) / (pi / 2) - 1e-9));
    const double step = delta / std::max(segments, 1);
    // The control distance of a cubic that matches a circular arc of `step`.
    const double k = 4.0 / 3.0 * std::tan(step / 4);
    double start = theta;

    for (int i = 0; i < segments; ++i) {
      const double end = start + step;
      const double c1 = std::cos(start), s1 = std::sin(start), c2 = std::cos(end), s2 = std::sin(end);
      const auto point = [&](double ux, double uy, double* px, double* py) {
        *px = cx + rx * ux * cosPhi - ry * uy * sinPhi;
        *py = cy + rx * ux * sinPhi + ry * uy * cosPhi;
      };
      double p1x, p1y, p2x, p2y, ex, ey;
      point(c1 - k * s1, s1 + k * c1, &p1x, &p1y);
      point(c2 + k * s2, s2 - k * c2, &p2x, &p2y);
      if (i == segments - 1) ex = x, ey = y;
      else point(c2, s2, &ex, &ey);
      cubicTo(p1x, p1y, p2x, p2y, ex, ey);
      start = end;
    }
    x_ = x, y_ = y;
  }

  static double angle(double ux, double uy, double vx, double vy) {
    return std::atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  }
};

} // namespace detail

/// Throws std::invalid_argument for malformed data (see the top of the file).
inline Path parse(std::string_view data) { return detail::Parser(data).parse(); }

} // namespace kuito::path
