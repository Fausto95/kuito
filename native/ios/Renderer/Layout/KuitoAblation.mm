#import "KuitoAblation.h"
#include "Ablation.h"

static_assert(static_cast<int>(kuito::Subsystem::ApplyBatch) == KuitoSubsystemApplyBatch,
              "KuitoSubsystem numbers kuito::Subsystem");

@implementation KuitoAblation

+ (BOOL)elides:(KuitoSubsystem)subsystem {
    return kuito::ablation()[static_cast<kuito::Subsystem>(subsystem)].elide;
}

+ (void)slow:(KuitoSubsystem)subsystem {
    kuito::ablated(static_cast<kuito::Subsystem>(subsystem), [] {}, [] {});
}

+ (NSString *)setting {
    return @(kuito::ablation().describe().c_str());
}

+ (NSString *)error {
    return @(kuito::ablationError().c_str());
}

@end
