// UIRuntime's entries nest: a view fires an event while props are applied, a
// host function calls back into the runtime. NestedBatch keeps their props in order.
#include "NestedBatch.h"

#include <functional>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {
using Batch = kuito::NestedBatch<std::string>;
using Flushes = std::vector<std::vector<std::string>>;

int failures = 0;
void expect(bool condition, const std::string& message) {
  if (!condition) { ++failures; std::cerr << "FAIL: " << message << "\n"; }
}

struct Recorder {
  Flushes flushes;
  int flushing = 0;
  bool reentered = false;
  /// Runs while a flush delivers its items, as a view's event does.
  std::function<void()> during;
  void operator()(std::vector<std::string> items) {
    if (flushing) reentered = true;
    ++flushing;
    flushes.push_back(std::move(items));
    if (auto next = std::exchange(during, nullptr)) next();
    --flushing;
  }
};
} // namespace

int main() {
  {
    Batch batch;
    Recorder flush;
    bool outermost = false;
    const int result = batch.run([&](bool first) {
      outermost = first;
      batch.push("a");
      batch.push("b");
      return 7;
    }, std::ref(flush));
    expect(result == 7, "run returns the work's result");
    expect(outermost, "a lone entry is the outermost");
    expect(flush.flushes == Flushes{{"a", "b"}}, "a lone entry flushes its items once");
  }

  {
    Batch batch;
    Recorder flush;
    bool nestedOutermost = true;
    batch.run([&](bool) {
      batch.push("a");
      batch.run([&](bool first) {
        nestedOutermost = first;
        batch.push("b");
        return true;
      }, std::ref(flush));
      expect(flush.flushes.empty(), "an entry nested in the work does not flush");
      batch.push("c");
      return true;
    }, std::ref(flush));
    expect(!nestedOutermost, "an entry nested in the work is not the outermost");
    expect(flush.flushes == Flushes{{"a", "b", "c"}}, "nested items flush with the outer ones, in order");
  }

  {
    Batch batch;
    Recorder flush;
    flush.during = [&] {
      batch.run([&](bool) {
        batch.push("b");
        return true;
      }, std::ref(flush));
    };
    batch.run([&](bool) {
      batch.push("a");
      return true;
    }, std::ref(flush));
    expect(!flush.reentered, "an entry nested in a flush does not flush inside it");
    expect(flush.flushes == (Flushes{{"a"}, {"b"}}), "items an entry made during a flush follow it");
  }

  {
    Batch batch;
    Recorder flush;
    batch.run([&](bool) {
      batch.push("a");
      try {
        batch.run([&](bool) -> bool {
          batch.push("b");
          throw std::runtime_error("nested");
        }, std::ref(flush));
      } catch (const std::runtime_error&) {}
      batch.push("c");
      return true;
    }, std::ref(flush));
    expect(flush.flushes == Flushes{{"a", "c"}}, "a failed nested entry discards only its own items");
  }

  {
    Batch batch;
    Recorder flush;
    bool threw = false;
    try {
      batch.run([&](bool) -> bool {
        batch.push("a");
        throw std::runtime_error("outer");
      }, std::ref(flush));
    } catch (const std::runtime_error&) { threw = true; }
    expect(threw, "a failed entry rethrows");
    expect(flush.flushes.empty(), "a failed entry flushes nothing");
    bool outermost = false;
    batch.run([&](bool first) {
      outermost = first;
      batch.push("x");
      return true;
    }, std::ref(flush));
    expect(outermost, "the entry after a failure is the outermost again");
    expect(flush.flushes == Flushes{{"x"}}, "the entry after a failure flushes only its own items");
  }

  if (failures) return 1;
  std::cout << "KUITO_NESTED_BATCH_PASS\n";
  return 0;
}
