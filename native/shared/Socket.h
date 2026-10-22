#pragma once
// The WebSocket host (docs/web-apis.md#websocket): `__kuitoHostSocket` opens,
// sends on and closes the platform's web socket by id; the platform answers
// with open, messages, an error and a close.
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace facebook {
namespace jsi {
class Runtime;
}
} // namespace facebook

namespace kuito {

/// A text message's UTF-8, or a binary message's bytes.
struct SocketMessage {
  bool binary = false;
  std::vector<std::uint8_t> bytes;
};

/// The platform's client. Calls come from the VM thread and return at once;
/// the client answers through Runtime::socketOpen, socketMessage,
/// socketError and socketClose on the VM thread, and ends every socket with
/// exactly one socketClose.
struct SocketHost {
  std::function<void(int id, std::string url, std::vector<std::string> protocols)> open;
  std::function<void(int id, SocketMessage message)> send;
  std::function<void(int id, int code, std::string reason)> close;

  explicit operator bool() const { return open && send && close; }
};

void installSockets(facebook::jsi::Runtime& rt, SocketHost& sockets);
void deliverSocketOpen(facebook::jsi::Runtime& rt, int id, const std::string& protocol);
void deliverSocketMessage(facebook::jsi::Runtime& rt, int id, SocketMessage message);
void deliverSocketError(facebook::jsi::Runtime& rt, int id, const std::string& message);
void deliverSocketClose(facebook::jsi::Runtime& rt, int id, int code, const std::string& reason, bool wasClean);

} // namespace kuito
