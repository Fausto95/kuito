#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// A main-thread subsystem the ablation switchboard slows or elides
/// (native/shared/Ablation.h): in its order.
typedef NS_ENUM(uint8_t, KuitoSubsystem) {
    KuitoSubsystemLayout,
    KuitoSubsystemMeasure,
    KuitoSubsystemLabelRedraw,
    KuitoSubsystemUIFrame,
    KuitoSubsystemUIEvent,
    KuitoSubsystemAwaitInput,
    KuitoSubsystemApplyBatch,
};

/// The what-if switchboard for Swift (docs/performance.md#ablation), read
/// once from KUITO_ABLATE. In a build without it nothing is toggled.
@interface KuitoAblation : NSObject

- (instancetype)init NS_UNAVAILABLE;

/// Whether `subsystem`'s work is skipped.
+ (BOOL)elides:(KuitoSubsystem)subsystem;
/// Busy-waits as long as `subsystem` is slowed by, if it is.
+ (void)slow:(KuitoSubsystem)subsystem;
/// What is toggled, as KUITO_ABLATE reads back; empty when nothing is.
@property (class, nonatomic, readonly) NSString *setting;
/// Why KUITO_ABLATE did not read; empty when it did or is unset.
@property (class, nonatomic, readonly) NSString *error;

@end

NS_ASSUME_NONNULL_END
