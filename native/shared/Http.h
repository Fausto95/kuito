#pragma once
// The HTTP host (docs/web-apis.md#fetch): `__kuitoHostHttp` hands requests to
// the platform's client, which answers with a head, then the body, whole at
// the end or as chunks once the kernel asks to stream it.
#include <cstdint>
#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace facebook {
namespace jsi {
class Runtime;
}
} // namespace facebook

namespace kuito {

using HttpHeaders = std::vector<std::pair<std::string, std::string>>;

/// Which bytes `Runtime::httpProgress` counts, if any.
enum class HttpProgress { None, Send, Receive };

struct HttpRequest {
  std::string url;
  std::string method;
  HttpHeaders headers;
  /// The body; with `bodyFile`, the bytes sent before the file.
  std::vector<std::uint8_t> body;
  /// A file URI whose contents follow `body`, then `bodySuffix`. Empty for none.
  std::string bodyFile;
  std::vector<std::uint8_t> bodySuffix;
  /// A file URI the body is written to instead of returned, replacing it
  /// once a 2xx body has fully arrived; on any other end nothing is written.
  std::string saveTo;
  HttpProgress progress = HttpProgress::None;
};

/// The platform's client. Each call comes from the VM thread and returns at
/// once; the client answers through Runtime::httpHead, httpChunk and httpEnd,
/// in that order, on the VM thread, with Runtime::httpProgress between them
/// when asked, at most every 100 ms and always at the last byte. After
/// `cancel` it may still answer: the kernel ignores a request it forgot.
struct HttpHost {
  std::function<void(int id, HttpRequest request)> start;
  /// From now on, send the body as chunks: what is buffered first, then each
  /// piece as it arrives, ending with an empty body.
  std::function<void(int id)> stream;
  std::function<void(int id)> cancel;

  explicit operator bool() const { return start && stream && cancel; }
};

void installHttp(facebook::jsi::Runtime& rt, HttpHost& http);
void deliverHttpHead(facebook::jsi::Runtime& rt, int id, int status, const std::string& url,
                     const HttpHeaders& headers);
void deliverHttpChunk(facebook::jsi::Runtime& rt, int id, std::vector<std::uint8_t> chunk);
void deliverHttpProgress(facebook::jsi::Runtime& rt, int id, double bytes, double total);
void deliverHttpEnd(facebook::jsi::Runtime& rt, int id, std::vector<std::uint8_t> body, const std::string& error);

} // namespace kuito
