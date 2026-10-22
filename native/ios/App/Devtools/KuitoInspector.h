#import <Foundation/Foundation.h>

#ifdef __cplusplus
#include <memory>
namespace kuito { class InspectorDevice; }
#endif

NS_ASSUME_NONNULL_BEGIN

/// The device side of `kuito dev`'s debugger proxy (docs/devtools.md): a
/// socket of its own, off the main thread, so a runtime paused at a
/// breakpoint, even the UI thread's, still hears DevTools. Development builds
/// only; release builds compile none of it.
@interface KuitoInspector : NSObject
/// A request to the dev server at `url`, with the session token `kuito dev`
/// launched a phone with (docs/phone-live-patch.md); a simulator has none.
+ (NSURLRequest *)devRequestTo:(NSURL *)url NS_SWIFT_NAME(devRequest(to:));
/// Connects to the dev server at `server` (the Live Patch URL), reconnecting
/// with backoff until `stop`. Calling it again moves to another server.
- (void)connectTo:(NSURL *)server;
- (void)stop;
#ifdef __cplusplus
/// What the runtimes attach to; it outlives reloads and reconnects.
@property (nonatomic, readonly) std::shared_ptr<kuito::InspectorDevice> device;
#endif
@end

NS_ASSUME_NONNULL_END
