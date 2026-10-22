// FrameLedger.h: the drop rule both shells share, the receipts a frame keeps,
// what a drop keeps and says, and that writing a receipt allocates nothing.
#include "FrameHandoff.h"
#include "FrameLedger.h"
#include "check.h"
#include <atomic>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <new>
#include <string>

namespace {
std::atomic<long> allocations{0};
} // namespace

void* operator new(std::size_t size) {
  ++allocations;
  if (void* memory = std::malloc(size ? size : 1)) return memory;
  throw std::bad_alloc();
}
void operator delete(void* memory) noexcept { std::free(memory); }
void operator delete(void* memory, std::size_t) noexcept { std::free(memory); }

using kuito::FrameLedger;
using kuito::FrameRule;
using kuito::JobCause;
using kuito::Work;

namespace {
constexpr double kInterval = 1.0 / 60;

bool near(double a, double b) { return std::fabs(a - b) < 1e-9; }

void theRule() {
  {
    FrameRule rule;
    const auto frame = rule.frame(1, 1, kInterval);
    CHECK(frame.work == 0 && frame.dropped == 0);
  }
  {
    FrameRule rule;
    rule.woke(1.000);
    rule.slept(1.002);
    rule.woke(1.010);
    rule.slept(1.011);
    const auto frame = rule.frame(1.0167, 1.0167, kInterval);
    CHECK(near(frame.work, 0.003) && frame.dropped == 0);
  }
  {
    // A frame counts work up to it, and the rest goes to the next.
    FrameRule rule;
    rule.woke(1.010);
    CHECK(near(rule.frame(1.012, 1.012, kInterval).work, 0.002));
    rule.slept(1.015);
    CHECK(near(rule.frame(1.030, 1.029, kInterval).work, 0.003));
  }
  {
    // Work that held back frames dropped them.
    FrameRule rule;
    rule.frame(1.000, 1.000, kInterval);
    rule.woke(1.000);
    rule.slept(1.040);
    const auto frame = rule.frame(1.051, 1.050, kInterval);
    CHECK(near(frame.work, 0.040) && frame.dropped == 2);
  }
  {
    // Busy but on time drops nothing.
    FrameRule rule;
    const double fast = 1.0 / 120;
    rule.frame(1.000, 1.000, fast);
    rule.woke(1.000);
    const auto frame = rule.frame(1.0084, 1.0 + fast, fast);
    CHECK(frame.work > fast && frame.dropped == 0);
  }
  {
    // A late frame of an idle thread drops nothing.
    FrameRule rule;
    rule.frame(1.000, 1.000, kInterval);
    rule.woke(1.010);
    rule.slept(1.011);
    CHECK(rule.frame(1.034, 1.0333, kInterval).dropped == 0);
  }
}

/// A frame of `work` seconds from `start`, its vsync `skipped` intervals late.
kuito::FrameVerdict busyFrame(FrameLedger& ledger, double start, double work, int skipped, double vsync) {
  ledger.woke(start);
  ledger.slept(start + work);
  return ledger.frame(start + work, vsync + (skipped + 1) * kInterval, kInterval);
}

void receiptsAndDrops() {
  FrameLedger ledger;
  ledger.frame(0, 0, kInterval);

  // A quiet frame: its receipts go when the ring comes round.
  ledger.record(Work::Drain, 0.001, 0.002);
  CHECK(ledger.current().count == 1);
  CHECK(busyFrame(ledger, 0.001, 0.001, 0, 0).dropped == 0);
  CHECK(ledger.lastDrop().sequence == 0);
  CHECK(ledger.current().count == 0);

  // A batch, then a 20 ms layout it caused, and measures tallied into one receipt.
  JobCause cause{482, JobCause::Entry::Event, 7, "press"};
  ledger.applying(cause);
  CHECK(cause.event.empty());
  ledger.record(Work::ApplyBatch, 0.020, 0.021, {12, 0, 0, 0}, 482);
  ledger.record(Work::Layout, 0.021, 0.041, {812, 30, 96, 90});
  ledger.add(Work::Measure, 0.001);
  ledger.add(Work::Measure, 0.002);
  const auto verdict = busyFrame(ledger, 0.020, 0.025, 1, kInterval);
  CHECK(verdict.dropped == 1);

  const FrameLedger::Drop& drop = ledger.lastDrop();
  CHECK(drop.sequence == 1);
  CHECK(drop.count == 2);
  const FrameLedger::Frame& dropped = drop.frames[drop.count - 1];
  CHECK(dropped.count == 3);
  CHECK(dropped.receipts[1].kind == Work::Layout && dropped.receipts[1].cause == 482);
  CHECK(dropped.receipts[2].kind == Work::Measure && dropped.receipts[2].counts[0] == 2);
  CHECK(near(dropped.receipts[2].t1 - dropped.receipts[2].t0, 0.003));
  CHECK(ledger.causeOf(482) && ledger.causeOf(482)->event == "press");

  const std::string line = kuito::describeDrop(ledger, drop, [](std::uint32_t handle) {
    return handle == 7 ? std::string("like") : std::string("?");
  });
  CHECK(line.rfind("Dropped 1 frame (25.0 ms): layout 20.0 ms (812 nodes laid out, 96 framed) ← job 482 (press on like)",
                   0) == 0);
  CHECK(line.find("applyBatch 1.0 ms (12 records) ← job 482") != std::string::npos);
  CHECK(kuito::receipted(drop));

  // A frame no receipt covers is the platform's work, and says so.
  FrameLedger quiet;
  quiet.frame(0, 0, kInterval);
  busyFrame(quiet, 0.001, 0.030, 1, 0);
  CHECK(!kuito::receipted(quiet.lastDrop()));
  CHECK(kuito::describeDrop(quiet, quiet.lastDrop(), [](std::uint32_t) { return std::string(); })
            .find("no receipt covers it") != std::string::npos);

  // The next frame names no job: a cause lasts for the frame its batch applied in.
  ledger.record(Work::Layout, 0.050, 0.051);
  CHECK(ledger.current().receipts[0].cause == 0);

  // A frame keeps kPerFrame receipts and counts the rest.
  for (std::size_t i = 0; i < FrameLedger::kPerFrame + 5; ++i) ledger.record(Work::UIEvent, 0.06, 0.0601);
  CHECK(ledger.current().count == FrameLedger::kPerFrame && ledger.current().overflowed == 6);
}

// A job's number and cause travel with its batch through the handoff to the
// frame that applies it, and name the work that frame does for it.
void aJobTravelsWithItsBatch() {
  kuito::FrameHandoff handoff;
  kuito::Batch batch;
  batch.cause = JobCause{7, JobCause::Entry::Event, 3, "press"};
  handoff.push(std::move(batch));

  FrameLedger ledger;
  std::uint64_t applied = 0;
  handoff.drain([] { return false; },
                [&](kuito::Batch& next) {
                  applied = next.cause.job;
                  ledger.applying(next.cause);
                });
  ledger.record(Work::Layout, 0, 0.001);
  CHECK(applied == 7);
  CHECK(ledger.current().receipts[0].cause == 7);
  CHECK(ledger.causeOf(7) && ledger.causeOf(7)->handle == 3 && ledger.causeOf(7)->event == "press");
}

void writingAllocatesNothing() {
  static FrameLedger ledger;
  ledger.frame(0, 0, kInterval);
  JobCause cause{1, JobCause::Entry::Timer, 0, ""};
  const long before = allocations.load();
  for (int frame = 0; frame < 100; ++frame) {
    const double start = 0.1 + frame * kInterval;
    ledger.applying(cause);
    ledger.record(Work::ApplyBatch, start, start + 0.001, {3, 0, 0, 0}, 1);
    ledger.record(Work::Layout, start + 0.001, start + 0.002, {1, 2, 3, 4});
    ledger.add(Work::Redraw, 0.0001);
    kuito::timed(Work::UIFrame, [] { return 0; });
    busyFrame(ledger, start, frame % 10 == 0 ? 0.030 : 0.002, frame % 10 == 0 ? 1 : 0, start);
  }
  CHECK(ledger.lastDrop().sequence > 0);
  CHECK(allocations.load() == before);
}

void aReceiptIsQuick() {
  static FrameLedger ledger;
  constexpr int kWrites = 100000;
  const double start = FrameLedger::now();
  for (int i = 0; i < kWrites; ++i) {
    ledger.record(Work::Layout, 0, 1, {1, 2, 3, 4}, 5);
    if (ledger.current().count == FrameLedger::kPerFrame) ledger.frame(i, i, kInterval);
  }
  const double perWrite = (FrameLedger::now() - start) / kWrites;
  std::cout << "receipt " << perWrite * 1e9 << " ns\n";
  CHECK(perWrite < 1e-6);
}
} // namespace

int main() {
  theRule();
  receiptsAndDrops();
  aJobTravelsWithItsBatch();
  writingAllocatesNothing();
  aReceiptIsQuick();
  std::cout << "KUITO_FRAME_LEDGER_PASS\n";
  return 0;
}
