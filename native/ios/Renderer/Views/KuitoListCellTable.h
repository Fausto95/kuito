#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Which of a list's cells shows which key, by the shared table
/// (native/shared/ListCells.h). Slots go by number, never reused.
@interface KuitoListCellTable : NSObject
- (instancetype)initWithList:(NSString *)list NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;

/// The keys the list renders ahead: their cells are not reused.
- (void)setWindow:(NSArray<NSString *> *)keys;
/// The slot holding `key`, now its most recent use; -1 when none does.
- (int32_t)find:(NSString *)key;
/// A slot for `key`, which none holds: a reused one not in `held` (on
/// screen), or a new one. JavaScript is to render `key` into it.
- (int32_t)place:(NSString *)key held:(NSArray<NSNumber *> *)held;
/// The slot JavaScript's cell `id` fills.
- (int32_t)adopt:(NSString *)id;
/// Whether a replayed cell's slot joined with the key it shows.
- (BOOL)join:(int32_t)slot key:(NSString *)key;
- (void)remove:(int32_t)slot;
- (NSString *)idOf:(int32_t)slot NS_SWIFT_NAME(id(of:));
@end

NS_ASSUME_NONNULL_END
