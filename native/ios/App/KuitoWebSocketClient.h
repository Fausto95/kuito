#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// What the client answers each socket with, from its delegate queue, in
/// order: open, messages, at most one error, then exactly one close
/// (native/shared/Socket.h).
@protocol KuitoWebSocketSink <NSObject>
- (void)socketOpen:(int)socketId protocol:(NSString *)protocol;
- (void)socketMessage:(int)socketId text:(nullable NSString *)text data:(nullable NSData *)data;
- (void)socketError:(int)socketId message:(NSString *)message;
- (void)socketClose:(int)socketId code:(int)code reason:(NSString *)reason clean:(BOOL)clean;
@end

/// The WebSocket host on iOS: URLSession web socket tasks on one session.
@interface KuitoWebSocketClient : NSObject
- (instancetype)initWithSink:(id<KuitoWebSocketSink>)sink NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;
- (void)open:(int)socketId url:(NSURL *)url protocols:(NSArray<NSString *> *)protocols;
- (void)send:(int)socketId text:(nullable NSString *)text data:(nullable NSData *)data;
- (void)close:(int)socketId code:(int)code reason:(NSString *)reason;
/// Cancels every socket; the client answers nothing after.
- (void)invalidate;
@end

NS_ASSUME_NONNULL_END
