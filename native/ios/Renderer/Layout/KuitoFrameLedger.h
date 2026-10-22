#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// What the frame rule decided about one display frame (FrameLedger.h).
typedef struct {
    /// Seconds the main thread worked since the previous frame.
    double work;
    /// Display frames skipped while it worked past one.
    NSInteger dropped;
} KuitoFrameVerdict;

/// The main thread's frame receipts (native/shared/FrameLedger.h,
/// docs/performance.md#frame-receipts), for Swift. Main thread only. In a
/// build without receipts every call records nothing.
@interface KuitoFrameLedger : NSObject

- (instancetype)init NS_UNAVAILABLE;

/// The ledger's clock, in seconds.
@property (class, nonatomic, readonly) double now;

/// A pass's frames applied to the views since `start`.
+ (void)recordFramesFrom:(double)start framed:(uint32_t)framed wasted:(uint32_t)wasted;
/// A label drawn, `seconds` long: added to the frame's redraw receipt.
+ (void)addRedraw:(double)seconds;
/// Core Animation's commit, from `start` until now.
+ (void)recordCommitFrom:(double)start;

/// The run loop woke to run work, or went to sleep.
+ (void)woke;
+ (void)slept;
/// The display frame for the vsync at `vsync`, `interval` apart (seconds):
/// closes the frame's receipts and keeps them when it dropped.
+ (KuitoFrameVerdict)frameAtVsync:(double)vsync interval:(double)interval NS_SWIFT_NAME(frame(vsync:interval:));

/// Counts up with each drop kept; 0 before any.
@property (class, nonatomic, readonly) uint64_t dropSequence;
/// Whether the last drop's frame did Kuito work worth a report.
@property (class, nonatomic, readonly) BOOL lastDropReceipted;
/// The last drop as one line, `view` naming a view by its number.
+ (NSString *)describeLastDrop:(NSString *(^)(uint32_t view))view;

/// For tests: forgets every receipt and drop.
+ (void)reset;
/// For tests: job `job` applies a batch now, for `event` on view `view`.
+ (void)applyJob:(uint64_t)job event:(NSString *)event view:(uint32_t)view;
/// For tests: the last drop's receipts, oldest first, each `kind`, `ms`,
/// `cause` and `counts`.
@property (class, nonatomic, readonly) NSArray<NSDictionary<NSString *, id> *> *lastDropReceipts;

@end

NS_ASSUME_NONNULL_END
