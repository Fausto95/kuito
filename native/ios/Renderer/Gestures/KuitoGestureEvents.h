#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// The shared rules for which state changes the app hears (native/shared/gestures/GestureEvents.h).
@interface KuitoGestureEvents : NSObject
/// The changes a recognizer's move to `now` sends, `last` being the last state sent:
/// pairs of (state, old state), flattened. States are RNGH's numbers.
+ (NSArray<NSNumber *> *)changesFrom:(NSInteger)last to:(NSInteger)now NS_SWIFT_NAME(changes(from:to:));
@end

NS_ASSUME_NONNULL_END
