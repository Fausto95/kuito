#import <Foundation/Foundation.h>
#import <QuartzCore/QuartzCore.h>
#import "KuitoMutationRecord.h"

NS_ASSUME_NONNULL_BEGIN

/// One job's typed mutations (native/shared/Mutation.h), in order, as C
/// records the renderer reads in place.
@interface KuitoMutationBatch : NSObject
@property (nonatomic, readonly) const KuitoMutationRecord *records NS_RETURNS_INNER_POINTER;
@property (nonatomic, readonly) NSInteger count;
/// When the JS thread sent the batch, on `CACurrentMediaTime`'s clock.
@property (nonatomic, readonly) CFTimeInterval sentAt;
/// How many `__kuitoHostCommit` calls the job made: 1 for a job with one commit.
@property (nonatomic, readonly) NSInteger hostCalls;
/// Folded on the JS thread (native/shared/Effect.h). False for a paint-only batch.
@property (nonatomic, readonly) BOOL marksLayout;
- (instancetype)init NS_UNAVAILABLE;
@end

NS_ASSUME_NONNULL_END
