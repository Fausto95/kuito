// Cases for native/shared/PathData.h, then a fuzz pass: any input either
// parses or throws std::invalid_argument naming KUITO_PATH.
#include "PathData.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>

using kuito::path::Path;
using kuito::path::Verb;

static int failures = 0;

static void expect(bool condition, const std::string &what) {
  if (condition)
    return;
  std::printf("FAIL: %s\n", what.c_str());
  ++failures;
}

static bool near(float a, float b) { return std::fabs(a - b) < 1e-3f; }

static bool points(const Path &path, const std::vector<float> &expected) {
  if (path.points.size() != expected.size())
    return false;
  for (std::size_t i = 0; i < expected.size(); ++i)
    if (!near(path.points[i], expected[i]))
      return false;
  return true;
}

static std::string verbs(const Path &path) {
  std::string text;
  for (Verb verb : path.verbs)
    text += "MLQCZ"[static_cast<int>(verb)];
  return text;
}

static std::string rejection(const std::string &d) {
  try {
    kuito::path::parse(d);
  } catch (const std::invalid_argument &error) {
    return error.what();
  }
  return "";
}

static void absoluteAndRelativeCommands() {
  Path path = kuito::path::parse("M10 20L30 40Z");
  expect(verbs(path) == "MLZ", "moveto, lineto, closepath");
  expect(points(path, {10, 20, 30, 40}), "their points");

  path = kuito::path::parse("m10 20 l5 5 h10 v-5 H0 V0 z");
  expect(verbs(path) == "MLLLLLZ",
         "relative commands and horizontal and vertical lines become lines");
  expect(points(path, {10, 20, 15, 25, 25, 25, 25, 20, 0, 20, 0, 0}),
         "relative to the current point");
}

static void implicitCommands() {
  Path path = kuito::path::parse("M1,2 3,4 5,6");
  expect(verbs(path) == "MLL", "coordinates after a moveto are linetos");

  path = kuito::path::parse("m1 1 2 2");
  expect(points(path, {1, 1, 3, 3}), "relative after a relative moveto");

  path = kuito::path::parse("M0 0Z L5 5");
  expect(points(path, {0, 0, 5, 5}),
         "after a closepath, the current point is the subpath's start");
}

static void numbers() {
  expect(points(kuito::path::parse("M.5.5"), {0.5f, 0.5f}),
         "a second dot starts a number");
  expect(points(kuito::path::parse("M1e2-3"), {100, -3}),
         "an exponent, and a sign starts a number");
  expect(points(kuito::path::parse("M-1.5E-1+2"), {-0.15f, 2}),
         "signs and a capital exponent");
  expect(kuito::path::parse("").verbs.empty(), "no data is no path");
  expect(kuito::path::parse("  \n\t ").verbs.empty(),
         "whitespace alone is no path");
}

static void curves() {
  Path path = kuito::path::parse("M0 0C1 1 2 1 3 0S5 -1 6 0");
  expect(verbs(path) == "MCC", "cubics");
  expect(points(path, {0, 0, 1, 1, 2, 1, 3, 0, 4, -1, 5, -1, 6, 0}),
         "s reflects the last control point");

  path = kuito::path::parse("M0 0Q1 1 2 0T4 0");
  expect(verbs(path) == "MQQ", "quadratics");
  expect(points(path, {0, 0, 1, 1, 2, 0, 3, -1, 4, 0}),
         "t reflects the last control point");

  path = kuito::path::parse("M0 0L1 1S2 2 3 3");
  expect(points(path, {0, 0, 1, 1, 1, 1, 2, 2, 3, 3}),
         "s after a line takes the current point as its first control");
}

static void arcs() {
  Path path = kuito::path::parse("M0 0A10 10 0 0 1 20 0");
  expect(verbs(path).substr(0, 2) == "MC", "an arc becomes cubics");
  expect(near(path.points[path.points.size() - 2], 20) &&
             near(path.points.back(), 0),
         "ending where the arc ends");

  path = kuito::path::parse("M0 0a1 1 0 00 2 0");
  expect(near(path.points[path.points.size() - 2], 2),
         "flags written with no space between them");

  path = kuito::path::parse("M0 0A0 5 0 0 1 10 0");
  expect(verbs(path) == "ML", "a zero radius draws a line");

  path = kuito::path::parse("M0 0A1 1 0 0 1 10 0");
  expect(near(path.points[path.points.size() - 2], 10),
         "radii too small to reach are scaled up");

  path = kuito::path::parse("M5 5A3 3 0 0 1 5 5");
  expect(verbs(path) == "M", "an arc that ends where it starts draws nothing");
}

static void errors() {
  const struct {
    const char *d;
    const char *message;
  } cases[] = {
      {"L1 2",
       "KUITO_PATH: path data starts with a moveto, not L, at 0 in \"L1 2\""},
      {"M1", "KUITO_PATH: M takes 2 numbers, got 1, at 2 in \"M1\""},
      {"M1 2 X", "KUITO_PATH: X is no path command, at 5 in \"M1 2 X\""},
      {"M0 0A1 1 0 2 0 3 3",
       "KUITO_PATH: an arc's flag is 0 or 1, at 11 in \"M0 0A1 1 0 2 0 3 3\""},
      {"M1e999 0",
       "KUITO_PATH: 1e999 is no finite number, at 1 in \"M1e999 0\""},
      {"M1 2 L", "KUITO_PATH: L takes 2 numbers, got 0, at 6 in \"M1 2 L\""},
      {"M1 2,",
       "KUITO_PATH: a comma comes between numbers, at 5 in \"M1 2,\""},
  };

  for (const auto &each : cases)
    expect(rejection(each.d) == each.message,
           std::string("rejects ") + each.d + ": " + rejection(each.d));

  expect(rejection("\xC2\xA0M0 0") ==
             "KUITO_PATH: path data starts with a moveto, not byte 0xc2, at 0 "
             "in \"??M0 0\"",
         "a byte that is no character is named, never copied: " +
             rejection("\xC2\xA0M0 0"));

  const std::string longest(200, '1');
  expect(rejection("M" + longest).find("...") != std::string::npos,
         "a long path is cut short in its error");
}

static void fuzz() {
  const std::string alphabet = "MmLlHhVvCcSsQqTtAaZz0123456789.-+eE ,\t\n";
  const std::vector<std::string> seeds = {
      "M10 20L30 40Z",
      "M0 0A10 10 0 0 1 20 0",
      "m1 1c1 1 2 2 3 3s4 4 5 5q1 1 2 2t3 3z",
      "M.5.5h1v1H0V0",
  };
  std::mt19937 random(5);
  int parsed = 0;

  for (int round = 0; round < 200000; ++round) {
    std::string d;

    if (round % 2) {
      const std::size_t length = random() % 48;
      for (std::size_t i = 0; i < length; ++i)
        d += round % 10 == 1 ? static_cast<char>(random() % 256)
                             : alphabet[random() % alphabet.size()];
    } else {
      d = seeds[random() % seeds.size()];
      const int edits = 1 + static_cast<int>(random() % 4);
      for (int edit = 0; edit < edits && !d.empty(); ++edit) {
        const std::size_t at = random() % d.size();
        switch (random() % 3) {
        case 0:
          d.erase(at, 1);
          break;
        case 1:
          d.insert(at, 1, alphabet[random() % alphabet.size()]);
          break;
        default:
          d[at] = alphabet[random() % alphabet.size()];
        }
      }
    }

    try {
      Path path = kuito::path::parse(d);
      std::size_t expected = 0;
      for (Verb verb : path.verbs)
        expected += kuito::path::pointCount(verb);
      if (expected != path.points.size())
        expect(false, "points match verbs for \"" + d + "\"");
      for (float value : path.points)
        if (!std::isfinite(value))
          expect(false, "finite points for \"" + d + "\"");
      ++parsed;
    } catch (const std::invalid_argument &error) {
      for (const char c : std::string(error.what()))
        if (static_cast<unsigned char>(c) >= 0x80)
          expect(false, "an ASCII error for \"" + d + "\"");
      if (std::string(error.what()).rfind("KUITO_PATH: ", 0) != 0)
        expect(false, "a KUITO_PATH error for \"" + d + "\"");
    }
  }

  expect(parsed > 0, "some fuzzed input parses");
}

int main() {
  absoluteAndRelativeCommands();
  implicitCommands();
  numbers();
  curves();
  arcs();
  errors();
  fuzz();

  if (failures)
    return EXIT_FAILURE;
  std::printf("KUITO_PATH_DATA_PASS\n");
  return EXIT_SUCCESS;
}
