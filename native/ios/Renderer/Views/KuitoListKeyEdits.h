#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// A list's keys edited by the kernel's diff (docs/lists.md#keys), by the
/// shared editor (native/shared/ListKeys.h).
@interface KuitoListKeyEdits : NSObject
/// Where each key the edits leave comes from, as int32s: an index into `keys`,
/// or `~n` for the key the n-th edit inserts. Each edit is its op (KeyEdit::Op),
/// index and key. An edit that does not fit fails, the error's description
/// naming it.
+ (nullable NSData *)orderOfKeys:(NSArray<NSString *> *)keys
                             ops:(NSArray<NSNumber *> *)ops
                         indices:(NSArray<NSNumber *> *)indices
                        editKeys:(NSArray<NSString *> *)editKeys
                           error:(NSError **)error NS_SWIFT_NAME(order(of:ops:indices:keys:));
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
@end

NS_ASSUME_NONNULL_END
