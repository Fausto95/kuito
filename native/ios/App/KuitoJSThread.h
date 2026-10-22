#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// A serial queue that runs on one dedicated thread, like React Native's JS
/// thread. A dispatch queue hops between pool threads, but Hermes's CPU
/// profiler samples the thread the runtime registered, which must stay alive
/// and stay the one running JavaScript.
@interface KuitoJSThread : NSObject
- (instancetype)initWithName:(NSString *)name NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;
/// Runs `block` on the thread after the blocks queued before it.
- (void)async:(dispatch_block_t)block;
/// Queues `block` once `seconds` have passed.
- (void)after:(NSTimeInterval)seconds async:(dispatch_block_t)block;
/// Ends the thread once the blocks already queued have run; later ones never do.
- (void)stop;
@end

NS_ASSUME_NONNULL_END
