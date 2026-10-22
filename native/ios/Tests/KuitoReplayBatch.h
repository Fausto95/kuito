#import <Foundation/Foundation.h>
#import "../Renderer/KuitoMutationBatch.h"

NS_ASSUME_NONNULL_BEGIN

/// A recording's batch as a shell with no JS applies it: native/shared/Recording.h's `ReplayBatch`.
@interface KuitoReplayBatch : NSObject
/// When the recording's runtime sent it, in milliseconds since it started.
@property (nonatomic, readonly) double ms;
@property (nonatomic, readonly) KuitoMutationBatch *batch;
/// The batches of `file`, a `.krec`, decoded and checked in order against one
/// view table; nil and an error naming what is wrong with the file.
+ (nullable NSArray<KuitoReplayBatch *> *)batchesOfRecording:(NSData *)file
                                                        error:(NSError **)error NS_SWIFT_NAME(batches(ofRecording:));
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
@end

NS_ASSUME_NONNULL_END
