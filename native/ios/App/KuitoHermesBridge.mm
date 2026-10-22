#import "KuitoHermesBridge.h"
#import "../Renderer/KuitoMutationBatch+Mutations.h"
#import "KuitoHTTPClient.h"
#import "KuitoJSThread.h"
#import "KuitoWebSocketClient.h"
#include "../../shared/FrameClock.h"
#include "../../shared/FrameHandoff.h"
#include "../../shared/EventRecord.h"
#include "../../shared/KuitoRuntime.h"
#include "../../shared/UIRuntime.h"
#include "../../shared/WireWork.h"
#include "../../shared/Link.h"
#include "../../shared/Inspector.h"
#import <QuartzCore/QuartzCore.h>
#include <os/signpost.h>
#include <memory>
#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <vector>

NSString *const KuitoStackKey = @"KuitoStack";

static NSString *KuitoString(const std::string& value) {
  return [NSString stringWithUTF8String:value.c_str()] ?: @"";
}

static std::string KuitoStdString(NSString *text) {
  return std::string(text.UTF8String ?: "", [text lengthOfBytesUsingEncoding:NSUTF8StringEncoding]);
}

/// A renderer's event record, copied: the renderer reuses its own for the next
/// event. Throws std::invalid_argument for one that does not fill its layout.
static kuito::EventRecord KuitoCopyRecord(int32_t layout, const double *numbers, NSInteger count,
                                            NSArray<NSString *> *strings, NSString *json) {
  kuito::EventRecord record;
  if (json) {
    record = kuito::jsonRecord(KuitoStdString(json));
  } else {
    record.layout = layout;
    if (numbers && count > 0) record.numbers.assign(numbers, numbers + count);
    record.strings.reserve(strings.count);
    for (NSString *text in strings) record.strings.push_back(KuitoStdString(text));
  }
  kuito::checkRecord(record);
  return record;
}

// An ArrayBuffer's bytes as NSData, which Swift reads as Data: the buffer
// and the data share them, either way, with no copy.
class KuitoDataBytes final : public kuito::LinkBuffer {
public:
  explicit KuitoDataBytes(NSData *data) : data_(data) {}
  // JavaScript may write the ArrayBuffer: the data a module answered with is no longer its own.
  std::uint8_t *data() override { return static_cast<std::uint8_t *>(const_cast<void *>(data_.bytes)); }
  std::size_t size() const override { return data_.length; }
  NSData *object() const { return data_; }

private:
  NSData *data_;
};

static NSData *KuitoData(const std::shared_ptr<kuito::LinkBuffer>& bytes) {
  if (auto data = std::dynamic_pointer_cast<KuitoDataBytes>(bytes)) return data->object();
  // The block holds the bytes; the data releases it with itself.
  std::shared_ptr<kuito::LinkBuffer> held = bytes;
  return [[NSData alloc] initWithBytesNoCopy:bytes->data() length:bytes->size() deallocator:^(void *, NSUInteger) {
    (void)held;
  }];
}

// Link values (native/shared/Link.h) as the Swift linker reads them: NSNull,
// NSNumber, NSString, NSData, NSArray (a list, or a struct's fields in order)
// and NSDictionary (entries).
static id KuitoLinkObject(const kuito::LinkValue& value) {
  switch (value.kind) {
  case kuito::LinkValue::Kind::Null: return NSNull.null;
  case kuito::LinkValue::Kind::Boolean: return @(value.flag);
  case kuito::LinkValue::Kind::Number: return @(value.number);
  case kuito::LinkValue::Kind::Text: return KuitoString(value.text);
  case kuito::LinkValue::Kind::Bytes: return KuitoData(value.bytes);
  case kuito::LinkValue::Kind::List: {
    NSMutableArray *items = [NSMutableArray arrayWithCapacity:value.items.size()];
    for (const auto& item : value.items) [items addObject:KuitoLinkObject(item)];
    return items;
  }
  case kuito::LinkValue::Kind::Entries: {
    NSMutableDictionary *entries = [NSMutableDictionary dictionaryWithCapacity:value.items.size()];
    for (size_t i = 0; i < value.items.size(); ++i) entries[KuitoString(value.keys[i])] = KuitoLinkObject(value.items[i]);
    return entries;
  }
  }
  return NSNull.null;
}

static NSArray *KuitoLinkObjects(const std::vector<kuito::LinkValue>& values) {
  NSMutableArray *objects = [NSMutableArray arrayWithCapacity:values.size()];
  for (const auto& value : values) [objects addObject:KuitoLinkObject(value)];
  return objects;
}

// KuitoReply.crossing let only these through.
static kuito::LinkValue KuitoLinkValue(id object) {
  if (!object || object == NSNull.null) return {};
  if ([object isKindOfClass:NSNumber.class]) {
    NSNumber *number = object;
    if (CFGetTypeID((__bridge CFTypeRef)number) == CFBooleanGetTypeID()) return kuito::LinkValue::boolean(number.boolValue);
    return kuito::LinkValue::numeric(number.doubleValue);
  }
  if ([object isKindOfClass:NSString.class]) return kuito::LinkValue::string([object UTF8String]);
  // A copy of mutable data, which could grow under the ArrayBuffer; free for immutable data.
  if ([object isKindOfClass:NSData.class])
    return kuito::LinkValue::buffer(std::make_shared<KuitoDataBytes>([object copy]));
  if ([object isKindOfClass:NSArray.class]) {
    std::vector<kuito::LinkValue> items;
    items.reserve([object count]);
    for (id item in (NSArray *)object) items.push_back(KuitoLinkValue(item));
    return kuito::LinkValue::list(std::move(items));
  }
  if ([object isKindOfClass:NSDictionary.class]) {
    std::vector<std::string> keys;
    std::vector<kuito::LinkValue> items;
    for (id key in (NSDictionary *)object) {
      if (![key isKindOfClass:NSString.class]) break;
      keys.emplace_back([key UTF8String]);
      items.push_back(KuitoLinkValue(((NSDictionary *)object)[key]));
    }
    if (keys.size() == [object count]) return kuito::LinkValue::entries(std::move(keys), std::move(items));
  }
  throw kuito::LinkMismatch("ERR_ENCODE", "the result is not plain data");
}

static kuito::LinkResult KuitoLinkResult(id object) {
  if ([object isKindOfClass:KuitoLinkFailure.class]) {
    KuitoLinkFailure *failure = object;
    return kuito::LinkFailure{failure.code.UTF8String, failure.message.UTF8String};
  }
  return KuitoLinkValue(object);
}

static std::string KuitoLinkSignature(id<KuitoLinkHost> link, int member) {
  NSString *signature = [link signature:member];
  return signature ? std::string(signature.UTF8String) : std::string();
}

/// A file URI the HTTP host reads or writes; nil when empty. FileSystem's
/// sandbox resolved it before it crossed (src/native/file-system.ts).
static NSURL *KuitoFileURL(const std::string& uri) {
  if (uri.empty()) return nil;
  NSURL *url = [NSURL URLWithString:KuitoString(uri)];
  if (!url.isFileURL) throw std::runtime_error("A transfer's file is a file:// URI, not " + uri);
  return url;
}

static NSError *KuitoError(const std::exception& error) {
  return [NSError errorWithDomain:@"dev.kuito.hermes" code:1
                        userInfo:@{NSLocalizedDescriptionKey: @(error.what())}];
}

static NSError *KuitoScriptError(const kuito::ScriptError& error) {
  return [NSError errorWithDomain:@"dev.kuito.hermes" code:3
                        userInfo:@{NSLocalizedDescriptionKey: @(error.what()),
                                   KuitoStackKey: KuitoString(error.stack)}];
}

/// CADisplayLink retains its target; this one holds the bridge weakly.
@interface KuitoFrameTarget : NSObject
@property (nonatomic, weak) KuitoHermesBridge *bridge;
@end

@interface KuitoHermesBridge () <KuitoHTTPSink, KuitoWebSocketSink>
- (void)frame:(CADisplayLink *)link;
- (void)requestFrame;
@end

@implementation KuitoFrameTarget
- (void)tick:(CADisplayLink *)link { [self.bridge frame:link]; }
@end

/// The UI thread's share of a display frame for the JS thread's batches
/// (docs/native-scheduling.md): at least one batch runs whatever it costs.
static const double KuitoFrameBudgetMs = 4.0;

/// Launched with `KUITO_COMMIT_LOG=1`: frames log a `KuitoCommitFrames`
/// gauge at most once a second for scripts/benchmark-commits.ts.
static const bool KuitoFrameGauge = getenv("KUITO_COMMIT_LOG") && strcmp(getenv("KUITO_COMMIT_LOG"), "1") == 0;

namespace {
/// `Kuito evaluate` in KuitoTrace.swift's Points of Interest, for as long as it lives.
/// A chunk the script loads names its URL as the detail; the script's own has none.
struct EvaluateInterval {
  os_log_t log = Log();
  os_signpost_id_t id = os_signpost_id_generate(log);
  explicit EvaluateInterval(const char *url = "") {
    os_signpost_interval_begin(log, id, "Kuito evaluate", "%{public}s", url);
  }
  ~EvaluateInterval() { os_signpost_interval_end(log, id, "Kuito evaluate"); }
  static os_log_t Log() {
    static os_log_t log = os_log_create("dev.kuito.shell", OS_LOG_CATEGORY_POINTS_OF_INTEREST);
    return log;
  }
};
}

@implementation KuitoHermesBridge {
  KuitoJSThread *_js;
  std::unique_ptr<kuito::Runtime> _runtime;
  std::shared_ptr<kuito::MotionMirror> _mirror;
  /// The JS thread's batches, waiting for a frame.
  std::shared_ptr<kuito::FrameHandoff> _handoff;
  /// Main thread only.
  std::unique_ptr<kuito::UIRuntime> _ui;
  /// The one display link: paused unless batches wait or the UI runtime animates.
  CADisplayLink *_frames;
  CFTimeInterval _gaugedAt;
  NSMutableSet<NSNumber *> *_timerIds;
  KuitoHTTPClient *_http;
  KuitoWebSocketClient *_sockets;
  id<KuitoLinkHost> _link;
  NSError *_startupError;
  std::atomic_bool _closed;
  /// Null unless this build has the inspector and the shell attached one.
  std::shared_ptr<kuito::InspectorDevice> _inspector;
}

+ (KuitoWireWork)wireWork {
  const auto& work = kuito::wireWork();
  return {work.frames.load(), work.jsonParses.load(), work.bytesStringified.load()};
}

- (instancetype)initWithLink:(id<KuitoLinkHost>)link
                   inspector:(KuitoInspector *)inspector
                     modules:(NSURL *)modules
                       error:(NSError **)error {
  self = [super init];
  if (!self) return nil;
  _closed.store(false);
#if KUITO_INSPECTOR
  _inspector = inspector.device;
#endif
  _link = link;
  _mirror = std::make_shared<kuito::MotionMirror>();
  _handoff = std::make_shared<kuito::FrameHandoff>();
  _js = [[KuitoJSThread alloc] initWithName:@"dev.kuito.hermes"];
  _timerIds = [NSMutableSet new];
  _http = [[KuitoHTTPClient alloc] initWithSink:self];
  KuitoHTTPClient *http = _http;
  _sockets = [[KuitoWebSocketClient alloc] initWithSink:self];
  KuitoWebSocketClient *sockets = _sockets;
  __weak KuitoHermesBridge *weakSelf = self;
  NSString *chunks = modules.path;

  // All calls to Runtime, including creation and destruction, are confined to
  // this queue. Public evaluate/event calls enqueue behind construction.
  [_js async:^{
    KuitoHermesBridge *owner = weakSelf;
    if (!owner || owner->_closed) return;
    try {
      kuito::AsyncHost services;
      services.scheduleTimer = [weakSelf](int id, double ms) {
        KuitoHermesBridge *bridge = weakSelf;
        if (!bridge || bridge->_closed) return;
        NSNumber *key = @(id);
        [bridge->_timerIds addObject:key];
        double duration = std::max(0.0, std::min(ms, 2147000000.0));
        [bridge->_js after:duration / 1000.0 async:^{
          KuitoHermesBridge *next = weakSelf;
          if (!next || next->_closed || ![next->_timerIds containsObject:key]) return;
          [next->_timerIds removeObject:key];
          try { next->_runtime->fireTimer(id); }
          catch (const std::exception& e) { [next logFailure:@"Timer" error:e]; }
        }];
      };
      services.cancelTimer = [weakSelf](int id) {
        KuitoHermesBridge *bridge = weakSelf;
        if (bridge) [bridge->_timerIds removeObject:@(id)];
      };
      services.http.start = [weakSelf, http](int id, kuito::HttpRequest request) {
        KuitoHermesBridge *bridge = weakSelf;
        if (!bridge || bridge->_closed) throw std::runtime_error("Kuito host is closed");
        NSURL *url = [NSURL URLWithString:KuitoString(request.url)];
        if (!url || !([url.scheme isEqual:@"http"] || [url.scheme isEqual:@"https"]))
          throw std::runtime_error("fetch takes an http or https URL, not " + request.url);
        NSMutableURLRequest *native = [NSMutableURLRequest requestWithURL:url];
        native.HTTPMethod = KuitoString(request.method);
        for (const auto& [name, value] : request.headers)
          [native setValue:KuitoString(value) forHTTPHeaderField:KuitoString(name)];
        if (!request.body.empty())
          native.HTTPBody = [NSData dataWithBytes:request.body.data() length:request.body.size()];
        KuitoHTTPRequest *described = [KuitoHTTPRequest new];
        described.request = native;
        described.bodyFile = KuitoFileURL(request.bodyFile);
        if (!request.bodySuffix.empty())
          described.suffix = [NSData dataWithBytes:request.bodySuffix.data() length:request.bodySuffix.size()];
        described.saveTo = KuitoFileURL(request.saveTo);
        described.progress = request.progress == kuito::HttpProgress::Send      ? KuitoHTTPProgressSend
                             : request.progress == kuito::HttpProgress::Receive ? KuitoHTTPProgressReceive
                                                                                 : KuitoHTTPProgressNone;
        [http start:id request:described];
      };
      services.http.stream = [http](int id) { [http stream:id]; };
      services.http.cancel = [http](int id) { [http cancel:id]; };
      services.sockets.open = [sockets](int id, std::string address, std::vector<std::string> protocols) {
        NSURL *url = [NSURL URLWithString:KuitoString(address)];
        if (!url) throw std::runtime_error("WebSocket takes a ws or wss URL, not " + address);
        NSMutableArray<NSString *> *names = [NSMutableArray new];
        for (const auto& name : protocols) [names addObject:KuitoString(name)];
        [sockets open:id url:url protocols:names];
      };
      services.sockets.send = [sockets](int id, kuito::SocketMessage message) {
        NSData *bytes = [NSData dataWithBytes:message.bytes.data() length:message.bytes.size()];
        if (message.binary) [sockets send:id text:nil data:bytes];
        else [sockets send:id text:[[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding] data:nil];
      };
      services.sockets.close = [sockets](int id, int code, std::string reason) {
        [sockets close:id code:code reason:KuitoString(reason)];
      };
      [link attachEmitter:^(int32_t member, id value) {
        KuitoHermesBridge *bridge = weakSelf;
        if (!bridge || bridge->_closed) return;
        kuito::LinkResult result;
        try { result = KuitoLinkResult(value); }
        catch (const std::exception& e) { result = kuito::LinkFailure{"ERR_ENCODE", e.what()}; }
        [bridge->_js async:^{
          if (bridge->_closed || !bridge->_runtime) return;
          try {
            if (auto failure = std::get_if<kuito::LinkFailure>(&result)) throw std::runtime_error(failure->message);
            bridge->_runtime->emitLinkEvent(member, std::get<kuito::LinkValue>(result));
          } catch (const std::exception& e) { [bridge logFailure:@"Native module event" error:e]; }
        }];
      }];
      // A motion value goes straight to the UI runtime, on the main thread.
      [link attachMotionWriter:^(int32_t member, id value) {
        KuitoHermesBridge *bridge = weakSelf;
        if (!bridge || bridge->_closed) return;
        kuito::LinkResult result;
        try { result = KuitoLinkResult(value); }
        catch (const std::exception& e) { result = kuito::LinkFailure{"ERR_ENCODE", e.what()}; }
        auto write = [weakSelf, member, result] {
          KuitoHermesBridge *target = weakSelf;
          if (!target || target->_closed) return;
          if (auto failure = std::get_if<kuito::LinkFailure>(&result)) {
            [target.delegate kuitoDidLog:@"error" message:KuitoString("Native module motion value: " + failure->message) stack:@""];
            return;
          }
          [target uiRuntime]->platform(member, std::get<kuito::LinkValue>(result));
        };
        if (NSThread.isMainThread) write();
        else dispatch_async(dispatch_get_main_queue(), write);
      }];
      services.link.observe = [link](int member, bool observing) {
        [link observe:member observing:observing];
      };
      services.link.signature = [link](int member) { return KuitoLinkSignature(link, member); };
      services.link.call = [link](int function, std::vector<kuito::LinkValue> arguments) {
        return KuitoLinkResult([link call:function arguments:KuitoLinkObjects(arguments)]);
      };
      services.link.callAsync = [weakSelf, link](int function, int call, std::vector<kuito::LinkValue> arguments) {
        [link callAsync:function arguments:KuitoLinkObjects(arguments) settle:^(id result) {
          KuitoHermesBridge *bridge = weakSelf;
          if (!bridge || bridge->_closed) return;
          [bridge->_js async:^{
            if (bridge->_closed || !bridge->_runtime) return;
            kuito::LinkResult settled;
            try { settled = KuitoLinkResult(result); }
            catch (const kuito::LinkMismatch& e) { settled = kuito::LinkFailure{e.code, e.what()}; }
            catch (const std::exception& e) { settled = kuito::LinkFailure{"ERR_NATIVE", e.what()}; }
            try { bridge->_runtime->settleLinkCall(call, settled); }
            catch (const std::exception& e) { [bridge logFailure:@"Native module call" error:e]; }
          }];
        }];
      };
      std::shared_ptr<kuito::MotionMirror> mirror = owner->_mirror;
      services.readMotion = [mirror](const std::string& id) { return mirror->read(id); };
      services.readMotionNumber = [mirror](const std::string& id, double version) {
        return mirror->readNumber(id, version);
      };
      std::shared_ptr<kuito::FrameHandoff> handoff = owner->_handoff;
      services.busy = [handoff]() { return handoff->busy(); };
      // Each chunk of the app is <name>.hbc in `modules` (src/cli/device-assets.ts).
      services.loadChunk = [chunks](const std::string& name) {
        // A chunk is a name, never a path: nothing outside `modules` loads, signed or not.
        static NSRegularExpression *chunkName =
            [NSRegularExpression regularExpressionWithPattern:@"^[A-Za-z0-9_-][A-Za-z0-9._-]*$" options:0 error:nil];
        NSString *named = KuitoString(name);
        if ([chunkName numberOfMatchesInString:named options:0 range:NSMakeRange(0, named.length)] != 1) return std::string();
        NSString *path = [chunks stringByAppendingPathComponent:[named stringByAppendingPathExtension:@"hbc"]];
        NSData *data = [NSData dataWithContentsOfFile:path];
        return data ? std::string(static_cast<const char *>(data.bytes), data.length) : std::string();
      };
      services.traceEvaluate = [](const std::string& url, const std::function<void()>& evaluate) {
        EvaluateInterval traced(url.c_str());
        evaluate();
      };
      services.inspector = owner->_inspector;
      services.wakeInspector = [weakSelf]() {
        KuitoHermesBridge *bridge = weakSelf;
        if (!bridge || bridge->_closed) return;
        [bridge->_js async:^{
          if (bridge->_closed || !bridge->_runtime) return;
          try { bridge->_runtime->inspect(); }
          catch (const std::exception& e) { [bridge logFailure:@"Debugger" error:e]; }
        }];
      };
#if KUITO_INSPECTOR
      services.record = true;
#endif
      services.log = [weakSelf](const std::string& level, const std::string& message,
                                const std::string& stack) {
        NSString *levelText = KuitoString(level);
        NSString *messageText = KuitoString(message);
        NSString *stackText = KuitoString(stack);
        dispatch_async(dispatch_get_main_queue(), ^{
          KuitoHermesBridge *bridge = weakSelf;
          if (bridge && !bridge->_closed)
            [bridge.delegate kuitoDidLog:levelText message:messageText stack:stackText];
        });
      };
      owner->_runtime = std::make_unique<kuito::Runtime>(
        [weakSelf, handoff](std::vector<kuito::Mutation> changes, std::size_t hostCalls, kuito::JobCause job) {
          const kuito::EffectSummary effects = kuito::summarize(changes);
          if (!handoff->push({std::move(changes), CACurrentMediaTime(), hostCalls, std::move(job), effects})) return;
          dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf requestFrame]; });
        }, std::move(services));
    } catch (const std::exception& e) {
      owner->_startupError = KuitoError(e);
    }
  }];
  return self;
}

/// A host failure outside JavaScript, shown where console errors are.
/// Runs `work` on the JS thread while this bridge still has its runtime.
- (void)onRuntime:(NSString *)what work:(void (^)(kuito::Runtime &runtime))work {
  __weak KuitoHermesBridge *weakSelf = self;
  [_js async:^{
    KuitoHermesBridge *bridge = weakSelf;
    if (!bridge || bridge->_closed || !bridge->_runtime) return;
    try { work(*bridge->_runtime); }
    catch (const std::exception& e) { [bridge logFailure:what error:e]; }
  }];
}

- (void)httpHead:(int)requestId status:(int)status url:(NSString *)url headers:(NSArray<NSString *> *)headers {
  kuito::HttpHeaders pairs;
  for (NSUInteger at = 0; at + 1 < headers.count; at += 2)
    pairs.emplace_back(headers[at].UTF8String, headers[at + 1].UTF8String);
  std::string address = url.UTF8String;
  [self onRuntime:@"fetch" work:^(kuito::Runtime &runtime) {
    runtime.httpHead(requestId, status, address, pairs);
  }];
}

- (void)httpChunk:(int)requestId data:(NSData *)data {
  [self onRuntime:@"fetch" work:^(kuito::Runtime &runtime) {
    auto bytes = static_cast<const std::uint8_t *>(data.bytes);
    runtime.httpChunk(requestId, std::vector<std::uint8_t>(bytes, bytes + data.length));
  }];
}

- (void)httpProgress:(int)requestId bytes:(double)bytes total:(double)total {
  [self onRuntime:@"fetch" work:^(kuito::Runtime &runtime) { runtime.httpProgress(requestId, bytes, total); }];
}

- (void)httpEnd:(int)requestId body:(NSData *)body error:(NSString *)error {
  std::string failure = error.UTF8String;
  [self onRuntime:@"fetch" work:^(kuito::Runtime &runtime) {
    auto bytes = static_cast<const std::uint8_t *>(body.bytes);
    runtime.httpEnd(requestId, std::vector<std::uint8_t>(bytes, bytes + body.length), failure);
  }];
}

- (void)socketOpen:(int)socketId protocol:(NSString *)protocol {
  std::string chosen = protocol.UTF8String;
  [self onRuntime:@"WebSocket" work:^(kuito::Runtime &runtime) { runtime.socketOpen(socketId, chosen); }];
}

- (void)socketMessage:(int)socketId text:(NSString *)text data:(NSData *)data {
  NSData *bytes = text ? [text dataUsingEncoding:NSUTF8StringEncoding] : data;
  BOOL binary = text == nil;
  [self onRuntime:@"WebSocket" work:^(kuito::Runtime &runtime) {
    auto start = static_cast<const std::uint8_t *>(bytes.bytes);
    runtime.socketMessage(socketId, {static_cast<bool>(binary), std::vector<std::uint8_t>(start, start + bytes.length)});
  }];
}

- (void)socketError:(int)socketId message:(NSString *)message {
  std::string text = message.UTF8String;
  [self onRuntime:@"WebSocket" work:^(kuito::Runtime &runtime) { runtime.socketError(socketId, text); }];
}

- (void)socketClose:(int)socketId code:(int)code reason:(NSString *)reason clean:(BOOL)clean {
  std::string text = reason.UTF8String;
  [self onRuntime:@"WebSocket" work:^(kuito::Runtime &runtime) {
    runtime.socketClose(socketId, code, text, clean);
  }];
}

- (void)logFailure:(NSString *)what error:(const std::exception&)error {
  NSString *message = [NSString stringWithFormat:@"%@ failed: %s", what, error.what()];
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self->_closed) [self.delegate kuitoDidLog:@"error" message:message stack:@""];
  });
}

- (void)evaluateScript:(NSData *)script sourceURL:(NSString *)url
            completion:(void (^)(NSError * _Nullable))completion {
  [_js async:^{
    if (self->_closed) return;
    NSError *failure = self->_startupError;
    if (!failure) {
      try {
        if (!self->_runtime) throw std::runtime_error("Hermes failed to initialize");
        EvaluateInterval traced;
        self->_runtime->evaluate(std::string(static_cast<const char *>(script.bytes), script.length),
                                 url.UTF8String ?: "kuito://app");
      } catch (const kuito::ScriptError& e) { failure = KuitoScriptError(e); }
      catch (const std::exception& e) { failure = KuitoError(e); }
    }
    [self complete:completion failure:failure];
  }];
}

/// A press or a change from the main thread waits a few milliseconds for its
/// job: one that ends in time has its batch applied now, in the frame the
/// touch landed in (docs/native-scheduling.md#input).
- (void)dispatchEvent:(uint32_t)handle
                event:(NSString *)event
               layout:(int32_t)layout
              numbers:(const double *)numbers
                count:(NSInteger)count
              strings:(NSArray<NSString *> *)strings
                 json:(NSString *)json
           completion:(void (^)(NSError * _Nullable))completion {
  kuito::EventRecord record;
  try {
    record = KuitoCopyRecord(layout, numbers, count, strings, json);
  } catch (const std::exception& e) {
    [self complete:completion failure:KuitoError(e)];
    return;
  }
  [self dispatchEvent:handle event:event record:std::move(record) completion:completion];
}

- (void)dispatchEvent:(uint32_t)handle
                event:(NSString *)event
               record:(kuito::EventRecord)record
           completion:(void (^)(NSError * _Nullable))completion {
  // Shared, not captured by value: the block is copied to the heap, and its
  // captures with it.
  auto shared = std::make_shared<const kuito::EventRecord>(std::move(record));
  std::shared_ptr<kuito::FrameHandoff> handoff = _handoff;
  const std::uint64_t job = NSThread.isMainThread ? handoff->expectInput(event.UTF8String ?: "") : 0;
  [_js async:^{
    if (self->_closed) return;
    NSError *failure = self->_startupError;
    if (!failure) {
      try {
        if (!self->_runtime) throw std::runtime_error("Hermes failed to initialize");
        self->_runtime->dispatch(handle, event.UTF8String ?: "", *shared);
      } catch (const std::exception& e) { failure = KuitoError(e); }
    }
    if (job) handoff->inputDone(job);
    [self complete:completion failure:failure];
  }];
  if (job && handoff->awaitInput(job) && !_closed) [self uiRuntime]->drain([self frameTime] * 1000.0, KuitoFrameBudgetMs);
}

/// The display link's clock for a drain between its frames: its latest frame
/// at or before now. While the link runs, the frame that follows is never
/// earlier, so the UI kernel's animations never step back.
- (CFTimeInterval)frameTime {
  const CFTimeInterval now = CACurrentMediaTime();
  return _frames ? kuito::latestFrame(now, _frames.timestamp, _frames.duration) : now;
}

/// On the main queue, unless the bridge shut down first: its owner has moved
/// on, and a late "failed" would land on whatever runs after it.
- (void)complete:(void (^)(NSError * _Nullable))completion failure:(NSError *)failure {
  if (!completion) return;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self->_closed) completion(failure);
  });
}

- (kuito::UIRuntime *)uiRuntime {
  if (_ui) return _ui.get();
  __weak KuitoHermesBridge *weakSelf = self;
  kuito::UIHost host;
  id<KuitoLinkHost> link = _link;
  host.linkSignature = [link](int member) { return KuitoLinkSignature(link, member); };
  host.callLinked = [link](int function, std::vector<kuito::LinkValue> arguments) {
    return KuitoLinkResult([link callOnMain:function arguments:KuitoLinkObjects(arguments)]);
  };
  host.applyBatch = [weakSelf](kuito::Batch& batch) {
    KuitoHermesBridge *bridge = weakSelf;
    if (!bridge || bridge->_closed) return;
    [bridge.delegate kuitoApplyBatch:[[KuitoMutationBatch alloc] initWithMutations:std::move(batch.mutations)
                                                                              sentAt:batch.sentAt
                                                                           hostCalls:static_cast<NSInteger>(batch.hostCalls)
                                                                         marksLayout:batch.effects.marksLayout()]];
  };
  host.framesCommitted = [weakSelf]() {
    KuitoHermesBridge *bridge = weakSelf;
    if (bridge && !bridge->_closed) [bridge.delegate kuitoDidCommitFrames];
  };
  host.idle = [weakSelf]() {
    [weakSelf dispatchEvent:0 event:@"host.idle" record:kuito::EventRecord{} completion:^(NSError *error) {
      if (error) [weakSelf.delegate kuitoDidLog:@"error" message:error.localizedDescription stack:@""];
    }];
  };
  host.applyProps = [weakSelf](const std::vector<kuito::Mutation>& changes) {
    KuitoHermesBridge *bridge = weakSelf;
    if (!bridge || bridge->_closed) return;
    [bridge.delegate kuitoUIDidSetProps:[[KuitoMutationBatch alloc] initWithMutations:changes
                                                                                 sentAt:CACurrentMediaTime()
                                                                              hostCalls:0
                                                                            marksLayout:kuito::summarize(changes).marksLayout()]];
  };
  host.sendEvent = [weakSelf](kuito::PlainValue message) {
    [weakSelf dispatchEvent:0 event:@"ui" record:kuito::valueRecord(std::move(message)) completion:^(NSError *error) {
      if (error) [weakSelf.delegate kuitoDidLog:@"error" message:error.localizedDescription stack:@""];
    }];
  };
  host.requestFrame = [weakSelf]() { [weakSelf requestFrame]; };
  host.log = [weakSelf](const std::string& level, const std::string& message, const std::string& stack) {
    [weakSelf.delegate kuitoDidLog:KuitoString(level) message:KuitoString(message) stack:KuitoString(stack)];
  };
  host.inspector = _inspector;
  host.wakeInspector = [weakSelf]() {
    dispatch_async(dispatch_get_main_queue(), ^{
      KuitoHermesBridge *bridge = weakSelf;
      if (bridge && !bridge->_closed && bridge->_ui) bridge->_ui->inspect();
    });
  };
  _ui = std::make_unique<kuito::UIRuntime>(std::move(host), _mirror, _handoff);
  return _ui.get();
}

/// Main thread.
- (void)requestFrame {
  if (_closed) return;
  if (!_frames) {
    KuitoFrameTarget *target = [KuitoFrameTarget new];
    target.bridge = self;
    _frames = [CADisplayLink displayLinkWithTarget:target selector:@selector(tick:)];
    [_frames addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
  }
  _frames.paused = NO;
}

- (void)frame:(CADisplayLink *)link {
  // Paused first: a drain that leaves work, or a UI kernel still animating, asks again.
  link.paused = YES;
  if (_closed) return;
  [self uiRuntime]->drain(link.timestamp * 1000.0, KuitoFrameBudgetMs);
  if (KuitoFrameGauge && link.timestamp - _gaugedAt >= 1) {
    _gaugedAt = link.timestamp;
    const KuitoWireWork work = [KuitoHermesBridge wireWork];
    NSLog(@"KuitoCommitFrames pending=%zu mirror=%zu frames=%llu json=%llu stringified=%llu", _handoff->size(),
          _mirror->size(), work.frames, work.jsonParses, work.bytesStringified);
  }
}

- (BOOL)hasPendingBatches {
  return _handoff->pending();
}

- (void)loadUIKernel:(NSData *)bytecode hash:(NSString *)hash {
  if (_closed) return;
  [self uiRuntime]->load(std::string(static_cast<const char *>(bytecode.bytes), bytecode.length), hash.UTF8String ?: "");
}

- (void)loadUIBundle:(NSData *)bytecode hash:(NSString *)hash sourceURL:(NSString *)url {
  if (_closed) return;
  [self uiRuntime]->loadBundle(std::string(static_cast<const char *>(bytecode.bytes), bytecode.length),
                               hash.UTF8String ?: "", url.UTF8String ?: "kuito://ui");
}

- (void)evaluateUIScript:(NSString *)source sourceURL:(NSString *)url {
  if (_closed) return;
  [self uiRuntime]->evaluate(source.UTF8String ?: "", url.UTF8String ?: "kuito://ui");
}

- (void)receiveUIOperationsAt:(NSInteger)index {
  if (_closed) return;
  [self uiRuntime]->receive(static_cast<std::size_t>(index));
}

- (BOOL)handleUIEvent:(uint32_t)handle
                event:(NSString *)event
               layout:(int32_t)layout
              numbers:(const double *)numbers
                count:(NSInteger)count
              strings:(NSArray<NSString *> *)strings
                 json:(NSString *)json {
  if (_closed || !_ui) return NO;
  kuito::EventRecord record;
  try {
    record = KuitoCopyRecord(layout, numbers, count, strings, json);
  } catch (const std::exception& e) {
    // Malformed, it must reach neither runtime: YES keeps it from the JS thread.
    [self.delegate kuitoDidLog:@"error"
                        message:[NSString stringWithFormat:@"Event %@ of view %u: %@", event, handle, KuitoError(e).localizedDescription]
                          stack:@""];
    return YES;
  }
  return _ui->event(handle, event.UTF8String ?: "", record);
}

- (void)recording:(void (^)(NSData *_Nullable recording, NSError *_Nullable error))completion {
  [_js async:^{
    if (self->_closed) return;
    NSData *data = nil;
    NSError *failure = nil;
    try {
      if (!self->_runtime) throw std::runtime_error("Hermes failed to initialize");
      auto file = self->_runtime->recording();
      data = [NSData dataWithBytes:file.data() length:file.size()];
    } catch (const std::exception& e) {
      failure = KuitoError(e);
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!self->_closed) completion(data, failure);
    });
  }];
}

- (void)shutdown {
  // Closed here, on the main thread, before anything else: batches, logs and
  // completions the JS thread already queued on main check it when they run,
  // and must not reach the delegate's next runtime and view tree.
  if (_closed.exchange(true)) return;
  [_frames invalidate];
  _frames = nil;
  _handoff->clear();
  _ui.reset();
  [_js async:^{
    [self->_timerIds removeAllObjects];
    [self->_http invalidate];
    [self->_sockets invalidate];
    [self->_link invalidate];
    self->_runtime.reset();
    [self->_js stop];
  }];
}

- (void)dealloc {
  [_js stop];
}

@end
