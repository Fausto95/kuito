#pragma once
#include "PlainValue.h"
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>

namespace kuito {

// The latest value of each motion value. The UI runtime writes it after every
// change, with the JS thread's last write it has applied: a number as one,
// anything else as plain data (PlainValue.h), never JSON. The JS thread reads
// it without waiting for the UI thread (see docs/motion.md). One mirror per
// app session: both runtimes of a session share it, and a new session starts
// empty.
class MotionMirror {
public:
  /// What `readNumber` found: a number at least as new as the JS thread's last
  /// write, nothing that new, or a value that is not a number (read it whole).
  enum class Fresh { Number, Stale, Other };

  struct Answer {
    Fresh kind;
    double value;
  };

  /// A value as `read` finds it, and the JS-thread write it includes.
  struct Entry {
    PlainValue value;
    double js = 0;
  };

  void write(const std::string& id, PlainValue value, double js) {
    std::lock_guard<std::mutex> lock(mutex_);
    values_[id] = Entry{std::move(value), js};
  }

  void writeNumber(const std::string& id, double value, double js) {
    PlainValue number;
    number.kind = PlainValue::Kind::Number;
    number.number = value;
    write(id, std::move(number), js);
  }

  std::optional<Entry> read(const std::string& id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto found = values_.find(id);
    if (found == values_.end()) return std::nullopt;
    return found->second;
  }

  Answer readNumber(const std::string& id, double version) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto found = values_.find(id);
    if (found == values_.end()) return {Fresh::Stale, 0};
    if (found->second.value.kind != PlainValue::Kind::Number) return {Fresh::Other, 0};
    if (found->second.js < version) return {Fresh::Stale, 0};
    return {Fresh::Number, found->second.value.number};
  }

  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    values_.clear();
  }

  /// Motion values held, for the commit log's frame gauge.
  std::size_t size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return values_.size();
  }

private:
  mutable std::mutex mutex_;
  std::unordered_map<std::string, Entry> values_;
};

} // namespace kuito
