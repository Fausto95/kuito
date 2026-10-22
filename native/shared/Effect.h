#pragma once
// What a decoded batch can disturb, folded on the JS thread from each prop's
// effect class (PropEffect in PropKeys.generated.h) so the main thread does
// not classify writes. docs/native-renderer.md#prop-effects.
#include "Mutation.h"
#include <vector>

namespace kuito {

/// The effect classes present in one batch.
struct EffectSummary {
  bool paint = false;
  bool measure = false;
  bool layout = false;
  bool structure = false;

  /// A paint-only batch never marks layout.
  bool marksLayout() const { return measure || layout || structure; }
};

/// The classes in `batch`. Create, remove, move and flatten are structure.
/// A prop the manifest does not name (a module view's own) counts as layout.
inline EffectSummary summarize(const std::vector<Mutation>& batch) {
  EffectSummary summary;

  for (const Mutation& change : batch) {
    switch (change.op) {
    case Op::Create:
    case Op::Remove:
    case Op::Move:
    case Op::Flatten: summary.structure = true; break;
    case Op::Prop:
      if (change.key == kNamedProp) {
        summary.layout = true;
        break;
      }
      switch (propInfo(change.key).effect) {
      case PropEffect::Paint: summary.paint = true; break;
      case PropEffect::Measure: summary.measure = true; break;
      case PropEffect::Layout: summary.layout = true; break;
      case PropEffect::Structure: summary.structure = true; break;
      }
      break;
    case Op::Command:
    case Op::UI:
    case Op::UIScript:
    case Op::UIKernel:
    case Op::UIBundle: break;
    }
  }

  return summary;
}

} // namespace kuito
