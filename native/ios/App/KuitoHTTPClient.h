#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// What the client answers each request with, from its delegate queue, in
/// order: a head, chunks once streamed, progress when asked, then an end
/// (native/shared/Http.h).
@protocol KuitoHTTPSink <NSObject>
- (void)httpHead:(int)requestId
          status:(int)status
             url:(NSString *)url
         headers:(NSArray<NSString *> *)headers;
- (void)httpChunk:(int)requestId data:(NSData *)data;
/// `total` is -1 when unknown.
- (void)httpProgress:(int)requestId bytes:(double)bytes total:(double)total;
- (void)httpEnd:(int)requestId body:(NSData *)body error:(NSString *)error;
@end

typedef NS_ENUM(NSInteger, KuitoHTTPProgress) {
  KuitoHTTPProgressNone,
  KuitoHTTPProgressSend,
  KuitoHTTPProgressReceive,
};

/// A request and where its body comes from and goes.
@interface KuitoHTTPRequest : NSObject
@property (nonatomic, strong) NSURLRequest *request;
/// Sent after the request's body and before `suffix`.
@property (nonatomic, strong, nullable) NSURL *bodyFile;
@property (nonatomic, strong, nullable) NSData *suffix;
/// The body is written here, replacing it, when the status is 2xx.
@property (nonatomic, strong, nullable) NSURL *saveTo;
@property (nonatomic) KuitoHTTPProgress progress;
@end

/// The HTTP host on iOS: one URLSession whose delegate buffers each body,
/// passes it on as it arrives once the kernel streams it, or writes it to a
/// file; file bodies upload from disk.
@interface KuitoHTTPClient : NSObject
- (instancetype)initWithSink:(id<KuitoHTTPSink>)sink NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;
- (void)start:(int)requestId request:(KuitoHTTPRequest *)request;
- (void)stream:(int)requestId;
- (void)cancel:(int)requestId;
/// Cancels everything; the client answers nothing after.
- (void)invalidate;
@end

NS_ASSUME_NONNULL_END
