#pragma once
#include "Mutation.h"
#include <cstddef>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace kuito {

/// The views the kernel's batches built, by id: what each batch is checked
/// against before any of it reaches the platform. A batch that creates an id
/// that exists, inserts under a parent that does not, removes a parent before
/// its children or writes to a view that is gone is rejected whole. A job's
/// batches stay revocable until it settles: a job that fails takes them back.
/// The renderers hold the views themselves; this holds only what checks them.
class ViewTable {
public:
  struct Entry {
    std::string kind;
    std::string label;
    std::uint32_t parent = 0;
    std::size_t children = 0;
  };

  /// Applies `batch`, or throws std::invalid_argument and leaves the table as it was.
  void apply(const std::vector<Mutation>& batch);
  /// The job ended: its batches stay.
  void settle() { undo_.clear(); }
  /// The job failed: every batch it applied since it began goes.
  void discard();

  bool contains(std::uint32_t id) const { return views_.count(id) != 0; }
  std::uint32_t parentOf(std::uint32_t id) const;
  std::size_t size() const { return views_.size(); }

private:
  /// The entry `id` had before a change, or none.
  struct Undo {
    std::uint32_t id;
    bool existed;
    Entry entry;
  };

  void check(const Mutation& m) const;
  void change(const Mutation& m);
  void remember(std::uint32_t id);
  void rollback(std::size_t mark);
  std::string describe(std::uint32_t id) const;

  std::unordered_map<std::uint32_t, Entry> views_;
  std::vector<Undo> undo_;
};

} // namespace kuito
