#include "Recording.h"
#include "check.h"
#include "wire-records.h"
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>

using kuito::Op;
using kuito::PropKey;
using kuito::Recorder;
using kuito::Value;
using namespace kuito::test;

namespace {

template <class Work>
std::string rejection(Work&& work) {
  try {
    work();
  } catch (const std::invalid_argument& error) { return error.what(); }
  return "";
}

void stage(Recorder& recorder, double ms, const Records& batch) {
  recorder.stage(ms, batch.bytes.data(), batch.bytes.size(), batch.strings);
}

Records screen() {
  Records batch;
  batch.create(1, 0, "Stack", "root").create(2, 1, "Text", "label").prop(2, PropKey::Text).u8(Text).text("a");
  return batch;
}

void keepsSettledJobsOnly() {
  Recorder recorder;
  stage(recorder, 0, screen());
  recorder.settle();

  // A job that throws loses its batches on the device, and in the recording.
  Records lost;
  lost.prop(2, PropKey::Text).u8(Text).text("lost");
  stage(recorder, 5, lost);
  recorder.discard();

  Records later;
  later.prop(2, PropKey::Text)
      .u8(Text)
      .text("b")
      .op(Op::UI)
      .u8(List)
      .u32(0)
      .op(Op::UIScript)
      .text("s")
      .text("kuito://ui/1");
  stage(recorder, 16, later);
  recorder.settle();

  auto batches = kuito::readRecording(recorder.file());
  CHECK(batches.size() == 2);
  CHECK(batches[0].ms == 0 && batches[1].ms == 16);
  CHECK(batches[0].bytes == screen().bytes && batches[0].strings == screen().strings);
  CHECK(!recorder.truncated());
}

void replaysViewMutationsWithoutTheUIThread() {
  Recorder recorder;
  stage(recorder, 0, screen());
  recorder.settle();
  Records later;
  later.prop(2, PropKey::Text)
      .u8(Text)
      .text("b")
      .op(Op::UI)
      .u8(List)
      .u32(0)
      .op(Op::UIScript)
      .text("s")
      .text("kuito://ui/1")
      .op(Op::UIBundle)
      .text("h")
      .text("kuito://ui/2");
  stage(recorder, 16, later);
  recorder.settle();

  auto replay = kuito::replayBatches(recorder.file());
  CHECK(replay.size() == 2);
  CHECK(replay[0].mutations.size() == 3);
  CHECK(replay[0].mutations[0].op == Op::Create && replay[0].mutations[0].text == "Stack");
  // UI-thread code needs a runtime: a shell with no JS replays the view
  // mutations alone.
  CHECK(replay[1].mutations.size() == 1);
  CHECK(replay[1].mutations[0].kind == Value::Text && replay[1].mutations[0].text == "b");
  CHECK(replay[1].ms == 16);
}

// A recording made before plain data: version 2, its UI operations JSON text.
void replaysAVersionTwoRecording() {
  Records old;
  old.create(1, 0, "Stack", "root").op(Op::UI).text("[]").prop(1, PropKey::Src).u8(Json).text("{\"uri\":\"x\"}");
  Recorder recorder;
  stage(recorder, 0, old);
  recorder.settle();
  auto file = recorder.file();
  const std::uint32_t two = 2;
  std::memcpy(file.data() + 4, &two, sizeof two);
  auto replay = kuito::replayBatches(file);
  CHECK(replay.size() == 1 && replay[0].mutations.size() == 2);
  CHECK(replay[0].mutations[1].kind == Value::Json && replay[0].mutations[1].text == "{\"uri\":\"x\"}");
}

void rejectsWhatIsNotARecording() {
  CHECK(rejection([] { kuito::readRecording("nope"); }).find("KUITO_RECORDING") == 0);

  Recorder recorder;
  stage(recorder, 0, screen());
  recorder.settle();
  auto file = recorder.file();
  CHECK(rejection([&] { kuito::readRecording(file.substr(0, file.size() - 3)); }).find("KUITO_RECORDING_TRUNCATED") ==
        0);

  // Batches are checked as the device checked them: a write to a view nobody
  // created fails.
  Recorder orphan;
  Records write;
  write.prop(9, PropKey::Text).u8(Text).text("x");
  stage(orphan, 0, write);
  orphan.settle();
  CHECK(!rejection([&] { kuito::replayBatches(orphan.file()); }).empty());
}

void stopsAtItsLimit() {
  Recorder recorder(150);
  stage(recorder, 0, screen());
  recorder.settle();
  stage(recorder, 1, screen());
  recorder.settle();
  CHECK(recorder.truncated());
  // What it kept is still a recording from the start.
  CHECK(kuito::readRecording(recorder.file()).size() == 1);
}

} // namespace

int main() {
  replaysAVersionTwoRecording();
  keepsSettledJobsOnly();
  replaysViewMutationsWithoutTheUIThread();
  rejectsWhatIsNotARecording();
  stopsAtItsLimit();
  std::cout << "KUITO_RECORDING_PASS\n";
}
