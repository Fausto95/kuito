#pragma once
// A list's keys edited by the diff the kernel sends (docs/lists.md#keys), for
// both renderers' lists: Views/KuitoListKeys adapts it on each platform.
#include "Mutation.h"
#include <cstdint>
#include <stdexcept>
#include <string>
#include <string_view>
#include <unordered_set>
#include <vector>

namespace kuito {

/// What one key edit did to the rows: inserted at `to`, removed from `from`,
/// or moved from `from` to `to`. The side an edit lacks is -1.
struct KeyChange {
  KeyEdit::Op op = KeyEdit::Op::Insert;
  std::int32_t from = -1;
  std::int32_t to = -1;
};

/// The keys a diff leaves, each by where it comes from: its index among the
/// keys edited, or `~n` for the key the n-th edit inserts. Only numbers come
/// back, so a renderer builds the keys from strings it already has.
struct EditedKeys {
  std::vector<std::int32_t> order;
  /// What each edit did, in order: Android's adapter is told each one.
  std::vector<KeyChange> changes;
};

/// An edit that does not fit the keys the edits before it left.
struct KeyEditError : std::invalid_argument {
  using std::invalid_argument::invalid_argument;
};

/// `keys` with each edit applied to the keys the edits before it left. An
/// edit that does not fit throws KeyEditError naming it; the caller keeps its
/// keys as they were.
inline EditedKeys editKeys(const std::vector<std::string>& keys, const std::vector<KeyEdit>& edits) {
  EditedKeys result;
  auto& order = result.order;
  order.reserve(keys.size() + edits.size());
  for (std::size_t at = 0; at < keys.size(); ++at) order.push_back(static_cast<std::int32_t>(at));

  // Views into `keys` and `edits`, which outlive this call.
  std::unordered_set<std::string_view> present(keys.begin(), keys.end());
  auto key = [&](std::int32_t source) -> std::string_view { return source >= 0 ? keys[source] : edits[~source].key; };
  auto opName = [](KeyEdit::Op op) {
    switch (op) {
    case KeyEdit::Op::Insert: return "insert";
    case KeyEdit::Op::Remove: return "remove";
    case KeyEdit::Op::Move: return "move";
    }
    return "edit";
  };
  auto named = [&](const KeyEdit& edit) {
    return std::string("cannot ") + opName(edit.op) + " \"" + edit.key + "\" at " + std::to_string(edit.index);
  };
  auto missing = [&](const KeyEdit& edit) {
    return KeyEditError(named(edit) + ": the list's " + std::to_string(order.size()) + " keys do not have it there");
  };
  auto outside = [&](const KeyEdit& edit) {
    return KeyEditError(named(edit) + ": the list has " + std::to_string(order.size()) + " keys");
  };
  auto fits = [&](std::int32_t index) { return index >= 0 && static_cast<std::size_t>(index) <= order.size(); };

  result.changes.reserve(edits.size());
  for (std::size_t n = 0; n < edits.size(); ++n) {
    const KeyEdit& edit = edits[n];
    switch (edit.op) {
    case KeyEdit::Op::Insert: {
      if (present.count(edit.key))
        throw KeyEditError("expects unique keys: \"" + edit.key + "\" is in the list already");
      if (!fits(edit.index)) throw outside(edit);
      order.insert(order.begin() + edit.index, ~static_cast<std::int32_t>(n));
      present.insert(edit.key);
      result.changes.push_back({edit.op, -1, edit.index});
      break;
    }
    case KeyEdit::Op::Remove: {
      if (edit.index < 0 || static_cast<std::size_t>(edit.index) >= order.size() || key(order[edit.index]) != edit.key)
        throw missing(edit);
      present.erase(key(order[edit.index]));
      order.erase(order.begin() + edit.index);
      result.changes.push_back({edit.op, edit.index, -1});
      break;
    }
    case KeyEdit::Op::Move: {
      std::size_t from = 0;
      while (from < order.size() && key(order[from]) != edit.key) ++from;
      if (from == order.size()) throw missing(edit);
      std::int32_t source = order[from];
      order.erase(order.begin() + static_cast<std::ptrdiff_t>(from));
      if (!fits(edit.index)) throw outside(edit);
      order.insert(order.begin() + edit.index, source);
      result.changes.push_back({edit.op, static_cast<std::int32_t>(from), edit.index});
      break;
    }
    }
  }
  return result;
}

} // namespace kuito
