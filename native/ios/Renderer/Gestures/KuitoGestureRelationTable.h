#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// The shared relations between gestures by tag (native/shared/gestures/GestureRelations.h):
/// which gesture waits for or runs alongside which.
@interface KuitoGestureRelationTable : NSObject
/// Replaces all three of the gesture's relations.
- (void)setTag:(NSInteger)tag
         waitFor:(NSArray<NSNumber *> *)waitFor
    simultaneous:(NSArray<NSNumber *> *)simultaneous
          blocks:(NSArray<NSNumber *> *)blocks NS_SWIFT_NAME(set(_:waitFor:simultaneous:blocks:));
/// The gesture's own relations go; others' naming it stay.
- (void)dropTag:(NSInteger)tag NS_SWIFT_NAME(drop(_:));
/// `gesture` waits for `other` to fail: it names `other` in waitFor, or `other` names it in blocks.
- (BOOL)gesture:(NSInteger)gesture waitsFor:(NSInteger)other NS_SWIFT_NAME(waits(_:for:));
/// Either names the other in simultaneous.
- (BOOL)gesture:(NSInteger)gesture runsAlongside:(NSInteger)other NS_SWIFT_NAME(simultaneous(_:_:));
/// Every gesture `gesture` waits for, each once.
- (NSArray<NSNumber *> *)awaitedBy:(NSInteger)gesture NS_SWIFT_NAME(awaited(by:));
@end

NS_ASSUME_NONNULL_END
