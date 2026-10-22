#import "KuitoGestureEvents.h"
#include "gestures/GestureEvents.h"

namespace gestures = kuito::gestures;

@implementation KuitoGestureEvents

+ (NSArray<NSNumber *> *)changesFrom:(NSInteger)last to:(NSInteger)now {
    NSMutableArray<NSNumber *> *changes = [NSMutableArray array];
    for (const gestures::Change &change :
         gestures::changesFor(static_cast<gestures::State>(last), static_cast<gestures::State>(now))) {
        [changes addObject:@(static_cast<int>(change.state))];
        [changes addObject:@(static_cast<int>(change.before))];
    }
    return changes;
}

@end
