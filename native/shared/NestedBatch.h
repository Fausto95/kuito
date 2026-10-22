#pragma once

#include <cstddef>
#include <utility>
#include <vector>

namespace kuito {

// The items entries into one runtime produce, when entries nest: a host
// function calls back into the runtime, or a view fires an event while the
// previous items are being applied. Only the outermost entry flushes, after its
// work and again for whatever nested entries added meanwhile, so a nested write
// lands after, never under, the batch around it, and no flush runs inside
// another. A nested entry that fails discards only its own items.
template <class Item>
class NestedBatch final {
public:
  void push(Item item) { items_.push_back(std::move(item)); }

  /// `work(outermost)`, then, for the outermost entry, `flush(items)` until none
  /// are left. Throws what `work` throws, with the items it pushed discarded.
  template <class Work, class Flush>
  auto run(Work&& work, Flush&& flush) -> decltype(work(true)) {
    const bool outermost = !running_;
    const size_t mark = items_.size();
    Running running(running_);
    try {
      auto result = work(outermost);
      if (!outermost) return result;
      while (!items_.empty()) {
        std::vector<Item> items;
        items.swap(items_);
        flush(std::move(items));
      }
      return result;
    } catch (...) {
      if (items_.size() > mark) items_.erase(items_.begin() + static_cast<std::ptrdiff_t>(mark), items_.end());
      throw;
    }
  }

private:
  /// Marks an entry in progress; the outermost one clears it however it ends.
  class Running final {
  public:
    explicit Running(bool& running) : running_(running), outer_(running) { running_ = true; }
    ~Running() { running_ = outer_; }
    Running(const Running&) = delete;
    Running& operator=(const Running&) = delete;

  private:
    bool& running_;
    const bool outer_;
  };

  std::vector<Item> items_;
  bool running_ = false;
};

} // namespace kuito
