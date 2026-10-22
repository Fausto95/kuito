#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// A call that failed: its error's code and message, the one answer that is
/// not the function's result.
@interface KuitoLinkFailure : NSObject
@property (nonatomic, readonly, copy) NSString *code;
@property (nonatomic, readonly, copy) NSString *message;
- (instancetype)initWithCode:(NSString *)code message:(NSString *)message NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;
@end

/// A result: NSNull, an NSNumber, an NSString, an NSData, and NSArrays and NSDictionaries
/// of them (a spec's struct is an NSArray of its fields in declared order), or
/// a KuitoLinkFailure.
typedef void (^KuitoLinkSettle)(id result);

/// What the platform sends for an observed event or live value: a value as above.
typedef void (^KuitoLinkEmit)(int32_t member, id value);

/// The link table as the Hermes bridge calls it: functions by id, their
/// arguments as the values above. Every member is called on the VM queue.
@protocol KuitoLinkHost <NSObject>
/// Before any other member. The emitter may be called from any thread.
- (void)attachEmitter:(KuitoLinkEmit)emit;
/// Before observing. A motion value's change, for the UI runtime; may be
/// called from any thread, before the same change goes to the emitter.
- (void)attachMotionWriter:(KuitoLinkEmit)write;
/// A member's signature (src/cli/link-signature.ts), nil for one this shell
/// does not link. Called on the VM queue and on the main thread.
- (nullable NSString *)signature:(int32_t)member;
/// Runs a `js` function and returns its result.
- (id)call:(int32_t)function arguments:(NSArray *)arguments;
/// Starts a `main` or `background` function; `settle` may be called from any thread, once.
- (void)callAsync:(int32_t)function arguments:(NSArray *)arguments settle:(KuitoLinkSettle)settle;
/// Main thread, for UI-thread code: runs a `main` function that answers at
/// once and returns its result, or a KuitoLinkFailure.
- (id)callOnMain:(int32_t)function arguments:(NSArray *)arguments NS_SWIFT_NAME(callOnMain(_:arguments:));
/// Starts or stops an event or a live value sending what it observes.
- (void)observe:(int32_t)member observing:(BOOL)observing;
/// The runtime is shutting down: stop what is observed. No member is called after it.
- (void)invalidate;
@end

NS_ASSUME_NONNULL_END
