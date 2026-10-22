#include "ViewTable.h"
#include <stdexcept>
#include <utility>

namespace kuito {

void ViewTable::apply(const std::vector<Mutation>& batch) {
  const std::size_t mark = undo_.size();
  try {
    for (const Mutation& m : batch) {
      check(m);
      change(m);
    }
  } catch (...) {
    rollback(mark);
    throw;
  }
}

void ViewTable::discard() { rollback(0); }

std::uint32_t ViewTable::parentOf(std::uint32_t id) const {
  auto found = views_.find(id);
  if (found == views_.end()) throw std::invalid_argument("KUITO_VIEW_MISSING: no view " + std::to_string(id));
  return found->second.parent;
}

std::string ViewTable::describe(std::uint32_t id) const {
  auto found = views_.find(id);
  if (found == views_.end() || found->second.label.empty()) return "view " + std::to_string(id);
  return found->second.label + " (view " + std::to_string(id) + ")";
}

void ViewTable::check(const Mutation& m) const {
  const auto existing = [&](std::uint32_t id, const char* what) {
    if (!contains(id)) throw std::invalid_argument(std::string("KUITO_VIEW_MISSING: ") + what + " " + describe(id));
  };
  const auto parent = [&](std::uint32_t id) {
    if (id != 0 && !contains(id)) throw std::invalid_argument("KUITO_VIEW_PARENT_MISSING: no parent " + describe(id));
  };
  switch (m.op) {
  case Op::Create:
    if (m.id == 0 || contains(m.id))
      throw std::invalid_argument("KUITO_VIEW_DUPLICATE: " + m.name + " (view " + std::to_string(m.id) +
                                  ") already exists");
    parent(m.parent);
    return;
  case Op::Move:
    existing(m.id, "moving");
    parent(m.parent);
    if (m.parent == m.id) throw std::invalid_argument("KUITO_VIEW_CYCLE: " + describe(m.id) + " under itself");
    return;
  case Op::Remove:
    existing(m.id, "removing");
    if (views_.at(m.id).children != 0)
      throw std::invalid_argument("KUITO_VIEW_CHILDREN: " + describe(m.id) + " removed before its " +
                                  std::to_string(views_.at(m.id).children) + " children");
    return;
  case Op::Flatten:
  case Op::Prop: existing(m.id, "writing to"); return;
  case Op::Command:
    if (m.id != 0) existing(m.id, "commanding");
    return;
  case Op::UI:
  case Op::UIScript:
  case Op::UIKernel:
  case Op::UIBundle: return;
  }
}

void ViewTable::remember(std::uint32_t id) {
  auto found = views_.find(id);
  undo_.push_back(found == views_.end() ? Undo{id, false, {}} : Undo{id, true, found->second});
}

void ViewTable::change(const Mutation& m) {
  switch (m.op) {
  case Op::Create:
    remember(m.id);
    if (m.parent != 0) remember(m.parent), ++views_.at(m.parent).children;
    views_[m.id] = Entry{m.text, m.name, m.parent, 0};
    return;
  case Op::Move: {
    const std::uint32_t old = views_.at(m.id).parent;
    if (old == m.parent) return;
    remember(m.id);
    if (old != 0) remember(old), --views_.at(old).children;
    if (m.parent != 0) remember(m.parent), ++views_.at(m.parent).children;
    views_.at(m.id).parent = m.parent;
    return;
  }
  case Op::Remove: {
    const std::uint32_t parent = views_.at(m.id).parent;
    remember(m.id);
    if (parent != 0) remember(parent), --views_.at(parent).children;
    views_.erase(m.id);
    return;
  }
  case Op::Flatten:
  case Op::Prop:
  case Op::Command:
  case Op::UI:
  case Op::UIScript:
  case Op::UIKernel:
  case Op::UIBundle: return;
  }
}

void ViewTable::rollback(std::size_t mark) {
  while (undo_.size() > mark) {
    Undo undo = std::move(undo_.back());
    undo_.pop_back();
    if (undo.existed) views_[undo.id] = std::move(undo.entry);
    else views_.erase(undo.id);
  }
}

} // namespace kuito
