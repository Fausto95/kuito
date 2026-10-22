#import "KuitoInspector.h"

#if KUITO_INSPECTOR
#import <UIKit/UIKit.h>
#include "../../../shared/Inspector.h"
#include <algorithm>
#include <cmath>

@interface KuitoInspector () <NSURLSessionWebSocketDelegate>
@end

@implementation KuitoInspector {
  std::shared_ptr<kuito::InspectorDevice> _device;
  /// Socket callbacks run here, serially; never on the main thread.
  NSOperationQueue *_queue;
  NSURLSession *_session;
  /// Read from any thread to send; written on _queue.
  NSURLSessionWebSocketTask *_socket;
  NSURL *_url;
  NSInteger _attempt;
  BOOL _stopped;
  NSString *_deviceId;
  NSString *_deviceName;
}

+ (NSURLRequest *)devRequestTo:(NSURL *)url {
  // Read once and taken out of the environment, which anything in the process can read.
  static NSString *token;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    token = [NSProcessInfo.processInfo.environment[@"KUITO_DEV_TOKEN"] copy];
    unsetenv("KUITO_DEV_TOKEN");
  });
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  if (token.length) [request setValue:[@"Bearer " stringByAppendingString:token] forHTTPHeaderField:@"Authorization"];
  return request;
}

- (instancetype)init {
  self = [super init];
  if (!self) return nil;
  _queue = [NSOperationQueue new];
  _queue.maxConcurrentOperationCount = 1;
  _queue.name = @"dev.kuito.inspector";
  NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.defaultSessionConfiguration;
  // Sessions idle while nobody debugs; a dead link shows as a failed receive.
  configuration.timeoutIntervalForRequest = 3600;
  _session = [NSURLSession sessionWithConfiguration:configuration delegate:self delegateQueue:_queue];
  _deviceId = UIDevice.currentDevice.identifierForVendor.UUIDString ?: NSUUID.UUID.UUIDString;
  _deviceName = NSProcessInfo.processInfo.environment[@"SIMULATOR_DEVICE_NAME"] ?: UIDevice.currentDevice.name;
  __weak KuitoInspector *weakSelf = self;
  _device = std::make_shared<kuito::InspectorDevice>([weakSelf](const std::string& frame) {
    [weakSelf send:frame];
  });
  return self;
}

- (std::shared_ptr<kuito::InspectorDevice>)device {
  return _device;
}

- (void)connectTo:(NSURL *)server {
  NSURLComponents *components = [NSURLComponents componentsWithURL:server resolvingAgainstBaseURL:NO];
  components.path = @"/inspector/device";
  components.queryItems = @[
    [NSURLQueryItem queryItemWithName:@"device" value:_deviceId],
    [NSURLQueryItem queryItemWithName:@"name" value:_deviceName],
    [NSURLQueryItem queryItemWithName:@"app" value:NSBundle.mainBundle.bundleIdentifier ?: @""],
  ];
  NSURL *url = components.URL;
  [_queue addOperationWithBlock:^{
    self->_url = url;
    self->_stopped = NO;
    self->_attempt = 0;
    [self open];
  }];
}

- (void)stop {
  [_queue addOperationWithBlock:^{
    self->_stopped = YES;
    [self teardown];
    self->_device->closed();
  }];
}

- (void)send:(const std::string&)frame {
  NSURLSessionWebSocketTask *socket;
  @synchronized(self) { socket = _socket; }
  NSString *text = [NSString stringWithUTF8String:frame.c_str()];
  if (!socket || !text) return;
  [socket sendMessage:[[NSURLSessionWebSocketMessage alloc] initWithString:text]
    completionHandler:^(NSError *) {}];
}

- (void)open {
  [self teardown];
  if (!_url) return;
  NSURLSessionWebSocketTask *socket = [_session webSocketTaskWithRequest:[KuitoInspector devRequestTo:_url]];
  socket.maximumMessageSize = 64 * 1024 * 1024;
  @synchronized(self) { _socket = socket; }
  [socket resume];
  [self receive:socket];
}

- (void)receive:(NSURLSessionWebSocketTask *)socket {
  __weak KuitoInspector *weakSelf = self;
  [socket receiveMessageWithCompletionHandler:^(NSURLSessionWebSocketMessage *message, NSError *error) {
    KuitoInspector *inspector = weakSelf;
    if (!inspector) return;
    // The handler runs on an internal queue; frames go through ours, in order.
    [inspector->_queue addOperationWithBlock:^{
      if (socket != inspector->_socket) return;
      if (error) return [inspector dropped:socket];
      if (message.type == NSURLSessionWebSocketMessageTypeString && message.string.UTF8String)
        inspector->_device->receive(message.string.UTF8String);
      [inspector receive:socket];
    }];
  }];
}

- (void)URLSession:(NSURLSession *)session
          webSocketTask:(NSURLSessionWebSocketTask *)socket
  didOpenWithProtocol:(NSString *)protocol {
  if (socket != _socket) return;
  _attempt = 0;
  _device->opened();
}

- (void)URLSession:(NSURLSession *)session
       webSocketTask:(NSURLSessionWebSocketTask *)socket
    didCloseWithCode:(NSURLSessionWebSocketCloseCode)code
              reason:(NSData *)reason {
  [self dropped:socket];
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  if ([task isKindOfClass:NSURLSessionWebSocketTask.class]) [self dropped:(NSURLSessionWebSocketTask *)task];
}

/// Only the current socket's failure schedules a retry: 0.5 s, doubling up to 5 s, as the dev link does.
- (void)dropped:(NSURLSessionWebSocketTask *)socket {
  if (socket != _socket || _stopped) return;
  [self teardown];
  _device->closed();
  double delay = std::min(0.5 * std::pow(2.0, (double)_attempt), 5.0);
  _attempt += 1;
  NSURL *url = _url;
  __weak KuitoInspector *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)),
                 dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    KuitoInspector *inspector = weakSelf;
    if (!inspector) return;
    [inspector->_queue addOperationWithBlock:^{
      if (!inspector->_stopped && !inspector->_socket && inspector->_url == url) [inspector open];
    }];
  });
}

- (void)teardown {
  NSURLSessionWebSocketTask *socket;
  @synchronized(self) {
    socket = _socket;
    _socket = nil;
  }
  [socket cancelWithCloseCode:NSURLSessionWebSocketCloseCodeGoingAway reason:nil];
}

@end

#endif
