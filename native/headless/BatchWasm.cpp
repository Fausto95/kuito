// WebAssembly binding of the shells' batch decoding for the headless host
// (src/tests/batch.ts): a batch, or a recording, decoded by Wire.h and
// checked by ViewTable as a shell checks it, handed back as JSON mutations.
#include "Recording.h"
#include "ViewTable.h"
#include "Wire.h"
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <exception>
#include <string>
#include <vector>

namespace {

// The views every batch so far built, to check the next one against.
kuito::ViewTable views;
// The last call's JSON, or its error's message.
std::string result;

void quote(std::string& out, const std::string& text) {
  out += '"';
  for (const char c : text) {
    const auto byte = static_cast<unsigned char>(c);
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (byte < 0x20) {
      char escaped[7];
      std::snprintf(escaped, sizeof escaped, "\\u%04x", byte);
      out += escaped;
    } else {
      out += c;
    }
  }
  out += '"';
}

// A number as JSON has it: shortest round trip, and null for what JSON cannot hold.
void number(std::string& out, double value) {
  if (!std::isfinite(value)) {
    out += "null";
    return;
  }
  char text[32];
  std::snprintf(text, sizeof text, "%.17g", value);
  out += text;
}

void field(std::string& out, const char* name) {
  out += ",\"";
  out += name;
  out += "\":";
}

constexpr const char* kOps[] = {"", "create", "remove", "move", "flatten", "prop", "command", "ui", "uiScript", "uiKernel", "uiBundle"};
constexpr const char* kValues[] = {"null", "number", "boolean", "text", "color", "enum", "json", "keys", "struct"};
constexpr const char* kEdits[] = {"insert", "remove", "move"};

void value(std::string& out, const kuito::Mutation& m) {
  using kuito::Value;
  switch (m.kind) {
  case Value::Null: out += "null"; return;
  case Value::Number: number(out, m.number); return;
  case Value::Boolean: out += m.number != 0 ? "true" : "false"; return;
  case Value::Color: number(out, m.color); return;
  case Value::Text:
  case Value::Json: quote(out, m.text); return;
  // An enum crosses as its index alone: its text is the manifest's.
  case Value::Enum: quote(out, std::string(kuito::propInfo(m.key).values[m.enumValue])); return;
  // The value as the kernel wrote it: the headless renderer reads it whole.
  case Value::Struct: kuito::writeJson(out, m.plain); return;
  case Value::Keys:
    out += '[';
    for (std::size_t i = 0; i < m.edits.size(); ++i) {
      if (i) out += ',';
      out += "{\"op\":\"";
      out += kEdits[static_cast<int>(m.edits[i].op)];
      out += "\",\"index\":";
      number(out, m.edits[i].index);
      out += ",\"key\":";
      quote(out, m.edits[i].key);
      out += '}';
    }
    out += ']';
    return;
  }
}

void mutation(std::string& out, const kuito::Mutation& m) {
  using kuito::Op;
  out += "{\"op\":\"";
  out += kOps[static_cast<int>(m.op)];
  out += '"';
  switch (m.op) {
  case Op::Create:
    field(out, "id"), number(out, m.id);
    field(out, "parent"), number(out, m.parent);
    field(out, "kind"), quote(out, m.text);
    field(out, "label"), quote(out, m.name);
    field(out, "flattened"), out += m.flattened ? "true" : "false";
    break;
  case Op::Remove: field(out, "id"), number(out, m.id); break;
  case Op::Move:
    field(out, "id"), number(out, m.id);
    field(out, "parent"), number(out, m.parent);
    field(out, "index"), number(out, m.index);
    break;
  case Op::Flatten:
    field(out, "id"), number(out, m.id);
    field(out, "flattened"), out += m.flattened ? "true" : "false";
    break;
  case Op::Prop:
    field(out, "id"), number(out, m.id);
    field(out, "name");
    quote(out, m.key == kuito::kNamedProp ? m.name : std::string(kuito::propInfo(m.key).name));
    field(out, "type"), quote(out, kValues[static_cast<int>(m.kind)]);
    field(out, "value"), value(out, m);
    if (m.kind == kuito::Value::Enum) field(out, "index"), number(out, m.enumValue);
    break;
  case Op::Command:
    field(out, "id"), number(out, m.id);
    field(out, "name"), quote(out, m.name);
    field(out, "argument"), quote(out, m.text);
    break;
  case Op::UI: field(out, "operations"), kuito::writeJson(out, m.plain); break;
  case Op::UIScript:
    field(out, "source"), quote(out, m.text);
    field(out, "url"), quote(out, m.name);
    break;
  case Op::UIKernel: field(out, "hash"), quote(out, m.text); break;
  case Op::UIBundle:
    field(out, "hash"), quote(out, m.text);
    field(out, "url"), quote(out, m.name);
    break;
  }
  out += '}';
}

void mutations(std::string& out, const std::vector<kuito::Mutation>& batch) {
  out += '[';
  for (std::size_t i = 0; i < batch.size(); ++i) {
    if (i) out += ',';
    mutation(out, batch[i]);
  }
  out += ']';
}

// `strings`: a u32 count, then each string as a u32 length and its UTF-8.
std::vector<std::string> readStrings(const std::uint8_t* data, std::uint32_t length) {
  const std::string bytes(reinterpret_cast<const char*>(data), length);
  kuito::recording::Reader in(bytes);
  std::vector<std::string> strings(in.scalar<std::uint32_t>());
  for (std::string& text : strings) {
    const auto size = in.scalar<std::uint32_t>();
    text.assign(in.take(size), size);
  }
  return strings;
}

template <typename Body>
bool guarded(Body body) {
  try {
    result.clear();
    body();
    return true;
  } catch (const std::exception& error) {
    result = error.what();
    return false;
  }
}

} // namespace

#define KUITO_EXPORT(name) __attribute__((export_name(#name)))

extern "C" {

KUITO_EXPORT(resultPointer) const char* kuitoResultPointer() { return result.data(); }
KUITO_EXPORT(resultLength) std::uint32_t kuitoResultLength() { return result.size(); }

// A batch the kernel committed, as `__kuitoHostCommit` receives it: on
// success the result is its mutations; otherwise the result is why the
// batch was rejected, and the views stay as they were.
KUITO_EXPORT(decode)
bool kuitoDecode(const std::uint8_t* bytes, std::uint32_t length, const std::uint8_t* strings,
                  std::uint32_t stringsLength) {
  return guarded([&] {
    const std::vector<kuito::Mutation> batch = kuito::decodeBatch(bytes, length, readStrings(strings, stringsLength));
    views.apply(batch);
    views.settle();
    mutations(result, batch);
  });
}

// A `.krec` file as a shell with no JS replays it: on success the result is
// each batch as `{"ms": ..., "mutations": [...]}`.
KUITO_EXPORT(replay) bool kuitoReplay(const std::uint8_t* bytes, std::uint32_t length) {
  return guarded([&] {
    const auto batches = kuito::replayBatches(std::string(reinterpret_cast<const char*>(bytes), length));
    result += '[';
    for (std::size_t i = 0; i < batches.size(); ++i) {
      if (i) result += ',';
      result += "{\"ms\":";
      number(result, batches[i].ms);
      result += ",\"mutations\":";
      mutations(result, batches[i].mutations);
      result += '}';
    }
    result += ']';
  });
}

} // extern "C"
