#pragma once
// What-if ablation (docs/performance.md#ablation): in a development build,
// each main-thread subsystem can be slowed by a busy wait or elided, to see
// what drops would do if it cost more, or nothing. A drop count that does not
// move when a subsystem is slowed says it is off the critical path; the drops
// an elision saves bound what fixing that subsystem can win. Read once, from
// KUITO_ABLATE (iOS: the environment, SIMCTL_CHILD_KUITO_ABLATE from simctl;
// Android: the debug.kuito.ablate system property), as comma-separated
// `subsystem:elide` or `subsystem:slow<ms>`:
//
//   KUITO_ABLATE=layout:elide,uiEvent:slow4
//
// Builds without KUITO_INSTRUMENTS (release shells) read nothing and change nothing.
#include "Instruments.h"
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <string_view>
#if KUITO_INSTRUMENTS && defined(__ANDROID__)
#include <sys/system_properties.h>
#endif

namespace kuito {

/// A subsystem the switchboard can slow or elide.
enum class Subsystem : std::uint8_t { Layout, Measure, LabelRedraw, UIFrame, UIEvent, AwaitInput, ApplyBatch };

constexpr std::size_t kSubsystems = 7;

inline const char* subsystemName(Subsystem subsystem) {
  switch (subsystem) {
  case Subsystem::Layout: return "layout";
  case Subsystem::Measure: return "measure";
  case Subsystem::LabelRedraw: return "labelRedraw";
  case Subsystem::UIFrame: return "uiFrame";
  case Subsystem::UIEvent: return "uiEvent";
  case Subsystem::AwaitInput: return "awaitInput";
  case Subsystem::ApplyBatch: return "applyBatch";
  }
  return "subsystem";
}

class Ablation {
public:
  struct Toggle {
    bool elide = false;
    /// Busy-waited before the work, in milliseconds.
    double slowMs = 0;
  };

  /// The switchboard `spec` describes; throws std::invalid_argument naming
  /// what it cannot read. Every subsystem but applyBatch can be elided: the
  /// views must take every batch.
  static Ablation parse(std::string_view spec) {
    Ablation ablation;
    while (!spec.empty()) {
      const std::size_t comma = spec.find(',');
      const std::string_view entry = spec.substr(0, comma);
      spec = comma == std::string_view::npos ? std::string_view() : spec.substr(comma + 1);
      if (entry.empty()) continue;
      const std::size_t colon = entry.find(':');
      if (colon == std::string_view::npos)
        throw std::invalid_argument("KUITO_ABLATE: " + std::string(entry) + " has no :elide or :slow<ms>");
      const Subsystem subsystem = named(entry.substr(0, colon));
      const std::string_view action = entry.substr(colon + 1);
      Toggle& toggle = ablation.toggles_[static_cast<std::size_t>(subsystem)];
      if (action == "elide") {
        if (subsystem == Subsystem::ApplyBatch)
          throw std::invalid_argument("KUITO_ABLATE: applyBatch can be slowed, not elided");
        toggle.elide = true;
      } else if (action.substr(0, 4) == "slow" && action.size() > 4) {
        const std::string ms(action.substr(4));
        char* end = nullptr;
        toggle.slowMs = std::strtod(ms.c_str(), &end);
        if (end != ms.c_str() + ms.size() || toggle.slowMs <= 0)
          throw std::invalid_argument("KUITO_ABLATE: " + std::string(action) + " is not slow<ms>");
      } else {
        throw std::invalid_argument("KUITO_ABLATE: " + std::string(action) + " is neither elide nor slow<ms>");
      }
      ablation.any_ = true;
    }
    return ablation;
  }

  const Toggle& operator[](Subsystem subsystem) const { return toggles_[static_cast<std::size_t>(subsystem)]; }

  /// Whether any subsystem is toggled.
  bool any() const { return any_; }

  /// The switchboard as it reads back: `layout:elide,uiEvent:slow4`.
  std::string describe() const {
    std::string text;
    for (std::size_t i = 0; i < kSubsystems; ++i) {
      const Toggle& toggle = toggles_[i];
      if (!toggle.elide && toggle.slowMs <= 0) continue;
      if (!text.empty()) text += ',';
      text += subsystemName(static_cast<Subsystem>(i));
      text += toggle.elide ? ":elide" : ":slow" + number(toggle.slowMs);
    }
    return text;
  }

private:
  static Subsystem named(std::string_view name) {
    for (std::size_t i = 0; i < kSubsystems; ++i)
      if (name == subsystemName(static_cast<Subsystem>(i))) return static_cast<Subsystem>(i);
    throw std::invalid_argument(
        "KUITO_ABLATE: no subsystem is named " + std::string(name) +
        "; there are layout, measure, labelRedraw, uiFrame, uiEvent, awaitInput and applyBatch");
  }

  static std::string number(double value) {
    char text[32];
    std::snprintf(text, sizeof text, "%g", value);
    return text;
  }

  std::array<Toggle, kSubsystems> toggles_{};
  bool any_ = false;
};

/// What KUITO_ABLATE asks for in this process; nothing in a release build
/// or when it is unset. A setting that does not parse toggles nothing:
/// `ablationError()` says why, for the shell to log.
inline const Ablation& ablation() {
  static const Ablation configured = [] {
#if KUITO_INSTRUMENTS
#if defined(__ANDROID__)
    char value[PROP_VALUE_MAX] = {};
    __system_property_get("debug.kuito.ablate", value);
    const std::string spec = value;
#else
    const char* set = std::getenv("KUITO_ABLATE");
    const std::string spec = set ? set : "";
#endif
    try {
      return Ablation::parse(spec);
    } catch (const std::invalid_argument&) { return Ablation(); }
#else
    return Ablation();
#endif
  }();
  return configured;
}

/// Why KUITO_ABLATE did not parse; empty when it did or is unset.
inline std::string ablationError() {
#if KUITO_INSTRUMENTS
#if defined(__ANDROID__)
  char value[PROP_VALUE_MAX] = {};
  __system_property_get("debug.kuito.ablate", value);
  const std::string spec = value;
#else
  const char* set = std::getenv("KUITO_ABLATE");
  const std::string spec = set ? set : "";
#endif
  try {
    Ablation::parse(spec);
  } catch (const std::invalid_argument& error) { return error.what(); }
#endif
  return "";
}

/// Runs `work` as `subsystem`'s toggle in `switchboard` says: after a busy
/// wait when slowed, and not at all when elided, `elided` answering for it then.
template <class Work, class Elided>
auto ablated(const Ablation& switchboard, Subsystem subsystem, Work&& work, Elided&& elided) -> decltype(work()) {
  const Ablation::Toggle& toggle = switchboard[subsystem];
  if (toggle.slowMs > 0) {
    const auto until =
        std::chrono::steady_clock::now() + std::chrono::duration_cast<std::chrono::steady_clock::duration>(
                                               std::chrono::duration<double, std::milli>(toggle.slowMs));
    while (std::chrono::steady_clock::now() < until) {}
  }
  if (toggle.elide) return elided();
  return work();
}

/// `ablated` as KUITO_ABLATE says; just `work` in a release build.
template <class Work, class Elided>
auto ablated(Subsystem subsystem, Work&& work, Elided&& elided) -> decltype(work()) {
#if KUITO_INSTRUMENTS
  if (ablation().any()) return ablated(ablation(), subsystem, work, elided);
#else
  (void)subsystem, (void)elided;
#endif
  return work();
}

} // namespace kuito
