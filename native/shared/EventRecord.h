#pragma once
#include "EventLayouts.generated.h"
#include "PlainValue.h"
#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace kuito {

/// A native event's payload as the renderer wrote it (docs/events.md#typed-events):
/// its numbers and strings in its layout's order, or, for a module view's own
/// event, which the manifest does not lay out, JSON text; or the UI thread's
/// message to the JS thread, as plain data.
struct EventRecord {
  /// The layout's id (EventLayouts.generated.h): 0 for no payload, kJsonEvent
  /// for JSON, kValueEvent for plain data.
  std::int32_t layout = 0;
  std::vector<double> numbers;
  std::vector<std::string> strings;
  std::string json;
  PlainValue value;
};

/// The layout of an event whose payload is JSON text.
inline constexpr std::int32_t kJsonEvent = -1;

/// The layout of an event whose payload is plain data: the UI thread's `ui` messages.
inline constexpr std::int32_t kValueEvent = -2;

/// A record holding plain data.
inline EventRecord valueRecord(PlainValue value) {
  EventRecord record;
  record.layout = kValueEvent;
  record.value = std::move(value);
  return record;
}

/// A record from JSON text: a module view's event, or the UI thread's message.
inline EventRecord jsonRecord(std::string json) {
  EventRecord record;
  record.layout = kJsonEvent;
  record.json = std::move(json);
  return record;
}

/// Throws std::invalid_argument, naming the layout, for a record that does
/// not fill its layout: checked once, before either runtime reads it.
inline void checkRecord(const EventRecord& record) {
  if (record.layout == kJsonEvent || record.layout == kValueEvent) return;
  if (record.layout < 0 || static_cast<std::size_t>(record.layout) >= kEventLayoutCount)
    throw std::invalid_argument("KUITO_EVENT_LAYOUT: no event layout " + std::to_string(record.layout));
  const EventLayout& layout = kEventLayouts[record.layout];
  if (record.numbers.size() != layout.numbers || record.strings.size() != layout.strings)
    throw std::invalid_argument(std::string("KUITO_EVENT_LAYOUT: ") + layout.name + " takes " +
                                std::to_string(layout.numbers) + " numbers and " + std::to_string(layout.strings) +
                                " strings, not " + std::to_string(record.numbers.size()) + " and " +
                                std::to_string(record.strings.size()));
}

} // namespace kuito
