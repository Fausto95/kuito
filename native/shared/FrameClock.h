#pragma once
#include <cmath>

namespace kuito {

/// The latest display frame at or before `now`: the display link's last
/// frame, `timestamp`, stepped by its `interval`, all on one clock. The input
/// path drains at it, so the display frame after it never runs the UI kernel
/// at an earlier time (docs/native-scheduling.md#input). Before a first frame,
/// `now`.
inline double latestFrame(double now, double timestamp, double interval) {
  if (interval <= 0 || now < timestamp) return now;
  return timestamp + std::floor((now - timestamp) / interval) * interval;
}

} // namespace kuito
