#pragma once
#include "Mutation.h"
#include "ViewTable.h"
#include "Wire.h"
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace kuito {

// A recording (docs/devtools.md#recording-and-replay): every batch a runtime
// committed, as the kernel wrote it (src/runtime/wire.ts), with when. A `.krec`
// file is little-endian and packed:
//   "KREC", u32 version, u8 truncated,
// (version 2's batches hold UI operations and structured props as JSON text;
// version 3's as plain data, Wire.h's Struct and List),
//   then per batch: f64 ms since the runtime started, u32 byte length, the
//   bytes, u32 string count, and each string as u32 length and UTF-8.

/// A batch as the kernel sent it, `ms` after the runtime started.
struct RecordedBatch {
  double ms = 0;
  /// How the kernel that wrote it encoded its records.
  WireFormat format = WireFormat::Current;
  std::vector<std::uint8_t> bytes;
  std::vector<std::string> strings;
};

/// What a shell with no JS applies: a batch's view mutations, decoded and checked.
struct ReplayBatch {
  double ms = 0;
  std::vector<Mutation> mutations;
};

namespace recording {
inline constexpr char kMagic[4] = {'K', 'R', 'E', 'C'};
inline constexpr std::uint32_t kVersion = 3;
/// The last version written before plain data: its batches still replay.
inline constexpr std::uint32_t kJsonVersion = 2;
/// Header: magic, version, truncated.
inline constexpr std::size_t kHeader = 9;

template <class T>
void put(std::string& out, T value) {
  char bytes[sizeof(T)];
  std::memcpy(bytes, &value, sizeof(T));
  out.append(bytes, sizeof(T));
}

class Reader {
public:
  explicit Reader(const std::string& file) : file_(file) {}
  bool done() const { return at_ == file_.size(); }

  template <class T>
  T scalar() {
    T value;
    std::memcpy(&value, take(sizeof(T)), sizeof(T));
    return value;
  }

  const char* take(std::size_t length) {
    if (file_.size() - at_ < length)
      throw std::invalid_argument("KUITO_RECORDING_TRUNCATED: the file ends inside a batch");
    const char* start = file_.data() + at_;
    at_ += length;
    return start;
  }

private:
  const std::string& file_;
  std::size_t at_ = 0;
};
} // namespace recording

/// Development builds: the batches of each job that settles, until `limit`
/// bytes. Past it the recording stops rather than wraps, since a replay needs
/// every view from its creation.
class Recorder {
public:
  static constexpr std::size_t kDefaultLimit = 32 * 1024 * 1024;

  explicit Recorder(std::size_t limit = kDefaultLimit) : limit_(limit) {}

  /// A batch of the running job, kept once the job settles.
  void stage(double ms, const std::uint8_t* data, std::size_t length, const std::vector<std::string>& strings) {
    if (truncated_) return;
    recording::put(staged_, ms);
    recording::put(staged_, static_cast<std::uint32_t>(length));
    staged_.append(reinterpret_cast<const char*>(data), length);
    recording::put(staged_, static_cast<std::uint32_t>(strings.size()));
    for (const auto& text : strings) {
      recording::put(staged_, static_cast<std::uint32_t>(text.size()));
      staged_ += text;
    }
  }

  /// The job ended: its batches join the recording, if they fit.
  void settle() {
    if (!truncated_ && recording::kHeader + batches_.size() + staged_.size() > limit_) truncated_ = true;
    if (!truncated_) batches_ += staged_;
    staged_.clear();
  }

  /// The job failed: the device never saw its batches.
  void discard() { staged_.clear(); }

  bool truncated() const { return truncated_; }

  /// The recording so far, as a `.krec` file.
  std::string file() const {
    std::string out(recording::kMagic, sizeof recording::kMagic);
    recording::put(out, recording::kVersion);
    recording::put(out, static_cast<std::uint8_t>(truncated_ ? 1 : 0));
    return out + batches_;
  }

private:
  std::size_t limit_;
  bool truncated_ = false;
  std::string staged_;
  std::string batches_;
};

/// The batches `file` holds. Throws std::invalid_argument, naming what is wrong.
inline std::vector<RecordedBatch> readRecording(const std::string& file) {
  if (file.size() < recording::kHeader || file.compare(0, 4, recording::kMagic, 4) != 0)
    throw std::invalid_argument("KUITO_RECORDING: not a Kuito recording (.krec)");
  recording::Reader in(file);
  in.take(4);
  const auto version = in.scalar<std::uint32_t>();
  if (version != recording::kVersion && version != recording::kJsonVersion)
    throw std::invalid_argument("KUITO_RECORDING_VERSION: recorded as version " + std::to_string(version) +
                                ", this shell reads versions " + std::to_string(recording::kJsonVersion) + " and " +
                                std::to_string(recording::kVersion));
  const auto format = version == recording::kJsonVersion ? WireFormat::Json : WireFormat::Current;
  in.scalar<std::uint8_t>();
  std::vector<RecordedBatch> batches;
  while (!in.done()) {
    RecordedBatch batch;
    batch.format = format;
    batch.ms = in.scalar<double>();
    const auto length = in.scalar<std::uint32_t>();
    const char* bytes = in.take(length);
    batch.bytes.assign(bytes, bytes + length);
    const auto count = in.scalar<std::uint32_t>();
    batch.strings.reserve(count);
    for (std::uint32_t i = 0; i < count; ++i) {
      const auto size = in.scalar<std::uint32_t>();
      batch.strings.emplace_back(in.take(size), size);
    }
    batches.push_back(std::move(batch));
  }
  return batches;
}

/// `file`'s batches as a shell with no JS applies them: decoded, checked in
/// order against one ViewTable as the device checked them, and without the
/// UI-thread records (UI, UIScript, UIKernel, UIBundle), which only a runtime can run. A batch
/// left with nothing to apply is left out.
inline std::vector<ReplayBatch> replayBatches(const std::string& file) {
  ViewTable views;
  std::vector<ReplayBatch> replay;
  for (const auto& recorded : readRecording(file)) {
    ReplayBatch batch{recorded.ms,
                      decodeBatch(recorded.bytes.data(), recorded.bytes.size(), recorded.strings, recorded.format)};
    views.apply(batch.mutations);
    views.settle();
    auto& mutations = batch.mutations;
    mutations.erase(std::remove_if(mutations.begin(), mutations.end(),
                                   [](const Mutation& m) {
                                     return m.op == Op::UI || m.op == Op::UIScript || m.op == Op::UIKernel ||
                                            m.op == Op::UIBundle;
                                   }),
                    mutations.end());
    if (!mutations.empty()) replay.push_back(std::move(batch));
  }
  return replay;
}

} // namespace kuito
