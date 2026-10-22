#import "KuitoGestureRelationTable.h"
#include "gestures/GestureRelations.h"
#include <vector>

namespace gestures = kuito::gestures;

static std::vector<int> KuitoTags(NSArray<NSNumber *> *tags) {
    std::vector<int> result;
    result.reserve(tags.count);
    for (NSNumber *tag in tags) result.push_back(tag.intValue);
    return result;
}

@implementation KuitoGestureRelationTable {
    gestures::GestureRelations _relations;
}

- (void)setTag:(NSInteger)tag
         waitFor:(NSArray<NSNumber *> *)waitFor
    simultaneous:(NSArray<NSNumber *> *)simultaneous
          blocks:(NSArray<NSNumber *> *)blocks {
    _relations.set(static_cast<int>(tag), {KuitoTags(waitFor), KuitoTags(simultaneous), KuitoTags(blocks)});
}

- (void)dropTag:(NSInteger)tag {
    _relations.drop(static_cast<int>(tag));
}

- (BOOL)gesture:(NSInteger)gesture waitsFor:(NSInteger)other {
    return _relations.waitsFor(static_cast<int>(gesture), static_cast<int>(other));
}

- (BOOL)gesture:(NSInteger)gesture runsAlongside:(NSInteger)other {
    return _relations.simultaneous(static_cast<int>(gesture), static_cast<int>(other));
}

- (NSArray<NSNumber *> *)awaitedBy:(NSInteger)gesture {
    NSMutableArray<NSNumber *> *tags = [NSMutableArray array];
    for (int tag : _relations.awaited(static_cast<int>(gesture))) [tags addObject:@(tag)];
    return tags;
}

@end
