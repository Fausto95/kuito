#pragma once
// Frame receipts (docs/performance.md#frame-receipts): each main-thread frame
// writes what ran in it, each item with its cost and the job that asked for
// it. When a frame drops, the ledger keeps its receipts and the two frames'
// before it, and the shell reports them in app terms. Main thread only.
// Writing a receipt takes a clock read and a few stores into fixed arrays: no
// strings, no allocation. Builds without KUITO_INSTRUMENTS (release shells)
// keep the ledger empty and write nothing.
#include "Instruments.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <functional>
#include <string>

namespace kuito {

/// What a receipt's work was.
enum class Work : std::uint8_t {
  /// The frame's drain of the JS thread's batches, around the batches it applied.
  Drain,
  /// One job's batch applied to the views; its cause is the job.
  ApplyBatch,
  /// The UI kernel's frame: animations, bindings.
  UIFrame,
  /// A native event offered to the UI kernel.
  UIEvent,
  /// The main thread waiting for an input's job (docs/sync-input-commits.md).
  AwaitInput,
  /// The engine laying a root out, or a pass's frames applied to the views.
  Layout,
  /// Leaves measured by the platform, one receipt per frame.
  Measure,
  /// Labels drawn, one receipt per frame.
  Redraw,
  /// Core Animation's commit at the end of the run loop turn (iOS).
  CACommit,
};

constexpr std::size_t kWorkKinds = 9;

inline const char* workName(Work kind) {
  switch (kind) {
  case Work::Drain: return "drain";
  case Work::ApplyBatch: return "applyBatch";
  case Work::UIFrame: return "uiFrame";
  case Work::UIEvent: return "uiEvent";
  case Work::AwaitInput: return "awaitInput";
  case Work::Layout: return "layout";
  case Work::Measure: return "measure";
  case Work::Redraw: return "redraw";
  case Work::CACommit: return "caCommit";
  }
  return "work";
}

/// One item of a frame's work. Times are seconds on the ledger's clock.
struct Receipt {
  Work kind = Work::Drain;
  double t0 = 0;
  double t1 = 0;
  /// What the work did, by kind: layout's nodes laid out, measures, nodes
  /// framed, wasted frames; a batch's records; an input wait's timeout (1).
  std::array<std::uint32_t, 4> counts{};
  /// The job whose batch asked for the work; 0 for none known.
  std::uint64_t cause = 0;
};

/// What the frame rule decided about one display frame.
struct FrameVerdict {
  /// Seconds the thread worked since the previous frame.
  double work = 0;
  /// Display frames skipped while the thread worked past one.
  int dropped = 0;
};

/// The skipped-vsync rule (as the performance monitors had it): a frame is
/// dropped when the display skipped vsyncs while the thread worked past an
/// interval. Busy but on time drops nothing, and neither does a late tick of
/// an idle thread. Times in seconds.
class FrameRule {
public:
  /// The thread woke to run work.
  void woke(double now) { awakeSince_ = now, awake_ = true; }

  /// The thread went back to sleep.
  void slept(double now) {
    if (!awake_) return;
    work_ += now - awakeSince_;
    awake_ = false;
  }

  /// A display frame at `now`, for the vsync at `vsync`, `interval` apart.
  FrameVerdict frame(double now, double vsync, double interval) {
    if (awake_) {
      work_ += now - awakeSince_;
      awakeSince_ = now;
    }
    const double done = work_;
    const int skipped = hasVsync_ ? static_cast<int>(std::lround((vsync - lastVsync_) / interval)) - 1 : 0;
    work_ = 0;
    lastVsync_ = vsync;
    hasVsync_ = true;
    return {done, done > interval && skipped > 0 ? skipped : 0};
  }

private:
  double awakeSince_ = 0;
  bool awake_ = false;
  double work_ = 0;
  double lastVsync_ = 0;
  bool hasVsync_ = false;
};

/// Why a job ran, as the JS thread's runtime started it: an event on a view,
/// a timer, a request's answer, a script.
struct JobCause {
  enum class Entry : std::uint8_t { Unknown, Event, Timer, Network, Script, Module };
  std::uint64_t job = 0;
  Entry entry = Entry::Unknown;
  /// The view an event came from; 0 for the app.
  std::uint32_t handle = 0;
  std::string event;
};

class FrameLedger {
public:
  /// Receipts one frame keeps; the rest only count in `overflowed`.
  static constexpr std::size_t kPerFrame = 64;
  /// A drop keeps its frame and the two before it.
  static constexpr std::size_t kKept = 3;
  /// Recent jobs' causes, for naming a drop's jobs.
  static constexpr std::size_t kCauses = 16;

  struct Frame {
    std::array<Receipt, kPerFrame> receipts{};
    std::size_t count = 0;
    std::size_t overflowed = 0;
    FrameVerdict verdict;
  };

  /// The frames of the last drop, oldest first; the last one dropped.
  struct Drop {
    std::array<Frame, kKept> frames{};
    std::size_t count = 0;
    /// Counts up with each drop the ledger keeps.
    std::uint64_t sequence = 0;
  };

  /// The ledger's clock, in seconds: monotonic, the same on every thread.
  static double now() {
    return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
  }

  /// A receipt for work that ran from `t0` to `t1`. With no cause given, the
  /// work batches cause names the last job applied since the frame began.
  void record(Work kind, double t0, double t1, std::array<std::uint32_t, 4> counts = {}, std::uint64_t cause = 0) {
#if KUITO_INSTRUMENTS
    if (kind == Work::ApplyBatch && cause) applied_ = cause;
    if (!cause && causedByBatches(kind)) cause = applied_;
    Frame& frame = frames_[current_];
    if (frame.count == kPerFrame) {
      ++frame.overflowed;
      return;
    }
    frame.receipts[frame.count++] = Receipt{kind, t0, t1, counts, cause};
#else
    (void)kind, (void)t0, (void)t1, (void)counts, (void)cause;
#endif
  }

  /// Short work that happens many times a frame (measures, redraws) adds to
  /// one receipt of its kind, written when the frame ends.
  void add(Work kind, double seconds, std::uint32_t count = 1) {
#if KUITO_INSTRUMENTS
    Tally& tally = tallies_[static_cast<std::size_t>(kind)];
    if (tally.count == 0) tally.first = now() - seconds;
    tally.seconds += seconds;
    tally.count += count;
#else
    (void)kind, (void)seconds, (void)count;
#endif
  }

  /// A job's batch is about to apply: remembers why the job ran.
  void applying(JobCause& cause) {
#if KUITO_INSTRUMENTS
    if (cause.job == 0) return;
    applied_ = cause.job;
    JobCause& slot = causes_[nextCause_];
    nextCause_ = (nextCause_ + 1) % kCauses;
    slot.job = cause.job;
    slot.entry = cause.entry;
    slot.handle = cause.handle;
    // A swap: the slot's old name leaves with the batch.
    slot.event.swap(cause.event);
#else
    (void)cause;
#endif
  }

  /// Why job `job` ran, if it is among the recent ones.
  const JobCause* causeOf(std::uint64_t job) const {
    for (const JobCause& cause : causes_)
      if (cause.job == job && job != 0) return &cause;
    return nullptr;
  }

  void woke(double now) { rule_.woke(now); }
  void slept(double now) { rule_.slept(now); }

  /// The display frame: closes the frame's receipts, and keeps them with the
  /// two frames before when it dropped. `vsync` and `interval` in seconds.
  FrameVerdict frame(double now, double vsync, double interval) {
    const FrameVerdict verdict = rule_.frame(now, vsync, interval);
#if KUITO_INSTRUMENTS
    for (std::size_t kind = 0; kind < kWorkKinds; ++kind) {
      Tally& tally = tallies_[kind];
      if (tally.count == 0) continue;
      record(static_cast<Work>(kind), tally.first, tally.first + tally.seconds, {tally.count, 0, 0, 0});
      tally = Tally{};
    }
    frames_[current_].verdict = verdict;
    if (verdict.dropped > 0) keep();
    current_ = (current_ + 1) % kKept;
    frames_[current_].count = 0;
    frames_[current_].overflowed = 0;
    frames_[current_].verdict = {};
    applied_ = 0;
#endif
    return verdict;
  }

  /// Work a frame does for the batches it applied: the views' layout, measures, redraws, commit.
  static bool causedByBatches(Work kind) {
    return kind == Work::Layout || kind == Work::Measure || kind == Work::Redraw || kind == Work::CACommit;
  }

  /// The receipts of the frame being built.
  const Frame& current() const { return frames_[current_]; }

  /// The last drop kept; `sequence` 0 before any.
  const Drop& lastDrop() const { return drop_; }

  /// Forgets everything, for a test.
  void reset() { *this = FrameLedger(); }

private:
  struct Tally {
    double first = 0;
    double seconds = 0;
    std::uint32_t count = 0;
  };

  void keep() {
    const std::uint64_t sequence = drop_.sequence + 1;
    drop_.count = 0;
    for (std::size_t back = kKept; back > 0; --back) {
      const Frame& frame = frames_[(current_ + kKept + 1 - back) % kKept];
      if (back > 1 && frame.count == 0 && frame.verdict.work == 0) continue;
      drop_.frames[drop_.count++] = frame;
    }
    drop_.sequence = sequence;
  }

  FrameRule rule_;
  std::array<Frame, kKept> frames_{};
  std::size_t current_ = 0;
  std::array<Tally, kWorkKinds> tallies_{};
  std::array<JobCause, kCauses> causes_{};
  [[maybe_unused]] std::size_t nextCause_ = 0;
  /// The last job a batch applied for in this frame.
  [[maybe_unused]] std::uint64_t applied_ = 0;
  Drop drop_;
};

/// The main thread's ledger.
inline FrameLedger& frameLedger() {
  static FrameLedger ledger;
  return ledger;
}

/// Records the work `body` does as one receipt of `kind`.
template <class Body>
auto timed(Work kind, Body&& body, std::uint64_t cause = 0, std::array<std::uint32_t, 4> counts = {})
    -> decltype(body()) {
#if KUITO_INSTRUMENTS
  struct Write {
    Work kind;
    std::uint64_t cause;
    std::array<std::uint32_t, 4> counts;
    double t0 = FrameLedger::now();
    ~Write() { frameLedger().record(kind, t0, FrameLedger::now(), counts, cause); }
  } write{kind, cause, counts};
#else
  (void)kind, (void)cause, (void)counts;
#endif
  return body();
}

namespace receipts {

inline std::string milliseconds(double seconds) {
  char text[32];
  std::snprintf(text, sizeof text, "%.1f ms", seconds * 1000);
  return text;
}

/// What a job's cause says in a report: `press on like`.
inline std::string describe(const JobCause& cause, const std::function<std::string(std::uint32_t)>& view) {
  switch (cause.entry) {
  case JobCause::Entry::Event: return cause.event + " on " + (cause.handle ? view(cause.handle) : "the app");
  case JobCause::Entry::Timer: return "a timer";
  case JobCause::Entry::Network: return "a network answer";
  case JobCause::Entry::Script: return "a script";
  case JobCause::Entry::Module: return "a native module";
  case JobCause::Entry::Unknown: break;
  }
  return "job " + std::to_string(cause.job);
}

} // namespace receipts

/// Whether the frame that dropped did Kuito work worth a report: a receipt
/// of a tenth of a millisecond or more. Otherwise the platform's own work
/// (a system sheet, the LogBox itself) or a native module's took the time.
inline bool receipted(const FrameLedger::Drop& drop) {
  if (drop.count == 0) return false;
  const FrameLedger::Frame& last = drop.frames[drop.count - 1];
  for (std::size_t r = 0; r < last.count; ++r)
    if (last.receipts[r].t1 - last.receipts[r].t0 >= 0.0001) return true;
  return false;
}

/// A drop as one line: `Dropped 2 frames (23.1 ms): layout 14.2 ms (812
/// nodes laid out) ← job 482 (press on like); uiFrame 5.0 ms; awaitInput
/// 3.9 ms (timed out)`. Work kinds by cost in the frame that dropped (the
/// frames before it stay in `drop`); `view` names a view by its number.
inline std::string describeDrop(const FrameLedger& ledger, const FrameLedger::Drop& drop,
                                const std::function<std::string(std::uint32_t)>& view) {
  if (drop.count == 0) return "";
  struct Sum {
    double seconds = 0;
    std::array<std::uint64_t, 4> counts{};
    std::uint64_t cause = 0;
    double causeSeconds = 0;
  };
  std::array<Sum, kWorkKinds> sums{};
  const FrameLedger::Frame& last = drop.frames[drop.count - 1];
  for (std::size_t r = 0; r < last.count; ++r) {
    const Receipt& receipt = last.receipts[r];
    Sum& sum = sums[static_cast<std::size_t>(receipt.kind)];
    const double seconds = receipt.t1 - receipt.t0;
    sum.seconds += seconds;
    for (std::size_t c = 0; c < 4; ++c) sum.counts[c] += receipt.counts[c];
    if (receipt.cause && seconds >= sum.causeSeconds) sum.cause = receipt.cause, sum.causeSeconds = seconds;
  }
  std::array<std::size_t, kWorkKinds> order{};
  for (std::size_t i = 0; i < kWorkKinds; ++i) order[i] = i;
  std::sort(order.begin(), order.end(),
            [&](std::size_t a, std::size_t b) { return sums[a].seconds > sums[b].seconds; });

  std::string line = "Dropped " + std::to_string(last.verdict.dropped) + " frame" +
                     (last.verdict.dropped == 1 ? "" : "s") + " (" + receipts::milliseconds(last.verdict.work) + "):";
  bool first = true;
  for (const std::size_t kind : order) {
    const Sum& sum = sums[kind];
    // A tenth of a millisecond is below what a report can act on.
    if (sum.seconds < 0.0001) continue;
    line += first ? " " : "; ";
    first = false;
    line += std::string(workName(static_cast<Work>(kind))) + " " + receipts::milliseconds(sum.seconds);
    const Work work = static_cast<Work>(kind);
    if (work == Work::Layout && (sum.counts[0] || sum.counts[2]))
      line += " (" + std::to_string(sum.counts[0]) + " nodes laid out, " + std::to_string(sum.counts[2]) + " framed)";
    else if ((work == Work::Measure || work == Work::Redraw || work == Work::ApplyBatch) && sum.counts[0])
      line += " (" + std::to_string(sum.counts[0]) +
              (work == Work::Measure  ? " measures)"
               : work == Work::Redraw ? " labels)"
                                      : " records)");
    else if (work == Work::AwaitInput && sum.counts[0]) line += " (timed out)";
    if (sum.cause) {
      const JobCause* cause = ledger.causeOf(sum.cause);
      line += " ← job " + std::to_string(sum.cause);
      if (cause) line += " (" + receipts::describe(*cause, view) + ")";
    }
  }
  // The thread worked, but in nothing Kuito writes receipts for: the
  // platform's own work, or a native module's.
  if (first)
    line += " no receipt covers it (" + std::to_string(last.count) +
            " receipts under 0.1 ms): platform or native module work";
  return line;
}

} // namespace kuito
