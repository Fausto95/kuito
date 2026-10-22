#pragma once
#include "Ablation.h"
#include "Effect.h"
#include "FrameLedger.h"
#include "Mutation.h"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace kuito {

/// One job's mutations, as the JS thread's runtime sent them.
struct Batch {
  std::vector<Mutation> mutations;
  /// When the JS thread sent it, in the platform's media clock (seconds).
  double sentAt = 0;
  /// The `__kuitoHostCommit` calls that carried it.
  std::size_t hostCalls = 0;
  /// The job that made it and why it ran, for frame receipts (FrameLedger.h).
  JobCause cause;
  /// Folded on the JS thread (Effect.h). A paint-only batch never marks layout.
  EffectSummary effects;
};

/// The one place batches cross from the JS thread to the UI thread
/// (docs/native-scheduling.md). The JS thread pushes each job's batch; the UI
/// thread drains them on the display frame within a budget, at least one per
/// frame. A frame that ends with batches left marks the handoff busy until
/// one drains it empty: the kernel holds its re-plans meanwhile.
class FrameHandoff {
public:
  /// Any thread. True when the handoff was idle: the caller asks for a frame.
  bool push(Batch batch) {
    std::lock_guard<std::mutex> lock(mutex_);
    const bool wake = queue_.empty() && !draining_;
    queue_.push_back(std::move(batch));
    return wake;
  }

  /// UI thread. Applies batches in order until none are left or `expired()`
  /// after one; a batch pushed while it runs waits for the next frame.
  template <class Expired, class Apply>
  void drain(Expired&& expired, Apply&& apply) {
    std::size_t due;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      due = queue_.size();
      draining_ = true;
    }
    struct Done {
      FrameHandoff& handoff;
      std::size_t& due;
      ~Done() {
        std::lock_guard<std::mutex> lock(handoff.mutex_);
        handoff.draining_ = false;
        handoff.busy_ = due > 0;
      }
    } done{*this, due};
    while (due > 0) {
      Batch batch;
      {
        std::lock_guard<std::mutex> lock(mutex_);
        if (queue_.empty()) break;
        batch = std::move(queue_.front());
        queue_.pop_front();
      }
      --due;
      apply(batch);
      if (expired()) break;
    }
  }

  /// Any thread: the last frame stopped with batches it was due to apply.
  bool busy() const { return busy_; }

  /// UI thread: batches wait for a frame.
  bool pending() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return !queue_.empty();
  }

  /// Batches waiting, for the commit log's frame gauge.
  std::size_t size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return queue_.size();
  }

  /// UI thread: native event `event` is about to go to the JS thread. A
  /// press, a change or an edit a field's format answers there (one the UI
  /// thread did not take) gets a number naming its job, for `inputDone` and
  /// `awaitInput`; any other event 0, which nothing waits for. So does an
  /// event a batch fires while it applies (Android's field runs its
  /// TextWatcher inside a text set): draining for it would apply batches
  /// inside that batch.
  std::uint64_t expectInput(const std::string& event) {
    if (event != "press" && event != "change" && event != "format") return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    if (draining_) return 0;
    return ++inputs_;
  }

  /// JS thread: input job `job` ended, its batch (if it made one) pushed.
  void inputDone(std::uint64_t job) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (job > answered_) answered_ = job;
    }
    inputAnswered_.notify_all();
  }

  /// UI thread: waits up to `budget` for input job `job`; true when it ended
  /// in time, so draining now applies its batch in this frame.
  /// The wait goes in the frame's receipts, counted as timed out when it ran
  /// out. Elided (Ablation.h), the thread does not wait.
  bool awaitInput(std::uint64_t job, std::chrono::microseconds budget = INPUT_BUDGET) {
    if (job == 0) return false;
    return ablated(Subsystem::AwaitInput, [&] { return waitForInput(job, budget); }, [] { return false; });
  }

  /// How long the UI thread waits for a press's or a change's job: Reel's
  /// handlers answer within it at the median on a one-core emulator, and a
  /// wait that runs out costs no more than the frame it tried to save
  /// (docs/sync-input-commits.md). Not to be tuned without measuring.
  static constexpr std::chrono::microseconds INPUT_BUDGET{4000};

  /// A runtime that goes drops what it sent.
  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.clear();
    busy_ = false;
  }

private:
  bool waitForInput(std::uint64_t job, std::chrono::microseconds budget) {
#if KUITO_INSTRUMENTS
    const double started = FrameLedger::now();
#endif
    std::unique_lock<std::mutex> lock(mutex_);
    const bool answered = inputAnswered_.wait_for(lock, budget, [&] { return answered_ >= job; });
#if KUITO_INSTRUMENTS
    frameLedger().record(Work::AwaitInput, started, FrameLedger::now(), {answered ? 0u : 1u, 0, 0, 0});
#endif
    return answered;
  }

  mutable std::mutex mutex_;
  std::deque<Batch> queue_;
  std::condition_variable inputAnswered_;
  std::uint64_t inputs_ = 0;
  std::uint64_t answered_ = 0;
  bool draining_ = false;
  std::atomic_bool busy_{false};
};

} // namespace kuito
