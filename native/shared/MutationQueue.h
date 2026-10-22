#pragma once
#include "Mutation.h"
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

namespace kuito {

// Native views may change several times during a single JS job. Preserve
// structural operations in order, but keep only the last write per property
// within each fenced span, at the position of that last write. A key diff
// edits the keys before it (docs/lists.md#keys): it is never dropped, and no
// write of its prop merges across it.
class MutationQueue {
public:
  MutationQueue() = default;
  // Its named keys read its own slots: a copy would read another queue's.
  MutationQueue(const MutationQueue&) = delete;
  MutationQueue& operator=(const MutationQueue&) = delete;

  void push(Mutation change) {
    slots_.push_back({std::move(change), true});
    ++live_;
    const Mutation& placed = slots_.back().change;
    if (fences(placed.op)) {
      // Creation/removal may change what an ID refers to, and UI-thread
      // operations and commands run between the writes around them. Never
      // merge a write across one.
      keyed_.clear();
      named_.clear();
    } else if (placed.op == Op::Prop && placed.kind == Value::Keys) {
      keyed_.erase(keyOf(placed));
    } else if (placed.op == Op::Prop) {
      supersede(slotOf(placed));
    }
  }

  std::vector<Mutation> take() {
    std::vector<Mutation> result;
    result.reserve(live_);
    for (Slot& slot : slots_)
      if (slot.live) result.push_back(std::move(slot.change));
    clear();
    return result;
  }

  void clear() noexcept {
    keyed_.clear();
    named_.clear();
    slots_.clear();
    live_ = 0;
  }

  size_t size() const noexcept { return live_; }

private:
  // A move changes where a view sits, not what its ID refers to, so writes
  // merge across it. Flattening swaps the native view a later write lands on.
  static bool fences(Op op) {
    switch (op) {
    case Op::Prop:
    case Op::Move: return false;
    case Op::Create:
    case Op::Remove:
    case Op::Flatten:
    case Op::Command:
    case Op::UI:
    case Op::UIScript:
    case Op::UIKernel:
    case Op::UIBundle: return true;
    }
    return true;
  }

  /// Where the write just placed last had its earlier write, found or made.
  /// A named write is keyed by the slot of the first write to its view and
  /// name, read through `slots_`, so no key string is built.
  size_t& slotOf(const Mutation& change) {
    const size_t next = slots_.size() - 1;
    if (change.key == kNamedProp) return named_.emplace(next, next).first->second;
    return keyed_.emplace(keyOf(change), next).first->second;
  }

  static std::uint64_t keyOf(const Mutation& change) {
    return std::uint64_t{change.id} << 32 | static_cast<std::uint16_t>(change.key);
  }

  void supersede(size_t& slot) {
    const size_t next = slots_.size() - 1;
    if (slot == next) return;
    slots_[slot].live = false;
    --live_;
    slot = next;
  }

  struct Slot {
    Mutation change;
    bool live;
  };

  /// A named write's slot, hashed and compared by its view and name.
  struct NamedHash {
    const std::vector<Slot>* slots;
    size_t operator()(size_t slot) const {
      const Mutation& change = (*slots)[slot].change;
      return std::hash<std::string_view>()(change.name) ^ change.id;
    }
  };

  struct NamedEqual {
    const std::vector<Slot>* slots;
    bool operator()(size_t a, size_t b) const {
      const Mutation& one = (*slots)[a].change;
      const Mutation& other = (*slots)[b].change;
      return one.id == other.id && one.name == other.name;
    }
  };

  std::vector<Slot> slots_;
  size_t live_ = 0;
  std::unordered_map<std::uint64_t, size_t> keyed_;
  std::unordered_map<size_t, size_t, NamedHash, NamedEqual> named_{0, NamedHash{&slots_}, NamedEqual{&slots_}};
};

} // namespace kuito
