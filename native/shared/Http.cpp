#include "Http.h"
#include "JSIHelpers.h"
#include "Standard.h"

#include <jsi/jsi.h>
#include <utility>

namespace kuito {
namespace {
int requestId(jsi::Runtime& rt, const jsi::Value& value) {
  if (!value.isNumber() || value.asNumber() < 1 || value.asNumber() > 2147483647.0)
    throw jsi::JSError(rt, "HTTP request ids are positive whole numbers");
  return static_cast<int>(value.asNumber());
}

std::string textProperty(jsi::Runtime& rt, const jsi::Object& object, const char* name) {
  auto value = object.getProperty(rt, name);
  if (!value.isString()) throw jsi::JSError(rt, std::string("An HTTP request's ") + name + " is a string");
  return value.getString(rt).utf8(rt);
}

/// `[name, value, name, value, …]`, as the kernel's Headers flatten them.
HttpHeaders headerPairs(jsi::Runtime& rt, const jsi::Object& request) {
  auto value = request.getProperty(rt, "headers");
  if (!value.isObject() || !value.getObject(rt).isArray(rt))
    throw jsi::JSError(rt, "An HTTP request's headers are [name, value, …]");
  auto flat = value.getObject(rt).getArray(rt);
  auto size = flat.size(rt);
  if (size % 2) throw jsi::JSError(rt, "An HTTP request's headers come in name/value pairs");
  HttpHeaders headers;
  headers.reserve(size / 2);
  for (size_t at = 0; at < size; at += 2) {
    auto name = flat.getValueAtIndex(rt, at), text = flat.getValueAtIndex(rt, at + 1);
    if (!name.isString() || !text.isString()) throw jsi::JSError(rt, "HTTP header names and values are strings");
    headers.emplace_back(name.getString(rt).utf8(rt), text.getString(rt).utf8(rt));
  }
  return headers;
}

std::vector<std::uint8_t> bytesProperty(jsi::Runtime& rt, const jsi::Object& object, const char* name) {
  auto value = object.getProperty(rt, name);
  if (value.isUndefined()) return {};
  if (!value.isObject() || !value.getObject(rt).isArrayBuffer(rt))
    throw jsi::JSError(rt, std::string("A file body's ") + name + " is an ArrayBuffer");
  return bodyBytes(rt, value, name);
}

/// A string, an ArrayBuffer, or `{ file, prefix?, suffix? }` streamed from a file.
void readBody(jsi::Runtime& rt, const jsi::Value& value, HttpRequest& request) {
  if (value.isUndefined()) return;
  if (value.isObject() && !value.getObject(rt).isArrayBuffer(rt)) {
    auto body = value.getObject(rt);
    request.bodyFile = textProperty(rt, body, "file");
    request.body = bytesProperty(rt, body, "prefix");
    request.bodySuffix = bytesProperty(rt, body, "suffix");
    return;
  }
  request.body = bodyBytes(rt, value, "An HTTP body");
}

HttpProgress progressOf(jsi::Runtime& rt, const jsi::Object& request) {
  auto value = request.getProperty(rt, "progress");
  if (value.isUndefined()) return HttpProgress::None;
  auto text = value.isString() ? value.getString(rt).utf8(rt) : "";
  if (text == "send") return HttpProgress::Send;
  if (text == "receive") return HttpProgress::Receive;
  throw jsi::JSError(rt, "An HTTP request's progress is 'send' or 'receive'");
}

jsi::Function hostFunction(jsi::Runtime& rt, const char* name, unsigned argCount,
                           std::function<void(jsi::Runtime&, const jsi::Value*, size_t)> callback) {
  return jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, name), argCount,
      [callback = std::move(callback)](jsi::Runtime& runtime, const jsi::Value&, const jsi::Value* args,
                                       size_t count) -> jsi::Value {
        try {
          callback(runtime, args, count);
        } catch (const jsi::JSIException&) { throw; } catch (const std::exception& error) {
          throw jsi::JSError(runtime, error.what());
        }
        return jsi::Value::undefined();
      });
}
} // namespace

void installHttp(jsi::Runtime& rt, HttpHost& http) {
  jsi::Object object(rt);
  object.setProperty(rt, "start",
                     hostFunction(rt, "start", 3, [&http](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
                       if (count != 3 || !args[1].isObject())
                         throw jsi::JSError(rt, "http.start expects (id, { url, method, headers }, body)");
                       auto id = requestId(rt, args[0]);
                       auto description = args[1].getObject(rt);
                       HttpRequest request;
                       request.url = textProperty(rt, description, "url");
                       request.method = textProperty(rt, description, "method");
                       request.headers = headerPairs(rt, description);
                       if (description.hasProperty(rt, "saveTo"))
                         request.saveTo = textProperty(rt, description, "saveTo");
                       request.progress = progressOf(rt, description);
                       readBody(rt, args[2], request);
                       http.start(id, std::move(request));
                     }));
  object.setProperty(rt, "stream",
                     hostFunction(rt, "stream", 1, [&http](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
                       if (count != 1) throw jsi::JSError(rt, "http.stream expects (id)");
                       http.stream(requestId(rt, args[0]));
                     }));
  object.setProperty(rt, "cancel",
                     hostFunction(rt, "cancel", 1, [&http](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
                       if (count != 1) throw jsi::JSError(rt, "http.cancel expects (id)");
                       http.cancel(requestId(rt, args[0]));
                     }));
  rt.global().setProperty(rt, "__kuitoHostHttp", std::move(object));
}

void deliverHttpHead(jsi::Runtime& rt, int id, int status, const std::string& url, const HttpHeaders& headers) {
  auto flat = jsi::Array(rt, headers.size() * 2);
  size_t at = 0;
  for (const auto& [name, value] : headers) {
    flat.setValueAtIndex(rt, at++, jsi::String::createFromUtf8(rt, name));
    flat.setValueAtIndex(rt, at++, jsi::String::createFromUtf8(rt, value));
  }
  rt.global()
      .getPropertyAsFunction(rt, "__kuitoHttpHead")
      .call(rt, id, status, jsi::String::createFromUtf8(rt, url), std::move(flat));
}

void deliverHttpChunk(jsi::Runtime& rt, int id, std::vector<std::uint8_t> chunk) {
  rt.global().getPropertyAsFunction(rt, "__kuitoHttpChunk").call(rt, id, ownedArrayBuffer(rt, std::move(chunk)));
}

void deliverHttpProgress(jsi::Runtime& rt, int id, double bytes, double total) {
  rt.global().getPropertyAsFunction(rt, "__kuitoHttpProgress").call(rt, id, bytes, total);
}

void deliverHttpEnd(jsi::Runtime& rt, int id, std::vector<std::uint8_t> body, const std::string& error) {
  rt.global()
      .getPropertyAsFunction(rt, "__kuitoHttpEnd")
      .call(rt, id, ownedArrayBuffer(rt, std::move(body)), jsi::String::createFromUtf8(rt, error));
}

} // namespace kuito
