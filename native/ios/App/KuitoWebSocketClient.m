#import "KuitoWebSocketClient.h"

/// The close the app asked for, which a task cancelled by us reports.
@interface KuitoSocket : NSObject
@property (nonatomic) int socketId;
@property (nonatomic, strong) NSURLSessionWebSocketTask *task;
@property (nonatomic) int closeCode;
@property (nonatomic, copy) NSString *closeReason;
@end

@implementation KuitoSocket
@end

@interface KuitoWebSocketClient () <NSURLSessionWebSocketDelegate>
@end

@implementation KuitoWebSocketClient {
  __weak id<KuitoWebSocketSink> _sink;
  /// Serial: every delegate call and every table access runs here.
  NSOperationQueue *_queue;
  NSURLSession *_session;
  NSMutableDictionary<NSNumber *, KuitoSocket *> *_sockets;
  NSMutableDictionary<NSNumber *, KuitoSocket *> *_byTask;
}

- (instancetype)initWithSink:(id<KuitoWebSocketSink>)sink {
  self = [super init];
  if (!self) return nil;
  _sink = sink;
  _queue = [NSOperationQueue new];
  _queue.maxConcurrentOperationCount = 1;
  _queue.name = @"dev.kuito.websocket";
  _sockets = [NSMutableDictionary new];
  _byTask = [NSMutableDictionary new];
  NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.ephemeralSessionConfiguration;
  configuration.HTTPCookieStorage = nil;
  configuration.HTTPShouldSetCookies = NO;
  // The session retains its delegate until -invalidate.
  _session = [NSURLSession sessionWithConfiguration:configuration delegate:self delegateQueue:_queue];
  return self;
}

- (void)open:(int)socketId url:(NSURL *)url protocols:(NSArray<NSString *> *)protocols {
  [_queue addOperationWithBlock:^{
    KuitoSocket *socket = [KuitoSocket new];
    socket.socketId = socketId;
    socket.task = [self->_session webSocketTaskWithURL:url protocols:protocols];
    self->_sockets[@(socketId)] = socket;
    self->_byTask[@(socket.task.taskIdentifier)] = socket;
    [socket.task resume];
    [self receive:socket];
  }];
}

- (void)receive:(KuitoSocket *)socket {
  __weak KuitoWebSocketClient *weakSelf = self;
  [socket.task receiveMessageWithCompletionHandler:^(NSURLSessionWebSocketMessage *message, NSError *error) {
    KuitoWebSocketClient *client = weakSelf;
    // A failure ends the task, and URLSession:task:didCompleteWithError: reports it.
    if (!client || error || !message) return;
    [client->_queue addOperationWithBlock:^{
      if (client->_byTask[@(socket.task.taskIdentifier)] != socket) return;
      if (message.type == NSURLSessionWebSocketMessageTypeString)
        [client->_sink socketMessage:socket.socketId text:message.string data:nil];
      else [client->_sink socketMessage:socket.socketId text:nil data:message.data];
      [client receive:socket];
    }];
  }];
}

- (void)send:(int)socketId text:(NSString *)text data:(NSData *)data {
  [_queue addOperationWithBlock:^{
    KuitoSocket *socket = self->_sockets[@(socketId)];
    if (!socket) return;
    NSURLSessionWebSocketMessage *message = text ? [[NSURLSessionWebSocketMessage alloc] initWithString:text]
                                                 : [[NSURLSessionWebSocketMessage alloc] initWithData:data ?: [NSData data]];
    // A failed send ends the task, which reports it.
    [socket.task sendMessage:message completionHandler:^(NSError *error) {}];
  }];
}

- (void)close:(int)socketId code:(int)code reason:(NSString *)reason {
  [_queue addOperationWithBlock:^{
    KuitoSocket *socket = self->_sockets[@(socketId)];
    if (!socket || socket.closeCode) return;
    socket.closeCode = code;
    socket.closeReason = reason;
    [socket.task cancelWithCloseCode:(NSURLSessionWebSocketCloseCode)code
                              reason:[reason dataUsingEncoding:NSUTF8StringEncoding]];
  }];
}

- (void)invalidate {
  _sink = nil;
  [_session invalidateAndCancel];
}

- (void)URLSession:(NSURLSession *)session
          webSocketTask:(NSURLSessionWebSocketTask *)webSocketTask
    didOpenWithProtocol:(NSString *)protocol {
  KuitoSocket *socket = _byTask[@(webSocketTask.taskIdentifier)];
  if (socket) [_sink socketOpen:socket.socketId protocol:protocol ?: @""];
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  KuitoSocket *socket = _byTask[@(task.taskIdentifier)];
  if (!socket) return;
  [_byTask removeObjectForKey:@(task.taskIdentifier)];
  [_sockets removeObjectForKey:@(socket.socketId)];
  NSURLSessionWebSocketTask *webSocket = socket.task;
  int code = (int)webSocket.closeCode;
  NSString *reason = webSocket.closeReason ? [[NSString alloc] initWithData:webSocket.closeReason
                                                                     encoding:NSUTF8StringEncoding]
                                           : nil;
  // A close the app started reports its own code; otherwise the connection
  // ended without a close frame (1006).
  if (code == NSURLSessionWebSocketCloseCodeInvalid && socket.closeCode) {
    code = socket.closeCode;
    reason = socket.closeReason;
  }
  BOOL clean = code != NSURLSessionWebSocketCloseCodeInvalid;
  if (!clean) {
    code = 1006;
    [_sink socketError:socket.socketId message:error.localizedDescription ?: @"The connection closed abnormally"];
  }
  [_sink socketClose:socket.socketId code:code reason:reason ?: @"" clean:clean];
}

@end
