#pragma once
#include "Mutation.h"
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace kuito {

// JSON made and parsed to cross a boundary between the runtimes, the C++ and
// the renderers, since launch (docs/performance.md#json-at-the-boundary). The
// performance monitor and the commit log's frame gauge read it on the UI
// thread; the JS thread adds to it, hence atomics.
struct WireWork {
  /// Display frames the UI runtime drained batches on: the per-frame figures' denominator.
  std::atomic<std::uint64_t> frames{0};
  std::atomic<std::uint64_t> jsonParses{0};
  /// The JSON's length in UTF-16 code units for what JavaScript made, bytes for what C++ made.
  std::atomic<std::uint64_t> bytesStringified{0};
};

/// The process's counters: every session's runtimes add to them.
inline WireWork& wireWork() {
  static WireWork work;
  return work;
}

/// The JSON prop values in a batch: each one the renderer parses.
inline std::uint64_t jsonValues(const std::vector<Mutation>& mutations) {
  std::uint64_t count = 0;
  for (const auto& m : mutations)
    if (m.op == Op::Prop && m.kind == Value::Json) ++count;
  return count;
}

/// A JavaScript runtime's own counters, which only grow: each read adds what
/// they grew by since the last one. One per runtime, read on its thread.
class WorkTally {
public:
  void read(WireWork& into, double jsonParses, double bytesStringified) {
    into.jsonParses += grown(jsonParses, jsonParses_);
    into.bytesStringified += grown(bytesStringified, bytesStringified_);
  }

private:
  static std::uint64_t grown(double now, double& last) {
    const double by = now > last ? now - last : 0;
    last = now;
    return static_cast<std::uint64_t>(by);
  }
  double jsonParses_ = 0;
  double bytesStringified_ = 0;
};

} // namespace kuito
