#import "KuitoHTTPClient.h"

@implementation KuitoHTTPRequest
@end

/// One request's body on its way: buffered, streamed once asked, or written to a file.
@interface KuitoTransfer : NSObject
@property (nonatomic) int requestId;
@property (nonatomic) BOOL streaming;
@property (nonatomic, strong) NSMutableData *buffer;
@property (nonatomic) int status;
@property (nonatomic) KuitoHTTPProgress progress;
@property (nonatomic) CFTimeInterval reportedAt;
@property (nonatomic) int64_t received;
@property (nonatomic) int64_t expected;
/// Downloads: the destination, and the file beside it the body goes to first.
@property (nonatomic, strong, nullable) NSURL *saveTo;
@property (nonatomic, strong, nullable) NSURL *staged;
@property (nonatomic, strong, nullable) NSFileHandle *output;
/// Uploads with bytes around the file: the whole body, composed on disk, deleted at the end.
@property (nonatomic, strong, nullable) NSURL *composed;
/// A failure of our own (a file write), which ends the request.
@property (nonatomic, copy, nullable) NSString *failure;
@end

@implementation KuitoTransfer
@end

/// Progress closer together than this is dropped; the last is always sent.
static const CFTimeInterval KuitoProgressInterval = 0.1;

@interface KuitoHTTPClient () <NSURLSessionDataDelegate>
@end

@implementation KuitoHTTPClient {
  __weak id<KuitoHTTPSink> _sink;
  /// Serial: every delegate call and every table access runs here.
  NSOperationQueue *_queue;
  NSURLSession *_session;
  NSMutableDictionary<NSNumber *, NSURLSessionTask *> *_tasks;
  NSMutableDictionary<NSNumber *, KuitoTransfer *> *_transfers;
}

- (instancetype)initWithSink:(id<KuitoHTTPSink>)sink {
  self = [super init];
  if (!self) return nil;
  _sink = sink;
  _queue = [NSOperationQueue new];
  _queue.maxConcurrentOperationCount = 1;
  _queue.name = @"dev.kuito.http";
  _tasks = [NSMutableDictionary new];
  _transfers = [NSMutableDictionary new];
  // No cookies and no cache, as OkHttp's defaults on Android (docs/web-apis.md).
  NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.ephemeralSessionConfiguration;
  configuration.HTTPCookieStorage = nil;
  configuration.HTTPShouldSetCookies = NO;
  configuration.URLCache = nil;
  configuration.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
  // The session retains its delegate until -invalidate.
  _session = [NSURLSession sessionWithConfiguration:configuration delegate:self delegateQueue:_queue];
  return self;
}

/// The request's body, then the file, then `suffix`, as one file to upload from.
+ (nullable NSURL *)compose:(KuitoHTTPRequest *)request error:(NSString **)failure {
  NSURL *composed = [NSURL fileURLWithPath:[NSTemporaryDirectory()
                                               stringByAppendingPathComponent:NSUUID.UUID.UUIDString]];
  [NSFileManager.defaultManager createFileAtPath:composed.path contents:request.request.HTTPBody attributes:nil];
  NSFileHandle *output = [NSFileHandle fileHandleForWritingToURL:composed error:nil];
  NSError *error;
  NSFileHandle *input = [NSFileHandle fileHandleForReadingFromURL:request.bodyFile error:&error];
  if (!output || !input) {
    *failure = error.localizedDescription ?: @"Could not compose the request body";
    [NSFileManager.defaultManager removeItemAtURL:composed error:nil];
    return nil;
  }
  [output seekToEndOfFile];
  for (NSData *piece = [input readDataOfLength:65536]; piece.length; piece = [input readDataOfLength:65536])
    [output writeData:piece];
  if (request.suffix) [output writeData:request.suffix];
  [input closeFile];
  [output closeFile];
  return composed;
}

- (void)start:(int)requestId request:(KuitoHTTPRequest *)request {
  [_queue addOperationWithBlock:^{
    KuitoTransfer *transfer = [KuitoTransfer new];
    transfer.requestId = requestId;
    transfer.buffer = [NSMutableData new];
    transfer.progress = request.progress;
    transfer.saveTo = request.saveTo;
    transfer.expected = -1;
    NSURLSessionTask *task;
    if (request.bodyFile) {
      NSURL *source = request.bodyFile;
      if (request.request.HTTPBody.length || request.suffix.length) {
        NSString *failure;
        source = [KuitoHTTPClient compose:request error:&failure];
        if (!source) {
          [self->_sink httpEnd:requestId body:[NSData data] error:failure];
          return;
        }
        transfer.composed = source;
      }
      NSMutableURLRequest *upload = [request.request mutableCopy];
      upload.HTTPBody = nil;
      task = [self->_session uploadTaskWithRequest:upload fromFile:source];
    } else {
      task = [self->_session dataTaskWithRequest:request.request];
    }
    self->_tasks[@(requestId)] = task;
    self->_transfers[@(task.taskIdentifier)] = transfer;
    [task resume];
  }];
}

- (void)stream:(int)requestId {
  [_queue addOperationWithBlock:^{
    NSURLSessionTask *task = self->_tasks[@(requestId)];
    KuitoTransfer *transfer = task ? self->_transfers[@(task.taskIdentifier)] : nil;
    if (!transfer || transfer.streaming || transfer.saveTo) return;
    transfer.streaming = YES;
    if (transfer.buffer.length) [self->_sink httpChunk:requestId data:[transfer.buffer copy]];
    transfer.buffer = [NSMutableData new];
  }];
}

- (void)cancel:(int)requestId {
  [_queue addOperationWithBlock:^{
    NSURLSessionTask *task = self->_tasks[@(requestId)];
    KuitoTransfer *transfer = task ? self->_transfers[@(task.taskIdentifier)] : nil;
    if (!task) return;
    [self->_tasks removeObjectForKey:@(requestId)];
    [self->_transfers removeObjectForKey:@(task.taskIdentifier)];
    [task cancel];
    [KuitoHTTPClient clean:transfer];
  }];
}

- (void)invalidate {
  _sink = nil;
  [_session invalidateAndCancel];
}

/// Deletes what a transfer staged on disk.
+ (void)clean:(KuitoTransfer *)transfer {
  [transfer.output closeFile];
  transfer.output = nil;
  if (transfer.staged) [NSFileManager.defaultManager removeItemAtURL:transfer.staged error:nil];
  if (transfer.composed) [NSFileManager.defaultManager removeItemAtURL:transfer.composed error:nil];
}

- (void)report:(KuitoTransfer *)transfer bytes:(int64_t)bytes total:(int64_t)total {
  CFTimeInterval now = NSProcessInfo.processInfo.systemUptime;
  BOOL last = total >= 0 && bytes >= total;
  if (!last && now - transfer.reportedAt < KuitoProgressInterval) return;
  transfer.reportedAt = now;
  [_sink httpProgress:transfer.requestId bytes:(double)bytes total:total < 0 ? -1 : (double)total];
}

- (void)URLSession:(NSURLSession *)session
              dataTask:(NSURLSessionDataTask *)dataTask
    didReceiveResponse:(NSURLResponse *)response
     completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
  KuitoTransfer *transfer = _transfers[@(dataTask.taskIdentifier)];
  if (transfer) {
    int status = 0;
    NSMutableArray<NSString *> *headers = [NSMutableArray new];
    if ([response isKindOfClass:NSHTTPURLResponse.class]) {
      NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
      status = (int)http.statusCode;
      [http.allHeaderFields enumerateKeysAndObjectsUsingBlock:^(id name, id value, BOOL *stop) {
        [headers addObject:[name description]];
        [headers addObject:[value description]];
      }];
    }
    transfer.status = status;
    transfer.expected = response.expectedContentLength;
    if (transfer.saveTo && status >= 200 && status < 300) {
      // Beside the destination, so the final move is a rename on the same volume.
      transfer.staged = [transfer.saveTo.URLByDeletingLastPathComponent
          URLByAppendingPathComponent:[@".kuito-" stringByAppendingString:NSUUID.UUID.UUIDString]];
      [NSFileManager.defaultManager createFileAtPath:transfer.staged.path contents:nil attributes:nil];
      transfer.output = [NSFileHandle fileHandleForWritingToURL:transfer.staged error:nil];
      if (!transfer.output) transfer.failure = [NSString stringWithFormat:@"Could not write %@", transfer.saveTo.path];
    }
    [_sink httpHead:transfer.requestId status:status url:response.URL.absoluteString ?: @"" headers:headers];
    if (transfer.failure) {
      completionHandler(NSURLSessionResponseCancel);
      return;
    }
  }
  completionHandler(NSURLSessionResponseAllow);
}

- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)dataTask didReceiveData:(NSData *)data {
  KuitoTransfer *transfer = _transfers[@(dataTask.taskIdentifier)];
  if (!transfer) return;
  transfer.received += data.length;
  if (transfer.saveTo) {
    // A body that isn't 2xx is dropped: nothing is written for it.
    if (transfer.output) {
      NSError *error;
      if (![transfer.output writeData:data error:&error]) {
        transfer.failure = error.localizedDescription;
        [dataTask cancel];
        return;
      }
    }
  } else if (transfer.streaming) {
    [_sink httpChunk:transfer.requestId data:data];
  } else {
    [transfer.buffer appendData:data];
  }
  if (transfer.progress == KuitoHTTPProgressReceive)
    [self report:transfer bytes:transfer.received total:transfer.expected];
}

- (void)URLSession:(NSURLSession *)session
                        task:(NSURLSessionTask *)task
             didSendBodyData:(int64_t)bytesSent
              totalBytesSent:(int64_t)totalBytesSent
    totalBytesExpectedToSend:(int64_t)totalBytesExpectedToSend {
  KuitoTransfer *transfer = _transfers[@(task.taskIdentifier)];
  if (transfer.progress == KuitoHTTPProgressSend)
    [self report:transfer bytes:totalBytesSent total:totalBytesExpectedToSend];
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  KuitoTransfer *transfer = _transfers[@(task.taskIdentifier)];
  if (!transfer) return;
  [_transfers removeObjectForKey:@(task.taskIdentifier)];
  [_tasks removeObjectForKey:@(transfer.requestId)];
  NSString *failure = transfer.failure ?: error.localizedDescription;
  if (transfer.output && !failure) {
    [transfer.output closeFile];
    transfer.output = nil;
    NSError *moved;
    [NSFileManager.defaultManager removeItemAtURL:transfer.saveTo error:nil];
    if ([NSFileManager.defaultManager moveItemAtURL:transfer.staged toURL:transfer.saveTo error:&moved])
      transfer.staged = nil;
    else failure = moved.localizedDescription;
  }
  [KuitoHTTPClient clean:transfer];
  // A body of unknown length reports its last byte here.
  if (!failure && transfer.progress == KuitoHTTPProgressReceive && transfer.expected < 0)
    [_sink httpProgress:transfer.requestId bytes:(double)transfer.received total:-1];
  [_sink httpEnd:transfer.requestId body:transfer.saveTo ? [NSData data] : transfer.buffer error:failure ?: @""];
}

@end
