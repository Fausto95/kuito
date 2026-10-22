#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// A Drawing Path's `d`, read by the shared parser (native/shared/PathData.h)
/// into a CGPath. Pure, so any thread may parse.
NS_SWIFT_SENDABLE
@interface KuitoPathData : NSObject
/// The path the data draws; nil, with the parser's KUITO_PATH message as
/// the error's description, for malformed data.
+ (nullable CGPathRef)pathFromData:(NSString *)data
                             error:(NSError **)error CF_RETURNS_RETAINED NS_SWIFT_NAME(path(_:));
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
@end

NS_ASSUME_NONNULL_END
