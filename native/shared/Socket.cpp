#include "Socket.h"
#include "JSIHelpers.h"
#include "Standard.h"
#include "Utf8.h"

#include <jsi/jsi.h>
#include <utility>

namespace kuito {
namespace {
int socketId(jsi::Runtime& rt, const jsi::Value& value) {
  if (!value.isNumber() || value.asNumber() < 1 || value.asNumber() > 2147483647.0)
    throw jsi::JSError(rt, "WebSocket ids are positive whole numbers");
  return static_cast<int>(value.asNumber());
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

jsi::String utf8String(jsi::Runtime& rt, const std::uint8_t* bytes, size_t length) {
  auto text = decodeUtf8(bytes, length);
  return jsi::String::createFromUtf16(rt, text.data(), text.size());
}

jsi::String utf8String(jsi::Runtime& rt, const std::string& text) {
  return utf8String(rt, reinterpret_cast<const std::uint8_t*>(text.data()), text.size());
}
} // namespace

void installSockets(jsi::Runtime& rt, SocketHost& sockets) {
  jsi::Object object(rt);
  object.setProperty(
      rt, "open", hostFunction(rt, "open", 3, [&sockets](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
        if (count != 3 || !args[1].isString() || !args[2].isObject() || !args[2].getObject(rt).isArray(rt))
          throw jsi::JSError(rt, "socket.open expects (id, url, protocols)");
        auto list = args[2].getObject(rt).getArray(rt);
        std::vector<std::string> protocols;
        for (size_t at = 0; at < list.size(rt); ++at) {
          auto name = list.getValueAtIndex(rt, at);
          if (!name.isString()) throw jsi::JSError(rt, "WebSocket protocols are strings");
          protocols.push_back(name.getString(rt).utf8(rt));
        }
        sockets.open(socketId(rt, args[0]), args[1].getString(rt).utf8(rt), std::move(protocols));
      }));
  object.setProperty(rt, "send",
                     hostFunction(rt, "send", 2, [&sockets](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
                       if (count != 2) throw jsi::JSError(rt, "socket.send expects (id, data)");
                       SocketMessage message;
                       message.binary = !args[1].isString();
                       message.bytes = bodyBytes(rt, args[1], "A WebSocket message");
                       sockets.send(socketId(rt, args[0]), std::move(message));
                     }));
  object.setProperty(
      rt, "close", hostFunction(rt, "close", 3, [&sockets](jsi::Runtime& rt, const jsi::Value* args, size_t count) {
        if (count != 3 || !args[1].isNumber() || !args[2].isString())
          throw jsi::JSError(rt, "socket.close expects (id, code, reason)");
        sockets.close(socketId(rt, args[0]), static_cast<int>(args[1].asNumber()), args[2].getString(rt).utf8(rt));
      }));
  rt.global().setProperty(rt, "__kuitoHostSocket", std::move(object));
}

void deliverSocketOpen(jsi::Runtime& rt, int id, const std::string& protocol) {
  rt.global().getPropertyAsFunction(rt, "__kuitoSocketOpen").call(rt, id, utf8String(rt, protocol));
}

void deliverSocketMessage(jsi::Runtime& rt, int id, SocketMessage message) {
  auto fn = rt.global().getPropertyAsFunction(rt, "__kuitoSocketMessage");
  if (message.binary) fn.call(rt, id, ownedArrayBuffer(rt, std::move(message.bytes)));
  else fn.call(rt, id, utf8String(rt, message.bytes.data(), message.bytes.size()));
}

void deliverSocketError(jsi::Runtime& rt, int id, const std::string& message) {
  rt.global().getPropertyAsFunction(rt, "__kuitoSocketError").call(rt, id, utf8String(rt, message));
}

void deliverSocketClose(jsi::Runtime& rt, int id, int code, const std::string& reason, bool wasClean) {
  rt.global().getPropertyAsFunction(rt, "__kuitoSocketClose").call(rt, id, code, utf8String(rt, reason), wasClean);
}

} // namespace kuito
