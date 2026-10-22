#include "Link.h"
#include "LinkJSI.h"
#include "WireWork.h"
#include "check.h"
#include <hermes/hermes.h>
#include <jsi/instrumentation.h>
#include <iostream>
#include <memory>
#include <string>

using namespace kuito;

namespace {

jsi::Value evaluate(jsi::Runtime& rt, const std::string& source) {
  return rt.evaluateJavaScript(std::make_shared<jsi::StringBuffer>("(" + source + ")"), "link-jsi");
}

/// `value` as JavaScript prints it, for comparing what crossed back.
std::string printed(jsi::Runtime& rt, const jsi::Value& value) {
  auto stringify = rt.global().getPropertyAsObject(rt, "JSON").getPropertyAsFunction(rt, "stringify");
  return stringify.call(rt, value).asString(rt).utf8(rt);
}

template <class Work>
std::string mismatch(Work&& work, const std::string& code) {
  try {
    work();
  } catch (const LinkMismatch& error) {
    CHECK(error.code == code);
    return error.what();
  }
  return "";
}

void signaturesParse() {
  auto parsed = parseLinkSignature("(s,[j){columns:[s,rows:[[j,until?:?n}");
  CHECK(parsed.arguments.size() == 2);
  CHECK(parsed.arguments[0].kind == LinkType::Kind::Text);
  CHECK(parsed.arguments[1].kind == LinkType::Kind::Array);
  CHECK(parsed.arguments[1].of[0].kind == LinkType::Kind::Json);
  CHECK(parsed.result.kind == LinkType::Kind::Struct);
  CHECK(parsed.result.fields.size() == 3);
  CHECK(parsed.result.fields[2].name == "until" && parsed.result.fields[2].optional);
  CHECK(parsed.result.of[2].kind == LinkType::Kind::Nullable);
  CHECK(parseLinkSignature("()_").arguments.empty());
  auto tree = parseLinkSignature("(=Node{name:s,children:[^Node})^Node");
  CHECK(tree.arguments[0].kind == LinkType::Kind::Reference);
  CHECK(tree.arguments[0].target->of[1].of[0].target == tree.arguments[0].target);
  CHECK(tree.result.target == tree.arguments[0].target);
  CHECK(parseLinkSignature("(){}").result.fields.empty());

  for (const char* malformed :
       {"", "s", "(s", "(y)_", "(){a:n", "(){:n}", "()nn", "()^Node", "(=A{},=A{})_"}) {
    bool threw = false;
    try {
      parseLinkSignature(malformed);
    } catch (const std::invalid_argument&) { threw = true; }
    CHECK(threw);
  }
}

void signaturesCache() {
  int asked = 0;
  LinkSignatures signatures([&asked](int member) {
    ++asked;
    return member == 3 ? std::string("(n)b") : std::string();
  });
  CHECK(signatures.find(3) != nullptr);
  CHECK(signatures.find(3)->result.kind == LinkType::Kind::Boolean);
  CHECK(signatures.find(4) == nullptr);
  CHECK(signatures.find(4) == nullptr);
  CHECK(asked == 2);
}

void argumentsCrossTyped(jsi::Runtime& rt) {
  auto signature = parseLinkSignature("(s,{title:s,badge?:n,mode:e,actions:[{id:s,title:s},extra:%n,data:j,until:?n})_");
  jsi::Value args[] = {
      jsi::Value(1),
      evaluate(rt, "'Episode'"),
      evaluate(rt, "({ title: 'Ep', mode: 'saver', actions: [{ id: 'play', title: 'Play' }], extra: { a: 1, b: 2 },"
                   " data: { nested: [1, 'x', null, { deep: true }] }, until: null, ignored: 'not in the spec' })"),
  };
  auto values = linkArguments(rt, args, 1, 3, &signature);
  CHECK(values.size() == 2);
  CHECK(values[0].kind == LinkValue::Kind::Text && values[0].text == "Episode");

  const auto& notice = values[1];
  // The struct's fields in the order the spec declares them: no names cross.
  CHECK(notice.kind == LinkValue::Kind::List);
  CHECK(notice.items.size() == 7);
  CHECK(notice.items[0].text == "Ep");
  CHECK(notice.items[1].kind == LinkValue::Kind::Null);
  CHECK(notice.items[2].text == "saver");
  CHECK(notice.items[3].kind == LinkValue::Kind::List && notice.items[3].items.size() == 1);
  CHECK(notice.items[3].items[0].items[0].text == "play");
  CHECK(notice.items[3].items[0].items[1].text == "Play");
  CHECK(notice.items[4].kind == LinkValue::Kind::Entries);
  CHECK(notice.items[4].keys.size() == 2 && notice.items[4].keys[1] == "b" && notice.items[4].items[1].number == 2);
  const auto& data = notice.items[5];
  CHECK(data.kind == LinkValue::Kind::Entries && data.keys[0] == "nested");
  CHECK(data.items[0].kind == LinkValue::Kind::List && data.items[0].items.size() == 4);
  CHECK(data.items[0].items[2].kind == LinkValue::Kind::Null);
  CHECK(data.items[0].items[3].keys[0] == "deep" && data.items[0].items[3].items[0].flag);
  CHECK(notice.items[6].kind == LinkValue::Kind::Null);
}

void argumentsThatDoNotMatchFail(jsi::Runtime& rt) {
  auto signature = parseLinkSignature("({actions:[{id:s,title:s}})_");
  jsi::Value args[] = {evaluate(rt, "({ actions: [{ id: 'a', title: 'A' }, { id: 'b', title: 2 }] })")};
  CHECK(mismatch([&] { linkArguments(rt, args, 0, 1, &signature); }, "ERR_ARGUMENT") ==
        "argument 1.actions[1].title must be a string");

  jsi::Value missing[] = {evaluate(rt, "({})")};
  CHECK(mismatch([&] { linkArguments(rt, missing, 0, 1, &signature); }, "ERR_ARGUMENT") ==
        "argument 1.actions must be an array");

  auto number = parseLinkSignature("(n)_");
  jsi::Value infinite[] = {evaluate(rt, "1 / 0")};
  CHECK(mismatch([&] { linkArguments(rt, infinite, 0, 1, &number); }, "ERR_ARGUMENT") ==
        "argument 1 must be a number");

  jsi::Value two[] = {evaluate(rt, "({ actions: [] })"), jsi::Value(2)};
  CHECK(mismatch([&] { linkArguments(rt, two, 0, 2, &signature); }, "ERR_ARGUMENT") == "takes 1 arguments, not 2");

  // A member the shell does not link sends nothing: its table fails the call.
  CHECK(linkArguments(rt, two, 0, 2, nullptr).empty());
}

void resultsBuildObjects(jsi::Runtime& rt) {
  auto rows = parseLinkSignature("(){columns:[s,rows:[[j,until?:n,next:?n,label?:s}").result;
  auto answered = LinkValue::list({
      LinkValue::list({LinkValue::string("id"), LinkValue::string("name")}),
      LinkValue::list({LinkValue::list({LinkValue::numeric(1), LinkValue::string("a")}),
                       LinkValue::list({LinkValue::numeric(2), LinkValue()})}),
      LinkValue(),
      LinkValue(),
      LinkValue::string("shows"),
  });
  CHECK(printed(rt, jsiValue(rt, answered, rows)) ==
        R"({"columns":["id","name"],"rows":[[1,"a"],[2,null]],"next":null,"label":"shows"})");

  auto record = parseLinkSignature("()%[n").result;
  CHECK(printed(rt, jsiValue(rt, LinkValue::entries({"a"}, {LinkValue::list({LinkValue::numeric(3)})}), record)) ==
        R"({"a":[3]})");

  auto json = parseLinkSignature("()j").result;
  auto untyped = LinkValue::entries({"fix", "list"}, {LinkValue::entries({"lat"}, {LinkValue::numeric(48.5)}),
                                                       LinkValue::list({LinkValue::boolean(true), LinkValue()})});
  CHECK(printed(rt, jsiValue(rt, untyped, json)) == R"({"fix":{"lat":48.5},"list":[true,null]})");

  // A struct that contains itself crosses both ways.
  auto tree = parseLinkSignature("(=Node{name:s,children:[^Node})^Node");
  jsi::Value nodes[] = {evaluate(rt, "({ name: 'a', children: [{ name: 'b', children: [] }] })")};
  auto crossed = linkArguments(rt, nodes, 0, 1, &tree);
  CHECK(crossed[0].items[1].items[0].items[0].text == "b");
  CHECK(printed(rt, jsiValue(rt, crossed[0], tree.result)) == R"({"name":"a","children":[{"name":"b","children":[]}]})");

  // A key named __proto__ is an entry, as JSON.parse makes it, not the object's prototype.
  auto polluting = LinkValue::entries({"__proto__"}, {LinkValue::entries({"isAdmin"}, {LinkValue::boolean(true)})});
  auto made = jsiValue(rt, polluting, json);
  auto inherited = evaluate(rt, "(function (made) { return made.isAdmin === undefined && Object.keys(made).length === 1; })");
  CHECK(inherited.asObject(rt).asFunction(rt).call(rt, made).getBool());

  CHECK(mismatch([&] { jsiValue(rt, LinkValue::list({LinkValue()}), rows); }, "ERR_ENCODE") ==
        "the result is not an object");
  CHECK(mismatch([&] { jsiValue(rt, LinkValue::string("1"), parseLinkSignature("()n").result); }, "ERR_ENCODE") ==
        "the result is not a number");
}

/// Bytes the platform owns, counting how many are alive.
struct NativeBytes : LinkBuffer {
  static inline int alive = 0;
  explicit NativeBytes(std::vector<uint8_t> bytes) : bytes(std::move(bytes)) { ++alive; }
  ~NativeBytes() override { --alive; }
  uint8_t* data() override { return bytes.data(); }
  size_t size() const override { return bytes.size(); }
  std::vector<uint8_t> bytes;
};

void bytesCrossAsArrayBuffers(jsi::Runtime& rt) {
  auto write = parseLinkSignature("(x,?x)_");
  CHECK(write.arguments[0].kind == LinkType::Kind::Bytes);

  // One JavaScript made is copied once, into memory the platform allocates.
  size_t allocated = 0;
  LinkAllocate allocate = [&allocated](size_t size) {
    allocated += size;
    return std::make_shared<NativeBytes>(std::vector<uint8_t>(size));
  };
  auto made = evaluate(rt, "new Uint8Array([1, 2, 3]).buffer");
  jsi::Value args[] = {jsi::Value(rt, made), jsi::Value::null()};
  auto values = linkArguments(rt, args, 0, 2, &write, allocate);
  CHECK(values[0].kind == LinkValue::Kind::Bytes);
  CHECK(values[0].bytes->size() == 3 && values[0].bytes->data()[2] == 3);
  CHECK(values[0].bytes->data() != made.asObject(rt).getArrayBuffer(rt).data(rt));
  CHECK(allocated == 3);
  CHECK(values[1].kind == LinkValue::Kind::Null);

  // One the platform made crosses without a copy, both ways.
  auto read = parseLinkSignature("()x").result;
  auto owned = std::make_shared<NativeBytes>(std::vector<uint8_t>{9, 8, 7, 6});
  auto* bytes = owned->data();
  {
    auto buffer = jsiValue(rt, LinkValue::buffer(owned), read);
    CHECK(buffer.asObject(rt).getArrayBuffer(rt).data(rt) == bytes);
    auto sum = evaluate(rt, "(function (b) { return new Uint8Array(b).reduce((a, c) => a + c, 0); })");
    CHECK(sum.asObject(rt).asFunction(rt).call(rt, buffer).asNumber() == 30);

    jsi::Value back[] = {std::move(buffer)};
    auto again = linkArguments(rt, back, 0, 1, &write, allocate);
    CHECK(again[0].bytes == owned);
    CHECK(allocated == 3);
  }
  owned.reset();
  values.clear();
  rt.instrumentation().collectGarbage("link-jsi");
  CHECK(NativeBytes::alive == 0);

  jsi::Value text[] = {evaluate(rt, "'AQI='")};
  CHECK(mismatch([&] { linkArguments(rt, text, 0, 1, &write); }, "ERR_ARGUMENT") ==
        "argument 1 must be an ArrayBuffer");
  jsi::Value typed[] = {evaluate(rt, "new Uint8Array([1])")};
  CHECK(mismatch([&] { linkArguments(rt, typed, 0, 1, &write); }, "ERR_ARGUMENT") ==
        "argument 1 must be an ArrayBuffer");
  CHECK(mismatch([&] { jsiValue(rt, LinkValue::string("AQI="), read); }, "ERR_ENCODE") ==
        "the result is not an ArrayBuffer");
}

/// What a storage select, a notification and a location fix cross: the
/// workload docs/performance.md#json-at-the-boundary cites for module calls.
void noJsonCrosses(jsi::Runtime& rt) {
  const auto parses = wireWork().jsonParses.load();
  const auto stringified = wireWork().bytesStringified.load();

  auto select = parseLinkSignature("(s,[j){columns:[s,rows:[[j}");
  jsi::Value query[] = {evaluate(rt, "'select id, name from shows where id in (?, ?)'"), evaluate(rt, "[1, 'a', null]")};
  linkArguments(rt, query, 0, 2, &select);
  jsiValue(rt,
           LinkValue::list({LinkValue::list({LinkValue::string("id"), LinkValue::string("name")}),
                            LinkValue::list({LinkValue::list({LinkValue::numeric(1), LinkValue::string("a")}),
                                             LinkValue::list({LinkValue::numeric(2), LinkValue::string("b")})})}),
           select.result);

  auto notify = parseLinkSignature("({title:s,body:s,actions:[{id:s,title:s},badge:n})_");
  jsi::Value notice[] = {evaluate(
      rt, "({ title: 'Ep', body: 'b', actions: [{ id: 'play', title: 'Play' }, { id: 'later', title: 'Later' }], badge: 2 })")};
  linkArguments(rt, notice, 0, 1, &notify);

  auto fix = parseLinkSignature("(){coords:{latitude:n,longitude:n},timestamp:n}");
  jsiValue(rt,
           LinkValue::list({LinkValue::list({LinkValue::numeric(48.85), LinkValue::numeric(2.35)}),
                            LinkValue::numeric(1)}),
           fix.result);

  std::cout << "link workload: jsonParses=" << wireWork().jsonParses - parses
            << " bytesStringified=" << wireWork().bytesStringified - stringified << "\n";
  CHECK(wireWork().jsonParses == parses);
  CHECK(wireWork().bytesStringified == stringified);
}

} // namespace

int main() {
  signaturesParse();
  signaturesCache();
  auto runtime = facebook::hermes::makeHermesRuntime();
  argumentsCrossTyped(*runtime);
  argumentsThatDoNotMatchFail(*runtime);
  resultsBuildObjects(*runtime);
  bytesCrossAsArrayBuffers(*runtime);
  noJsonCrosses(*runtime);
  std::cout << "KUITO_LINK_JSI_PASS\n";
  return 0;
}
