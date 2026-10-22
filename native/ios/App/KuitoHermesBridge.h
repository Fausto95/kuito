#import <Foundation/Foundation.h>
#import "../Modules/Link/KuitoLinkHost.h"
#import "Devtools/KuitoInspector.h"
#import "../Renderer/KuitoMutationBatch.h"

NS_ASSUME_NONNULL_BEGIN

/// The JavaScript stack of an evaluation error, in its NSError's userInfo.
extern NSString *const KuitoStackKey;

/// JSON every runtime made and parsed to cross a boundary since launch, and the
/// display frames the UI runtime drained batches on (native/shared/WireWork.h).
typedef struct {
  uint64_t frames;
  uint64_t jsonParses;
  uint64_t bytesStringified;
} KuitoWireWork;

@protocol KuitoHermesBridgeDelegate <NSObject>
/// One job's batch, on the display frame that applies it (main queue). Its
/// `ui`, `ui-kernel`, `ui-script` and `ui-bundle` records go to
/// receiveUIOperations, loadUIKernel, evaluateUIScript and loadUIBundle.
- (void)kuitoApplyBatch:(KuitoMutationBatch *)batch NS_SWIFT_NAME(kuitoApplyBatch(_:));
/// A frame applied every batch the app had sent (main queue).
- (void)kuitoDidCommitFrames;
/// console output, or an error thrown by an event, timer or request callback.
/// Always delivered on the main queue.
- (void)kuitoDidLog:(NSString *)level message:(NSString *)message stack:(NSString *)stack;
/// Prop records the UI-thread kernel wrote. Delivered on the main queue,
/// inside the call that produced them, so they land in the current frame.
- (void)kuitoUIDidSetProps:(KuitoMutationBatch *)props;
@end

/// One persistent Hermes runtime owned exclusively by a dedicated serial queue.
@interface KuitoHermesBridge : NSObject
@property (nonatomic, weak, nullable) id<KuitoHermesBridgeDelegate> delegate;
// Only the throwing initializer creates the JS queue and runtime. Without these
// annotations Swift's `try KuitoHermesBridge()` silently binds NSObject's -init
// and the first evaluateScript dereferences a nil queue. Swift: `try KuitoHermesBridge(link:inspector:modules:)`.
// `inspector` makes both runtimes debuggable (docs/devtools.md); development builds only.
// `modules` is the directory of the app's chunks, `<name>.hbc` each: the bundle's, or an update's.
- (nullable instancetype)initWithLink:(id<KuitoLinkHost>)link
                            inspector:(nullable KuitoInspector *)inspector
                              modules:(NSURL *)modules
                                error:(NSError **)error NS_DESIGNATED_INITIALIZER
    NS_SWIFT_NAME(init(link:inspector:modules:));
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
/// What every session's runtimes counted so far. Any thread.
+ (KuitoWireWork)wireWork;
/// A script's bytes: UTF-8 source or Hermes bytecode, which Hermes tells apart.
- (void)evaluateScript:(NSData *)script
             sourceURL:(NSString *)url
            completion:(void (^)(NSError * _Nullable error))completion;
/// A native event (docs/events.md): the view's number, 0 for the app, and its
/// payload's record (docs/events.md#typed-events): `count` numbers and the
/// strings in its layout's order, or `json` for a module view's own event.
/// Copied before it returns. A record that does not fill its layout fails.
- (void)dispatchEvent:(uint32_t)handle
                event:(NSString *)event
               layout:(int32_t)layout
              numbers:(const double *_Nullable)numbers
                count:(NSInteger)count
              strings:(nullable NSArray<NSString *> *)strings
                 json:(nullable NSString *)json
           completion:(void (^)(NSError * _Nullable error))completion
    NS_SWIFT_NAME(dispatchEvent(handle:event:layout:numbers:count:strings:json:completion:));
/// Development builds: every batch this runtime committed so far, as a `.krec`
/// file (docs/devtools.md#recording-and-replay). Completes on the main queue.
- (void)recording:(void (^)(NSData *_Nullable recording, NSError *_Nullable error))completion;
/// Main thread. From the moment it returns, no batch, log or completion reaches
/// the delegate or a caller; Hermes goes on the JS thread after the work in flight.
- (void)shutdown;

// The UI runtime (docs/motion.md): main thread only, fed from the batch's `ui`,
// `ui-kernel`, `ui-script` and `ui-bundle` mutations, in order with the view mutations.
/// The UI kernel the shell ships, `ui.hbc`, if it is the one `hash` names;
/// otherwise the error reaches the delegate's log and the UI thread stays off.
- (void)loadUIKernel:(NSData *)bytecode hash:(NSString *)hash NS_SWIFT_NAME(loadUIKernel(_:hash:));
/// A revision of the app's UI bundle.
- (void)evaluateUIScript:(NSString *)source sourceURL:(NSString *)url;
/// A release build's UI bundle the shell ships, `app-ui.hbc`, if it is the one
/// `hash` names; otherwise the error reaches the delegate's log.
- (void)loadUIBundle:(NSData *)bytecode hash:(NSString *)hash sourceURL:(NSString *)url NS_SWIFT_NAME(loadUIBundle(_:hash:sourceURL:));
/// The operations of the `ui` record at `index` of the batch being applied.
- (void)receiveUIOperationsAt:(NSInteger)index NS_SWIFT_NAME(receiveUIOperations(at:));
/// Main thread: batches the app sent wait for a frame.
@property (nonatomic, readonly) BOOL hasPendingBatches;
/// A native event, its record as dispatchEvent takes it. YES when a UI-thread
/// handler ran it, or when the record does not fill its layout: that is
/// logged as an error and goes to neither runtime.
- (BOOL)handleUIEvent:(uint32_t)handle
                event:(NSString *)event
               layout:(int32_t)layout
              numbers:(const double *_Nullable)numbers
                count:(NSInteger)count
              strings:(nullable NSArray<NSString *> *)strings
                 json:(nullable NSString *)json
    NS_SWIFT_NAME(handleUIEvent(handle:event:layout:numbers:count:strings:json:));
@end

NS_ASSUME_NONNULL_END
