// Objective-C++ only: the batch made from the C++ mutations it holds.
#import "KuitoMutationBatch.h"
#include "Mutation.h"
#include <vector>

@interface KuitoMutationBatch ()
- (instancetype)initWithMutations:(std::vector<kuito::Mutation>)mutations
                           sentAt:(CFTimeInterval)sentAt
                        hostCalls:(NSInteger)hostCalls
                      marksLayout:(BOOL)marksLayout;
@end
