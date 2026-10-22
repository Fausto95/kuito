#include "EventRecord.h"
#include "FrameClock.h"
#include "FrameHandoff.h"
#include "MotionMirror.h"
#include "MutationQueue.h"
#include "ViewTable.h"
#include "Wire.h"
#include "WireWork.h"
#include "check.h"
#include "wire-records.h"
#include <chrono>
#include <cstdlib>
#include <new>
#include <cstring>
#include <functional>
#include <iostream>
#include <thread>
#include <stdexcept>
#include <string>
#include <vector>

using kuito::KeyEdit;
using kuito::Mutation;
using kuito::MutationQueue;
using kuito::Op;
using kuito::PropKey;
using kuito::Value;
using kuito::ViewTable;
using namespace kuito::test;

// Every allocation the program makes: a decode or a queue that copies a
// string it could take shows up here.
static std::size_t allocations = 0;

void* operator new(std::size_t size) {
  ++allocations;
  if (void* block = std::malloc(size ? size : 1)) return block;
  throw std::bad_alloc();
}

void operator delete(void* pointer) noexcept { std::free(pointer); }
void operator delete(void* pointer, std::size_t) noexcept { std::free(pointer); }

namespace {


template <class Work>
std::string rejection(Work&& work) {
  try {
    work();
  } catch (const std::invalid_argument& error) {
    return error.what();
  }
  return "";
}

Mutation prop(std::uint32_t id, PropKey key, double number) {
  Mutation m;
  m.op = Op::Prop;
  m.id = id;
  m.key = key;
  m.kind = Value::Number;
  m.number = number;
  return m;
}

Mutation structural(Op op, std::uint32_t id, std::uint32_t parent = 0) {
  Mutation m;
  m.op = op;
  m.id = id;
  m.parent = parent;
  m.name = "view" + std::to_string(id);
  m.text = "VStack";
  return m;
}

void decodesTypedRecords() {
  Records batch;
  batch.create(1, 0, "VStack", "root")
      .create(2, 1, "Text", "label", true)
      .prop(2, PropKey::Opacity).u8(Number).f64(0.5)
      .prop(2, PropKey::BackgroundColor).u8(Text).text("#ff000080")
      .prop(2, PropKey::Color).u8(Text).text("#0f0")
      .prop(2, PropKey::AlignItems).u8(Text).text("center")
      .prop(2, PropKey::FontWeight).u8(Number).f64(600)
      .prop(2, PropKey::Hidden).u8(False)
      .prop(2, PropKey::Width).u8(Text).text("50%")
      .prop(2, PropKey::Height).u8(Number).f64(20)
      .prop(2, PropKey::Gestures).u8(Json).text("[]")
      .prop(2, PropKey::Text).u8(Null)
      .named(2, "playing").u8(True)
      .move(2, 1, 0)
      .op(Op::Command).u32(2).text("focus").text("")
      .op(Op::Flatten).u32(1).u8(1)
      .op(Op::UI).u8(List).u32(1).u8(Struct).u32(1).text("op").u8(Text).text("sweep")
      .op(Op::UIScript).text("source").text("kuito://ui/1")
      .op(Op::UIBundle).text("30915022b224a4f4e3dc4d4efc557a4c98b72737").text("kuito://ui/2")
      .remove(2);
  auto m = batch.decode();
  CHECK(m.size() == 20);
  CHECK(m[0].op == Op::Create && m[0].id == 1 && m[0].parent == 0 && m[0].text == "VStack" && m[0].name == "root");
  CHECK(!m[0].flattened && m[1].flattened);
  CHECK(m[2].key == PropKey::Opacity && m[2].kind == Value::Number && m[2].number == 0.5);
  // Colors are parsed once, here, to 0xRRGGBBAA.
  CHECK(m[3].kind == Value::Color && m[3].color == 0xff000080u);
  CHECK(m[4].kind == Value::Color && m[4].color == 0x00ff00ffu);
  // An enum is its index among the manifest's values, and only that: the
  // renderers read its text from their generated tables.
  CHECK(m[5].kind == Value::Enum && m[5].enumValue == 5 && m[5].text.empty());
  CHECK(m[6].kind == Value::Enum && m[6].enumValue == *kuito::enumValue(PropKey::FontWeight, "600") &&
        m[6].text.empty());
  CHECK(m[7].kind == Value::Boolean && m[7].number == 0);
  CHECK(m[8].kind == Value::Text && m[8].text == "50%");
  CHECK(m[9].kind == Value::Number && m[9].number == 20);
  CHECK(m[10].kind == Value::Json && m[10].text == "[]");
  CHECK(m[11].kind == Value::Null);
  CHECK(m[12].key == kuito::kNamedProp && m[12].name == "playing" && m[12].kind == Value::Boolean && m[12].number == 1);
  CHECK(m[13].op == Op::Move && m[13].parent == 1 && m[13].index == 0);
  CHECK(m[14].op == Op::Command && m[14].name == "focus");
  CHECK(m[15].op == Op::Flatten && m[15].flattened);
  CHECK(m[16].op == Op::UI && m[16].plain.items.size() == 1 && m[16].plain.items[0].field("op")->text == "sweep");
  CHECK(m[17].op == Op::UIScript && m[17].text == "source" && m[17].name == "kuito://ui/1");
  CHECK(m[18].op == Op::UIBundle && m[18].text == "30915022b224a4f4e3dc4d4efc557a4c98b72737" &&
        m[18].name == "kuito://ui/2");
  CHECK(m[19].op == Op::Remove && m[19].id == 2);
}

void rejectsMalformedRecords() {
  // Props animate on the UI thread: the batch has no animation record.
  Records unknown;
  unknown.u8(11).u32(1);
  CHECK(rejection([&] { unknown.decode(); }).find("unknown operation 11") != std::string::npos);

  Records wrongType;
  wrongType.prop(1, PropKey::Opacity).u8(Text).text("half");
  CHECK(rejection([&] { wrongType.decode(); }).find("opacity") != std::string::npos);

  Records badColor;
  badColor.prop(1, PropKey::BackgroundColor).u8(Text).text("red");
  CHECK(rejection([&] { badColor.decode(); }).find("backgroundColor") != std::string::npos);

  // An alignment keyword takes CSS's overflow position, as the app's types allow.
  Records safe;
  safe.prop(1, PropKey::AlignItems).u8(Text).text("safe center").prop(1, PropKey::JustifyContent).u8(Text).text("unsafe end");
  auto aligned = safe.decode();
  CHECK(aligned[0].kind == Value::Enum && aligned[0].enumValue == *kuito::enumValue(PropKey::AlignItems, "safe center"));
  CHECK(aligned[1].kind == Value::Enum &&
        aligned[1].enumValue == *kuito::enumValue(PropKey::JustifyContent, "unsafe end"));

  // A structured prop that takes a string (an image's URL) has it as a variant;
  // a recording made before plain data holds JSON text, which stays JSON.
  Records source;
  source.prop(1, PropKey::Src).u8(Text).text("https://example.com/a.png").prop(1, PropKey::Src).u8(Json).text("{\"uri\":\"x\"}");
  auto sources = source.decode();
  CHECK(sources[0].kind == Value::Struct && sources[0].record.numbers == std::vector<double>{0});
  CHECK(sources[0].record.strings == std::vector<std::string>{"https://example.com/a.png"});
  CHECK(sources[1].kind == Value::Json);

  Records badEnum;
  badEnum.prop(1, PropKey::AlignItems).u8(Text).text("middle");
  CHECK(rejection([&] { badEnum.decode(); }).find("alignItems") != std::string::npos);

  Records truncated;
  truncated.prop(1, PropKey::Opacity).u8(Number);
  CHECK(!rejection([&] { truncated.decode(); }).empty());

  Records unknownString;
  unknownString.op(Op::UIScript).u32(7).u32(8);
  CHECK(!rejection([&] { unknownString.decode(); }).empty());

  Records unknownOp;
  unknownOp.u8(42);
  CHECK(!rejection([&] { unknownOp.decode(); }).empty());
}

void checksStructuredPropsOnce() {
  // Numbers and strings in the schema's order (native/shared/Schema.h): a
  // gradient's angle, its colors' count, each color as 0xRRGGBBAA.
  Records gradient;
  gradient.prop(1, PropKey::BackgroundGradient).u8(Struct).u32(2)
      .text("angle").u8(Number).f64(90)
      .text("colors").u8(List).u32(2).u8(Text).text("#ffffff").u8(Text).text("#0008");
  auto m = gradient.decode();
  CHECK(m[0].kind == Value::Struct && m[0].record.numbers == std::vector<double>{90, 2, 0xffffffffu, 0x00000088u});
  CHECK(m[0].plain.field("angle")->number == 90);

  // An optional field: 1 and the value when present, 0 when left out; a map: its count, then key and value.
  Records remote;
  remote.prop(1, PropKey::Src).u8(Struct).u32(2)
      .text("uri").u8(Text).text("https://example.com/a.png")
      .text("headers").u8(Struct).u32(1).text("Authorization").u8(Text).text("Bearer x");
  auto image = remote.decode()[0].record;
  CHECK(image.numbers == std::vector<double>{2, 1, 1});
  CHECK(image.strings == std::vector<std::string>{"https://example.com/a.png", "Authorization", "Bearer x"});

  // A list of structs, each field in the schema's order whatever order it was written in.
  Records gestures;
  gestures.prop(1, PropKey::Gestures).u8(List).u32(1).u8(Struct).u32(4)
      .text("waitFor").u8(List).u32(1).u8(Number).f64(2)
      .text("type").u8(Text).text("pan")
      .text("tag").u8(Number).f64(1)
      .text("config").u8(Struct).u32(2).text("minDist").u8(Number).f64(0).text("enabled").u8(True);
  auto spec = gestures.decode()[0].record;
  CHECK(spec.numbers == std::vector<double>{1, 1, 0, 1, 2, 0, 0, 1, 1, 1, 1, 2, 0, 0});
  CHECK(spec.strings == std::vector<std::string>{"minDist", "enabled"});

  // A plain number some take (a field's count of lines) is one of its variants.
  Records lines;
  lines.prop(1, PropKey::Lines).u8(Number).f64(3);
  CHECK(lines.decode()[0].record.numbers == std::vector<double>{0, 3});

  const auto refused = [](Records& records) { return rejection([&] { records.decode(); }); };

  Records fraction;
  fraction.prop(1, PropKey::Lines).u8(Number).f64(1.5);
  CHECK(refused(fraction) == "KUITO_PROP_INVALID: lines expects a whole number, got a number");

  // The renderers read an integer as a 32-bit Int.
  Records huge;
  huge.prop(1, PropKey::Lines).u8(Number).f64(3e9);
  CHECK(refused(huge) == "KUITO_PROP_INVALID: lines expects a whole number, got a number");

  Records unknownField;
  unknownField.prop(1, PropKey::Selection).u8(Struct).u32(3)
      .text("start").u8(Number).f64(0).text("end").u8(Number).f64(1).text("caret").u8(Number).f64(1);
  CHECK(refused(unknownField) == "KUITO_PROP_INVALID: selection has no field \"caret\"");

  Records missing;
  missing.prop(1, PropKey::Selection).u8(Struct).u32(1).text("start").u8(Number).f64(0);
  CHECK(refused(missing) == "KUITO_PROP_INVALID: selection needs end");

  Records badColor;
  badColor.prop(1, PropKey::BackgroundGradient).u8(Struct).u32(2)
      .text("angle").u8(Number).f64(90).text("colors").u8(List).u32(1).u8(Text).text("red");
  CHECK(refused(badColor) == "KUITO_PROP_INVALID: backgroundGradient.colors[0] expects a hex color, got \"red\"");

  Records badEdge;
  badEdge.prop(1, PropKey::Edges).u8(List).u32(1).u8(Text).text("start");
  CHECK(refused(badEdge) == "KUITO_PROP_INVALID: edges[0] expects one of Edge, got \"start\"");

  Records noVariant;
  noVariant.prop(1, PropKey::Src).u8(Struct).u32(1).text("path").u8(Text).text("a.png");
  CHECK(refused(noVariant) == "KUITO_PROP_INVALID: src expects an ImageSource, got an object");

  // A module view's own props are untyped: an object reaches it as JSON.
  Records named;
  named.named(1, "region").u8(Struct).u32(1).text("zoom").u8(Number).f64(2);
  auto region = named.decode()[0];
  CHECK(region.kind == Value::Json && region.text == "{\"zoom\":2}");
}

void decodesKeyDiffs() {
  Records batch;
  batch.prop(1, PropKey::Keys).u8(Keys).u32(3)
      .edit(Remove, 1, "b")
      .edit(MoveKey, 0, "d")
      .edit(Insert, 2, "e")
      .prop(1, PropKey::Keys).u8(Keys).u32(0)
      .prop(1, PropKey::Keys).u8(Null);
  auto m = batch.decode();
  CHECK(m.size() == 3);
  CHECK(m[0].key == PropKey::Keys && m[0].kind == Value::Keys && m[0].edits.size() == 3);
  CHECK(m[0].edits[0].op == KeyEdit::Op::Remove && m[0].edits[0].index == 1 && m[0].edits[0].key == "b");
  CHECK(m[0].edits[1].op == KeyEdit::Op::Move && m[0].edits[1].index == 0 && m[0].edits[1].key == "d");
  CHECK(m[0].edits[2].op == KeyEdit::Op::Insert && m[0].edits[2].index == 2 && m[0].edits[2].key == "e");
  CHECK(m[1].kind == Value::Keys && m[1].edits.empty());
  CHECK(m[2].kind == Value::Null);

  // A list's keys arrive only as a diff.
  Records whole;
  whole.prop(1, PropKey::Keys).u8(Json).text("[\"a\"]");
  CHECK(rejection([&] { whole.decode(); }).find("keys expects a key diff") != std::string::npos);

  Records elsewhere;
  elsewhere.prop(1, PropKey::SpanningKeys).u8(Keys).u32(0);
  CHECK(rejection([&] { elsewhere.decode(); }).find("spanningKeys") != std::string::npos);

  Records named;
  named.named(1, "rows").u8(Keys).u32(0);
  CHECK(rejection([&] { named.decode(); }).find("rows") != std::string::npos);

  Records unknownEdit;
  unknownEdit.prop(1, PropKey::Keys).u8(Keys).u32(1).edit(3, 0, "a");
  CHECK(rejection([&] { unknownEdit.decode(); }).find("unknown key edit 3") != std::string::npos);

  Records farIndex;
  farIndex.prop(1, PropKey::Keys).u8(Keys).u32(1).edit(Insert, 0x80000000u, "a");
  CHECK(rejection([&] { farIndex.decode(); }).find("index") != std::string::npos);

  // A count the record cannot hold fails as truncated before anything is allocated for it.
  Records overlong;
  overlong.prop(1, PropKey::Keys).u8(Keys).u32(0xffffffffu).edit(Insert, 0, "a");
  CHECK(rejection([&] { overlong.decode(); }).find("KUITO_WIRE_TRUNCATED") != std::string::npos);
}

void tableRejectsAndDiscardsWhole() {
  ViewTable table;
  table.apply({structural(Op::Create, 1), structural(Op::Create, 2, 1)});
  CHECK(table.size() == 2);

  // A create of an id that exists.
  auto duplicate = rejection([&] { table.apply({structural(Op::Create, 3, 1), structural(Op::Create, 2, 1)}); });
  CHECK(duplicate.find("view2") != std::string::npos);
  CHECK(table.size() == 2 && !table.contains(3) && "the batch is discarded whole");

  // An insert under a parent that does not exist.
  CHECK(!rejection([&] { table.apply({structural(Op::Create, 4, 9)}); }).empty());
  CHECK(!rejection([&] { table.apply({structural(Op::Move, 2, 9)}); }).empty());
  CHECK(!table.contains(4) && table.parentOf(2) == 1);

  // A remove of a parent before its children.
  auto parentFirst = rejection([&] { table.apply({structural(Op::Remove, 1), structural(Op::Remove, 2)}); });
  CHECK(parentFirst.find("view1") != std::string::npos);
  CHECK(table.contains(1) && table.contains(2));

  // Writes to a view that does not exist.
  CHECK(!rejection([&] { table.apply({prop(9, PropKey::Opacity, 1)}); }).empty());

  // Children first lands; a moved child leaves its old parent's count.
  table.apply({structural(Op::Create, 5), structural(Op::Move, 2, 5), structural(Op::Remove, 1)});
  CHECK(!table.contains(1) && table.parentOf(2) == 5);

  // A job that fails after its batches landed in the table takes them back.
  table.settle();
  table.apply({structural(Op::Create, 6, 5)});
  table.discard();
  CHECK(!table.contains(6) && table.contains(5));
}

void queueKeepsLastWritePerProp() {
  MutationQueue queue;
  queue.push(structural(Op::Create, 1));
  queue.push(prop(1, PropKey::Opacity, 0.1));
  queue.push(prop(1, PropKey::Opacity, 0.9));
  queue.push(prop(1, PropKey::Gap, 12));
  auto one = queue.take();
  CHECK(one.size() == 3);
  CHECK(one[1].key == PropKey::Opacity && one[1].number == 0.9);
  CHECK(one[2].key == PropKey::Gap);

  // The kept write sits where it was written, after the writes between.
  queue.push(prop(1, PropKey::Opacity, 0.1));
  queue.push(prop(1, PropKey::Gap, 12));
  queue.push(prop(1, PropKey::Opacity, 0.9));
  auto moved = queue.take();
  CHECK(moved.size() == 2);
  CHECK(moved[0].key == PropKey::Gap);
  CHECK(moved[1].key == PropKey::Opacity && moved[1].number == 0.9);

  // Never dedupe across remove/create, even with the same view ID.
  queue.push(prop(1, PropKey::Opacity, 0.2));
  queue.push(structural(Op::Remove, 1));
  queue.push(structural(Op::Create, 1));
  queue.push(prop(1, PropKey::Opacity, 0.3));
  auto two = queue.take();
  CHECK(two.size() == 4 && two[0].number == 0.2 && two[3].number == 0.3);

  // UI-thread operations and commands run between the writes around them.
  queue.push(prop(1, PropKey::Opacity, 1));
  Mutation ui;
  ui.op = Op::UI;
  queue.push(ui);
  queue.push(prop(1, PropKey::Opacity, 0.5));
  auto three = queue.take();
  CHECK(three.size() == 3 && three[0].number == 1 && three[2].number == 0.5);

  // A named prop (a module view's) merges by its name.
  Mutation a, b;
  a.op = b.op = Op::Prop;
  a.id = b.id = 1;
  a.name = b.name = "playing";
  a.kind = b.kind = Value::Boolean;
  b.number = 1;
  queue.push(a);
  queue.push(b);
  auto five = queue.take();
  CHECK(five.size() == 1 && five[0].number == 1);

  queue.push(prop(1, PropKey::Opacity, 1));
  queue.clear();
  CHECK(queue.take().empty());
}

Mutation keyDiff(std::uint32_t id, std::string key) {
  Mutation m;
  m.op = Op::Prop;
  m.id = id;
  m.key = PropKey::Keys;
  m.kind = Value::Keys;
  m.edits.push_back({KeyEdit::Op::Insert, 0, std::move(key)});
  return m;
}

void queueKeepsEveryKeyDiff() {
  MutationQueue queue;
  queue.push(structural(Op::Create, 1));
  queue.push(keyDiff(1, "a"));
  queue.push(keyDiff(1, "b"));
  auto both = queue.take();
  CHECK(both.size() == 3);
  CHECK(both[1].edits[0].key == "a" && both[2].edits[0].key == "b");

  // A plain write and a diff apply in order: no write merges across a diff.
  Mutation reset;
  reset.op = Op::Prop;
  reset.id = 1;
  reset.key = PropKey::Keys;
  queue.push(reset);
  queue.push(keyDiff(1, "c"));
  queue.push(reset);
  auto ordered = queue.take();
  CHECK(ordered.size() == 3);
  CHECK(ordered[0].kind == Value::Null && ordered[1].kind == Value::Keys && ordered[2].kind == Value::Null);
}

kuito::PlainValue text(const char* value) {
  kuito::PlainValue plain;
  plain.kind = kuito::PlainValue::Kind::Text;
  plain.text = value;
  return plain;
}

void mirrorAnswersLatest() {
  kuito::MotionMirror mirror;
  mirror.write("m1", text("#000000"), 0);
  mirror.write("m1", text("#ffffff"), 1);
  const auto read = mirror.read("m1");
  CHECK(read && read->value.text == "#ffffff" && read->js == 1);
  CHECK(!mirror.read("m2"));
  mirror.clear();
  CHECK(!mirror.read("m1"));
}

void mirrorAnswersNumbersWithoutJson() {
  using Fresh = kuito::MotionMirror::Fresh;
  kuito::MotionMirror mirror;
  mirror.writeNumber("m1", 0.5, 2);
  auto fresh = mirror.readNumber("m1", 2);
  CHECK(fresh.kind == Fresh::Number && fresh.value == 0.5);
  CHECK(mirror.readNumber("m1", 3).kind == Fresh::Stale && "a JS write the UI thread has not applied");
  CHECK(mirror.readNumber("m2", 0).kind == Fresh::Stale && "a value the UI thread never mirrored");
  const auto whole = mirror.read("m1");
  CHECK(whole && whole->value.number == 0.5 && whole->js == 2 && "a number still reads whole");
  mirror.write("m1", text("#ffffff"), 2);
  CHECK(mirror.readNumber("m1", 0).kind == Fresh::Other);
}

} // namespace

kuito::Batch batchOf(std::uint32_t id) {
  kuito::Batch batch;
  Mutation m;
  m.op = Op::Remove;
  m.id = id;
  batch.mutations.push_back(m);
  return batch;
}

void handoffDrainsWithinItsBudget() {
  kuito::FrameHandoff handoff;
  // The first batch of an idle handoff asks for a frame; later ones ride on it.
  CHECK(handoff.push(batchOf(1)));
  CHECK(!handoff.push(batchOf(2)));
  CHECK(!handoff.push(batchOf(3)));

  // A spent budget still applies one batch per frame, in order.
  std::vector<std::uint32_t> applied;
  const auto apply = [&](kuito::Batch& batch) { applied.push_back(batch.mutations[0].id); };
  handoff.drain([] { return true; }, apply);
  CHECK(applied == std::vector<std::uint32_t>{1});
  // Work left when the frame's budget ran out: the UI thread is behind.
  CHECK(handoff.busy() && handoff.pending());

  handoff.drain([] { return false; }, apply);
  CHECK((applied == std::vector<std::uint32_t>{1, 2, 3}));
  CHECK(!handoff.busy() && !handoff.pending());
  CHECK(handoff.push(batchOf(4)));

  // A batch pushed while it applies waits for the next frame.
  applied.clear();
  handoff.drain([] { return false; }, [&](kuito::Batch& batch) {
    applied.push_back(batch.mutations[0].id);
    if (batch.mutations[0].id == 4) handoff.push(batchOf(5));
  });
  CHECK(applied == std::vector<std::uint32_t>{4});
  CHECK(handoff.pending() && !handoff.busy());

  handoff.clear();
  CHECK(!handoff.pending() && handoff.push(batchOf(6)));
}

void handoffWaitsForAnInputJobWithinItsBudget() {
  kuito::FrameHandoff handoff;
  const auto budget = std::chrono::milliseconds(50);

  // Only a press, a change and a field's edit for its format wait.
  CHECK(handoff.expectInput("scroll") == 0 && !handoff.awaitInput(0, budget));
  CHECK(handoff.expectInput("format") != 0);

  // A job that finishes in time: its batch is in the handoff when the wait ends.
  const auto quick = handoff.expectInput("press");
  std::thread js([&] {
    handoff.push(batchOf(1));
    handoff.inputDone(quick);
  });
  CHECK(handoff.awaitInput(quick, budget));
  CHECK(handoff.pending());
  js.join();

  // One the JS thread never gets to: the wait gives up at its budget.
  const auto stuck = handoff.expectInput("change");
  const auto started = std::chrono::steady_clock::now();
  CHECK(!handoff.awaitInput(stuck, std::chrono::milliseconds(5)));
  CHECK(std::chrono::steady_clock::now() - started < std::chrono::milliseconds(200));

  // Its late finish answers no later wait for another job.
  const auto next = handoff.expectInput("press");
  handoff.inputDone(stuck);
  CHECK(!handoff.awaitInput(next, std::chrono::milliseconds(5)));
  handoff.inputDone(next);
  CHECK(handoff.awaitInput(next, budget));
}

void handoffNeverDrainsInsideADrain() {
  kuito::FrameHandoff handoff;
  handoff.push(batchOf(1));
  handoff.push(batchOf(2));

  // Applying batch 1 fires a change synchronously, as Android's TextWatcher
  // does for setText. Its job answers at once with batch 3; the event path
  // then drains if the wait succeeded.
  std::vector<std::uint32_t> applied;
  int depth = 0;
  bool nested = false;
  std::function<void(kuito::Batch&)> apply = [&](kuito::Batch& batch) {
    if (depth > 0) nested = true;
    ++depth;
    const auto id = batch.mutations[0].id;
    applied.push_back(id);
    if (id == 1) {
      const auto job = handoff.expectInput("change");
      handoff.push(batchOf(3));
      if (job) handoff.inputDone(job);
      if (handoff.awaitInput(job, std::chrono::milliseconds(50))) handoff.drain([] { return false; }, apply);
    }
    --depth;
  };
  handoff.drain([] { return false; }, apply);
  CHECK(!nested && "no batch applies inside another");
  CHECK((applied == std::vector<std::uint32_t>{1, 2}));
  CHECK(handoff.pending());

  handoff.drain([] { return false; }, apply);
  CHECK((applied == std::vector<std::uint32_t>{1, 2, 3}));
  CHECK(!handoff.pending() && !handoff.busy());
}

// The input path drains at the latest display frame at or before now, so the
// display frame after it never runs the UI kernel at an earlier time.
void inputDrainsAtTheLatestDisplayFrame() {
  // Display frames every 10 units from 100; input at 125 falls in the one at 120.
  CHECK(kuito::latestFrame(125, 100, 10) == 120);
  // The link's own frame, its callback not run yet: that frame's time.
  CHECK(kuito::latestFrame(130, 120, 10) == 130);
  CHECK(kuito::latestFrame(139.5, 120, 10) == 130);
  // No frame yet: now.
  CHECK(kuito::latestFrame(125, 0, 0) == 125);
  // A timestamp ahead of now (a clock read before it): never later than now.
  CHECK(kuito::latestFrame(95, 100, 10) == 95);
}

void wireWorkCountsWhatCrossesAsJson() {
  Records batch;
  batch.create(1, 0, "Box", "card")
      .prop(1, PropKey::Gestures).u8(Json).text("[]")
      .prop(1, PropKey::Src).u8(Text).text("https://example.com/a.png")
      .op(Op::UI).u8(List).u32(0);
  // The renderer parses the JSON value; a URL in a JSON prop is plain text.
  CHECK(kuito::jsonValues(batch.decode()) == 1);

  kuito::WireWork work;
  kuito::WorkTally first;
  kuito::WorkTally second;
  first.read(work, 3, 120);
  first.read(work, 5, 120);
  // A runtime of its own counts from its own zero.
  second.read(work, 1, 10);
  CHECK(work.jsonParses == 6 && work.bytesStringified == 130);
}

void eventRecordsFillTheirLayout() {
  kuito::EventRecord none;
  kuito::checkRecord(none);
  kuito::checkRecord(kuito::jsonRecord("{\"seconds\":12}"));

  // Layout ids follow the manifest's PAYLOADS: find one by name, as the renderers' generated types carry it.
  std::int32_t scroll = 0;
  for (std::size_t id = 1; id < kuito::kEventLayoutCount; ++id)
    if (std::string(kuito::kEventLayouts[id].name) == "ScrollPayload") scroll = static_cast<std::int32_t>(id);
  CHECK(scroll > 0);

  kuito::EventRecord record;
  record.layout = scroll;
  record.numbers = {0, 40, 400, 900, 400, 800};
  kuito::checkRecord(record);

  record.numbers.pop_back();
  CHECK(rejection([&] { kuito::checkRecord(record); }) ==
        "KUITO_EVENT_LAYOUT: ScrollPayload takes 6 numbers and 0 strings, not 5 and 0");

  record.layout = static_cast<std::int32_t>(kuito::kEventLayoutCount);
  CHECK(rejection([&] { kuito::checkRecord(record); }).find("no event layout") != std::string::npos);
  CHECK(kuito::kEventNumbers >= 6);
}

// Each string the kernel sends is named once (src/runtime/wire.ts), so a
// decode takes it from the batch's table rather than copying it: a long
// label or text allocates once, in the table, not again in its Mutation.
void decodingTakesTheBatchStrings() {
  const std::string label(40, 'l'), text(60, 't');
  Records batch;
  for (std::uint32_t id = 1; id <= 100; ++id)
    batch.create(id, 0, "VStack", (label + std::to_string(id)).c_str()).prop(id, PropKey::Text).u8(Text).text(text);
  std::vector<std::string> strings = batch.strings;
  const std::size_t before = allocations;
  const auto m = kuito::decodeBatch(batch.bytes.data(), batch.bytes.size(), std::move(strings));
  const std::size_t made = allocations - before;
  CHECK(m.size() == 200 && m[0].name == label + "1" && m[1].text == text);
  // The Mutations' own vector grows a dozen times; copying the strings would be 200 more.
  if (made >= 32) std::fprintf(stderr, "decoding 200 records with long strings allocated %zu times\n", made);
  CHECK(made < 32);

  // A second record naming a string the first took is malformed.
  Records twice;
  twice.create(1, 0, "VStack", "root").op(Op::Create).u32(2).u32(0).u32(0).u32(1).u8(0);
  CHECK(rejection([&] {
          kuito::decodeBatch(twice.bytes.data(), twice.bytes.size(), std::vector<std::string>(twice.strings));
        }).find("string 0 is named twice") != std::string::npos);
}

// A module view's own prop merges by its view and name with no key built
// from them: named writes allocate as often as writes by key.
void namedPropsMergeWithoutAKeyString() {
  const auto count = [](bool named) {
    std::vector<Mutation> writes;
    for (std::uint32_t id = 1; id <= 100; ++id) {
      Mutation m = prop(id, PropKey::Opacity, 1);
      if (named) m.key = kuito::kNamedProp, m.name = std::string(40, 'n');
      writes.push_back(std::move(m));
    }
    MutationQueue queue;
    const std::size_t before = allocations;
    for (auto& write : writes) queue.push(std::move(write));
    return allocations - before;
  };
  const std::size_t keyed = count(false), named = count(true);
  if (named > keyed + 2) std::fprintf(stderr, "100 named writes allocated %zu times, by key %zu\n", named, keyed);
  CHECK(named <= keyed + 2);
}

int main() {
  decodesTypedRecords();
  decodingTakesTheBatchStrings();
  namedPropsMergeWithoutAKeyString();
  checksStructuredPropsOnce();
  eventRecordsFillTheirLayout();
  wireWorkCountsWhatCrossesAsJson();
  rejectsMalformedRecords();
  decodesKeyDiffs();
  tableRejectsAndDiscardsWhole();
  queueKeepsLastWritePerProp();
  queueKeepsEveryKeyDiff();
  mirrorAnswersLatest();
  mirrorAnswersNumbersWithoutJson();
  handoffDrainsWithinItsBudget();
  handoffWaitsForAnInputJobWithinItsBudget();
  handoffNeverDrainsInsideADrain();
  inputDrainsAtTheLatestDisplayFrame();
  std::cout << "KUITO_MUTATION_BATCH_PASS" << std::endl;
}
