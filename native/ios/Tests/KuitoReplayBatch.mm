#import "KuitoReplayBatch.h"
#import "../Renderer/KuitoMutationBatch+Mutations.h"

#include "Effect.h"
#include "Recording.h"
#include <exception>
#include <string>
#include <utility>

@implementation KuitoReplayBatch

- (instancetype)initWithMs:(double)ms batch:(KuitoMutationBatch *)batch {
    self = [super init];
    if (!self) return nil;
    _ms = ms;
    _batch = batch;
    return self;
}

+ (nullable NSArray<KuitoReplayBatch *> *)batchesOfRecording:(NSData *)file error:(NSError **)error {
    try {
        auto replay = kuito::replayBatches(std::string(static_cast<const char *>(file.bytes), file.length));
        NSMutableArray<KuitoReplayBatch *> *batches = [NSMutableArray arrayWithCapacity:replay.size()];

        for (auto &recorded : replay) {
            const bool marksLayout = kuito::summarize(recorded.mutations).marksLayout();
            auto *batch = [[KuitoMutationBatch alloc] initWithMutations:std::move(recorded.mutations)
                                                                   sentAt:recorded.ms / 1000
                                                                hostCalls:1
                                                              marksLayout:marksLayout];
            [batches addObject:[[KuitoReplayBatch alloc] initWithMs:recorded.ms batch:batch]];
        }
        return batches;
    } catch (const std::exception &failure) {
        if (error) {
            *error = [NSError errorWithDomain:@"dev.kuito.recording"
                                         code:1
                                     userInfo:@{NSLocalizedDescriptionKey: @(failure.what())}];
        }
        return nil;
    }
}

@end
