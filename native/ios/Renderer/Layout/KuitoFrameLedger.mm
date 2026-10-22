#import "KuitoFrameLedger.h"
#include "FrameLedger.h"
#include <string>

@implementation KuitoFrameLedger

+ (double)now {
    return kuito::FrameLedger::now();
}

+ (void)recordFramesFrom:(double)start framed:(uint32_t)framed wasted:(uint32_t)wasted {
    kuito::frameLedger().record(kuito::Work::Layout, start, kuito::FrameLedger::now(), {0, 0, framed, wasted});
}

+ (void)addRedraw:(double)seconds {
    kuito::frameLedger().add(kuito::Work::Redraw, seconds);
}

+ (void)recordCommitFrom:(double)start {
    kuito::frameLedger().record(kuito::Work::CACommit, start, kuito::FrameLedger::now());
}

+ (void)woke {
    kuito::frameLedger().woke(kuito::FrameLedger::now());
}

+ (void)slept {
    kuito::frameLedger().slept(kuito::FrameLedger::now());
}

+ (KuitoFrameVerdict)frameAtVsync:(double)vsync interval:(double)interval {
    const kuito::FrameVerdict verdict = kuito::frameLedger().frame(kuito::FrameLedger::now(), vsync, interval);
    return {verdict.work, verdict.dropped};
}

+ (uint64_t)dropSequence {
    return kuito::frameLedger().lastDrop().sequence;
}

+ (BOOL)lastDropReceipted {
    return kuito::receipted(kuito::frameLedger().lastDrop());
}

+ (NSString *)describeLastDrop:(NSString *(^)(uint32_t view))view {
    const kuito::FrameLedger &ledger = kuito::frameLedger();
    const std::string line = kuito::describeDrop(ledger, ledger.lastDrop(), [view](std::uint32_t handle) {
        return std::string(view(handle).UTF8String ?: "");
    });
    return @(line.c_str());
}

+ (void)reset {
    kuito::frameLedger().reset();
}

+ (void)applyJob:(uint64_t)job event:(NSString *)event view:(uint32_t)view {
    kuito::JobCause cause{job, kuito::JobCause::Entry::Event, view, event.UTF8String ?: ""};
    kuito::frameLedger().applying(cause);
    const double now = kuito::FrameLedger::now();
    kuito::frameLedger().record(kuito::Work::ApplyBatch, now, now, {1, 0, 0, 0}, job);
}

+ (NSArray<NSDictionary<NSString *, id> *> *)lastDropReceipts {
    NSMutableArray *receipts = [NSMutableArray array];
    const kuito::FrameLedger::Drop &drop = kuito::frameLedger().lastDrop();
    for (std::size_t f = 0; f < drop.count; ++f)
        for (std::size_t r = 0; r < drop.frames[f].count; ++r) {
            const kuito::Receipt &receipt = drop.frames[f].receipts[r];
            [receipts addObject:@{
                @"kind": @(kuito::workName(receipt.kind)),
                @"ms": @((receipt.t1 - receipt.t0) * 1000),
                @"cause": @(receipt.cause),
                @"counts": @[@(receipt.counts[0]), @(receipt.counts[1]), @(receipt.counts[2]), @(receipt.counts[3])],
            }];
        }
    return receipts;
}

@end
