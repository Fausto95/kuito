#import "KuitoListKeyEdits.h"

#include "ListKeys.h"
#include <string>
#include <vector>

namespace {

std::string utf8(NSString *text) {
    const char *bytes = text.UTF8String;

    return bytes ? std::string(bytes, [text lengthOfBytesUsingEncoding:NSUTF8StringEncoding]) : std::string();
}

} // namespace

@implementation KuitoListKeyEdits

+ (nullable NSData *)orderOfKeys:(NSArray<NSString *> *)keys
                             ops:(NSArray<NSNumber *> *)ops
                         indices:(NSArray<NSNumber *> *)indices
                        editKeys:(NSArray<NSString *> *)editKeys
                           error:(NSError **)error {
    NSParameterAssert(ops.count == editKeys.count && indices.count == editKeys.count);

    std::vector<std::string> current;
    std::vector<kuito::KeyEdit> edits;

    current.reserve(keys.count);
    for (NSString *key in keys) current.push_back(utf8(key));
    edits.reserve(editKeys.count);
    for (NSUInteger n = 0; n < editKeys.count; n++) {
        edits.push_back({static_cast<kuito::KeyEdit::Op>(ops[n].unsignedCharValue), indices[n].intValue, utf8(editKeys[n])});
    }

    try {
        auto order = kuito::editKeys(current, edits).order;

        return [NSData dataWithBytes:order.data() length:order.size() * sizeof(order[0])];
    } catch (const kuito::KeyEditError &failure) {
        if (error) {
            *error = [NSError errorWithDomain:@"KuitoListKeys"
                                         code:1
                                     userInfo:@{NSLocalizedDescriptionKey: @(failure.what())}];
        }
        return nil;
    }
}

@end
