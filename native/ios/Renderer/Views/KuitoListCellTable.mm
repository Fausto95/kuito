#import "KuitoListCellTable.h"

#include "ListCells.h"
#include <exception>
#include <optional>
#include <string>
#include <vector>

namespace {

std::string utf8(NSString *text) {
    const char *bytes = text.UTF8String;

    return bytes ? std::string(bytes, [text lengthOfBytesUsingEncoding:NSUTF8StringEncoding]) : std::string();
}

/// The table's own errors are the renderer's mistakes (a slot it does not
/// have, a key placed twice): they stop the app with what went wrong.
template <class Work>
auto checked(Work &&work) -> decltype(work()) {
    try {
        return work();
    } catch (const std::exception &error) {
        [NSException raise:NSInternalInconsistencyException format:@"%s", error.what()];
        throw;
    }
}

} // namespace

@implementation KuitoListCellTable {
    std::optional<kuito::ListCells> _cells;
}

- (instancetype)initWithList:(NSString *)list {
    if ((self = [super init])) _cells.emplace(utf8(list));
    return self;
}

- (void)setWindow:(NSArray<NSString *> *)keys {
    std::vector<std::string> window;

    window.reserve(keys.count);
    for (NSString *key in keys) window.push_back(utf8(key));
    _cells->setWindow(std::move(window));
}

- (int32_t)find:(NSString *)key {
    return _cells->find(utf8(key));
}

- (int32_t)place:(NSString *)key held:(NSArray<NSNumber *> *)held {
    std::vector<int32_t> shown;

    shown.reserve(held.count);
    for (NSNumber *slot in held) shown.push_back(slot.intValue);
    return checked([&] { return _cells->place(utf8(key), shown); });
}

- (int32_t)adopt:(NSString *)id {
    return _cells->adopt(utf8(id));
}

- (BOOL)join:(int32_t)slot key:(NSString *)key {
    return checked([&] { return _cells->join(slot, utf8(key)); });
}

- (void)remove:(int32_t)slot {
    checked([&] { _cells->remove(slot); });
}

- (NSString *)idOf:(int32_t)slot {
    return checked([&] { return @(_cells->id(slot).c_str()); });
}

@end
