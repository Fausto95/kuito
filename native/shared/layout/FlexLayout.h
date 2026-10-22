#pragma once
// The layout tree every renderer drives: CSS flexbox with absolute
// positioning, computed by a C++ port of Taffy's algorithm (see Flexbox.cpp).
// UIKit and Android Views only receive the frames it computes, so a tree lays
// out identically on both platforms. It knows nothing about Kuito's view kinds.
#include "Style.h"
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <vector>

namespace kuito::layout {

/// How a leaf is asked to measure one axis.
enum class MeasureMode {
  Exactly,    // the size is given
  AtMost,     // wrap within the given size
  Undefined,  // max-content: as large as the content wants
  MinContent, // the narrowest the content can be, e.g. the longest word
};

/// Receives the content-box space (without padding and border) and returns
/// the content size. An Exactly side must be honored.
using Measure = std::function<Size(float width, MeasureMode widthMode, float height, MeasureMode heightMode)>;

/// A node's final box, relative to its parent's border box.
struct Layout {
  float x = 0, y = 0, width = 0, height = 0;
  // A scrolling node's content size (see Style::scrolls); its own size otherwise.
  Size content;
  // Resolved padding (including Style::extraPadding) and border.
  Edges padding;
  Edges border;
};

/// The engine's work since launch, for cost tests
/// (docs/performance.md#cost-counters): counted where KUITO_INSTRUMENTS is
/// on, by the one thread that lays out. Kuito's, not Taffy's.
struct LayoutCost {
  /// Nodes the engine computed rather than took from their cache.
  std::uint64_t nodesLaidOut = 0;
  /// Leaf measures: each one missed the node's measure cache.
  std::uint64_t measureCalls = 0;
  /// Measures that answered what the node measured before it was marked dirty.
  std::uint64_t wastedMeasures = 0;
};

LayoutCost& layoutCost();

class Node {
public:
  Style style;
  Measure measure;
  // Opaque to the engine: the platform object that owns this node.
  void* context = nullptr;

  Node();
  ~Node();
  Node(const Node&) = delete;
  Node& operator=(const Node&) = delete;

  // Moves `child` from its current parent, if any.
  void insert(Node& child, std::size_t index);
  void remove(Node& child);

  /// A node without a parent (a page, a sheet, a list row: laid out on its
  /// own) inherits from `host` instead, the node of the view that shows it;
  /// null inherits nothing. Inheritance is `direction`'s only.
  void inheritFrom(Node* host);

  /// Layout results persist across passes, as in Taffy, and so do the
  /// sizes `measure` returned. Call after changing `style`: this node and
  /// its ancestors lay out again in the next pass. Tree edits mark themselves.
  void markDirty();
  /// A change to what `measure` returns, not to `style`. Like markDirty, but
  /// the climb stops at the first ancestor with a fixed width and height:
  /// that box's border size does not depend on its content, so the caches
  /// above it stay valid. Kuito's, not Taffy's.
  void markContentDirty();
  /// Whether the next pass lays this node out again (Taffy's dirty): true
  /// until its first layout, and after markDirty or a hidden layout.
  bool dirty() const noexcept;

  /// Call instead of markDirty for a change that should show at once (a
  /// layout prop that moves every frame): lays out again the subtree of the
  /// nearest ancestor whose parent sees no change, that is, one that sizes
  /// the same as before for every way its parent asked. Returns that
  /// ancestor, whose subtree has new layouts. Returns null when no ancestor
  /// below the root qualifies: the root is left dirty, and must calculate
  /// again. Not part of Taffy.
  Node* relayout();

  Node* parent() const noexcept { return parent_; }
  const std::vector<Node*>& children() const noexcept { return children_; }
  const Layout& layout() const noexcept { return final_; }
  /// A leaf's padding and border: of the measurement in progress inside a
  /// Measure call, of the last layout otherwise. The platform draws its
  /// content inside it.
  const Edges& contentInset() const noexcept { return contentInset_; }

  /// Lays out this subtree as a root of the given size; an absent side wraps
  /// the content. A pointScale above zero rounds edges to device pixels.
  void calculate(std::optional<float> width, std::optional<float> height, float pointScale = 0);

  /// Lays out this subtree as CSS lays out a root box in a viewport of the
  /// given available space (Taffy's compute_layout).
  void calculateRoot(AvailableSpace width, AvailableSpace height, float pointScale = 0);

private:
  friend struct Engine;

  struct CacheEntry;
  struct Cache;
  struct MeasureEntry;

  // Takes `style.direction` from its own, else what it inherits, and passes
  // a change on to the nodes inheriting from it.
  void inheritDirection();
  /// `contained`: stop after the first fixed-size node (markContentDirty).
  void clearCaches(bool contained);

  Node* parent_ = nullptr;
  std::vector<Node*> children_;
  Node* host_ = nullptr;
  std::vector<Node*> hosted_;
  Layout unrounded_;
  Layout final_;
  Edges contentInset_;
  // The pixel scale of the last calculate on this node as a root, which a
  // relayout inside its tree rounds to as well.
  float pointScale_ = 0;
  // Fixed slots, as Taffy's: a viewport that changes every pass replaces
  // entries instead of adding them.
  std::unique_ptr<Cache> cache_;
  // What `measure` returned, kept until markDirty: unlike cache_, it
  // survives hidden layout, so a subtree shown again measures nothing.
  // Once full it is a ring: measuredOldest_ is the entry the next miss
  // replaces.
  std::vector<MeasureEntry> measured_;
  std::size_t measuredOldest_ = 0;
  // What measured_ held when it was last cleared, for LayoutCost's wasted
  // measures; kept only where KUITO_INSTRUMENTS is on.
  std::vector<MeasureEntry> forgotten_;
};

} // namespace kuito::layout
