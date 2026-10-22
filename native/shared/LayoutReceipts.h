#pragma once
// The layout engine's work as frame receipts (FrameLedger.h), for the
// platforms' bindings: a root's calculation with the nodes it laid out and
// the leaves it measured, and each leaf's measure added to the frame's one.
// Both go through the ablation switchboard (Ablation.h).
#include "Ablation.h"
#include "FrameLedger.h"
#include "layout/FlexLayout.h"
#include <optional>

namespace kuito {

/// Runs `calculate`, a root's layout, as a layout receipt.
template <class Body>
void layoutReceipt(Body&& calculate) {
#if KUITO_INSTRUMENTS
  const layout::LayoutCost before = layout::layoutCost();
  const double started = FrameLedger::now();
  calculate();
  const layout::LayoutCost& after = layout::layoutCost();
  frameLedger().record(Work::Layout, started, FrameLedger::now(),
                       {static_cast<std::uint32_t>(after.nodesLaidOut - before.nodesLaidOut),
                        static_cast<std::uint32_t>(after.measureCalls - before.measureCalls), 0, 0});
#else
  calculate();
#endif
}

/// Runs `measure`, a leaf's, adding its time to the frame's measure receipt.
template <class Body>
auto measureReceipt(Body&& measure) -> decltype(measure()) {
#if KUITO_INSTRUMENTS
  struct Add {
    double started = FrameLedger::now();
    ~Add() { frameLedger().add(Work::Measure, FrameLedger::now() - started); }
  } add;
#endif
  return measure();
}

/// Calculates `root` as a layout receipt. With layout elided, only a root
/// that has never laid out calculates: the rest keep their frames.
template <class Body>
void calculateRoot(const layout::Node& root, Body&& calculate) {
  ablated(
      Subsystem::Layout, [&] { layoutReceipt(calculate); },
      [&] {
        if (root.layout().width == 0 && root.layout().height == 0) layoutReceipt(calculate);
      });
}

/// Measures a leaf as a receipt. With measure elided, a leaf that measured
/// before answers what it answered last, `last`, whatever the question.
template <class Body>
layout::Size measureLeaf(std::optional<layout::Size>& last, Body&& measure) {
  return ablated(
      Subsystem::Measure, [&] { return *(last = measureReceipt(measure)); },
      [&] { return last ? *last : *(last = measureReceipt(measure)); });
}

} // namespace kuito
