#pragma once
// The cells a list's rows render into, and which shows which key, for both
// renderers' lists: Views/KuitoListCells adapts it on each platform, which
// keeps the views. A key keeps its cell; a new key takes the least recently
// used cell outside the window, else a new one, and the renderer asks
// JavaScript to render it.
#include <cstddef>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace kuito {

class ListCells {
public:
  /// Off-window cells kept for rows the user scrolls back to.
  static constexpr std::size_t spares = 8;

  /// Slots go by number. Numbers are never reused, so a renderer may keep
  /// its views by them: a number it has not seen is a new slot.
  explicit ListCells(std::string list) : list_(std::move(list)) {}

  /// The keys the list renders ahead: their cells are not reused.
  void setWindow(std::vector<std::string> keys) { window_ = {keys.begin(), keys.end()}; }

  /// The slot holding `key`, now its most recent use; -1 when none does.
  std::int32_t find(const std::string& key) {
    ++clock_;
    auto found = byKey_.find(key);
    if (found == byKey_.end()) return -1;
    slots_[found->second].lastUse = clock_;
    return found->second;
  }

  /// Gives `key`, which no slot holds, a slot: once the list has a cell for
  /// each window key and the spares, the least recently used one that is not
  /// `held` (on screen) and shows no window key; else a new one. Its old key
  /// goes. JavaScript is to render `key` into it.
  std::int32_t place(const std::string& key, const std::vector<std::int32_t>& held) {
    ++clock_;
    if (byKey_.count(key)) throw std::invalid_argument("List " + list_ + " places \"" + key + "\" twice");
    std::int32_t number = free(held);
    if (number < 0) number = add(newCellId());

    forgetKey(number);
    Slot& slot = slots_[number];
    slot.key = key;
    slot.lastUse = clock_;
    byKey_[key] = number;
    return number;
  }

  /// The slot JavaScript's cell `id` fills: one this list named, or (after a
  /// reconnect) a new one.
  std::int32_t adopt(const std::string& id) {
    auto found = byId_.find(id);
    return found != byId_.end() ? found->second : add(id);
  }

  /// A replayed cell joins with the key it shows, unless it has a key or
  /// another holds that one. Whether it joined.
  bool join(std::int32_t number, const std::string& key) {
    Slot& slot = live(number);
    if (slot.key || byKey_.count(key)) return false;
    slot.key = key;
    byKey_[key] = number;
    return true;
  }

  /// Forgets the slot: its cell went.
  void remove(std::int32_t number) {
    Slot& slot = live(number);
    byId_.erase(slot.id);
    forgetKey(number);
    slot = Slot{};
    slot.gone = true;
    --count_;
  }

  const std::string& id(std::int32_t number) { return live(number).id; }
  /// The key the slot shows, if any.
  const std::optional<std::string>& key(std::int32_t number) { return live(number).key; }
  /// The slots that live.
  std::size_t count() const { return count_; }

private:
  struct Slot {
    std::string id;
    std::optional<std::string> key;
    std::uint64_t lastUse = 0;
    bool gone = false;
  };

  Slot& live(std::int32_t number) {
    if (number < 0 || static_cast<std::size_t>(number) >= slots_.size() || slots_[number].gone)
      throw std::out_of_range("List " + list_ + " has no cell slot " + std::to_string(number));
    return slots_[number];
  }

  /// The least recently used reusable slot; -1 while the list keeps them all.
  std::int32_t free(const std::vector<std::int32_t>& held) const {
    if (count_ < window_.size() + spares) return -1;
    std::unordered_set<std::int32_t> shown(held.begin(), held.end());
    std::int32_t best = -1;
    for (std::size_t n = 0; n < slots_.size(); ++n) {
      const Slot& slot = slots_[n];
      auto number = static_cast<std::int32_t>(n);
      if (slot.gone || shown.count(number) || (slot.key && window_.count(*slot.key))) continue;
      if (best < 0 || slot.lastUse < slots_[best].lastUse) best = number;
    }
    return best;
  }

  void forgetKey(std::int32_t number) {
    const auto& key = slots_[number].key;
    if (!key) return;
    auto found = byKey_.find(*key);
    if (found != byKey_.end() && found->second == number) byKey_.erase(found);
  }

  std::int32_t add(std::string id) {
    auto number = static_cast<std::int32_t>(slots_.size());
    byId_[id] = number;
    Slot slot;
    slot.id = std::move(id);
    slots_.push_back(std::move(slot));
    ++count_;
    return number;
  }

  /// `<list>:cell-<n>`, skipping ids of cells adopted after a reconnect.
  std::string newCellId() {
    std::string id;
    do id = list_ + ":cell-" + std::to_string(nextCell_++);
    while (byId_.count(id));
    return id;
  }

  std::string list_;
  std::vector<Slot> slots_;
  std::unordered_map<std::string, std::int32_t> byId_;
  std::unordered_map<std::string, std::int32_t> byKey_;
  std::unordered_set<std::string> window_;
  std::size_t count_ = 0;
  std::uint64_t clock_ = 0;
  int nextCell_ = 0;
};

} // namespace kuito
