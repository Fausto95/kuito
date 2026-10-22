#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// The ThumbHash an Image's `thumbhash` holds, decoded by the shared decoder
/// (native/shared/ThumbHash.h). Immutable, so any thread may decode it.
NS_SWIFT_SENDABLE
@interface KuitoThumbHash : NSObject
/// Nil for text that is not a base64 ThumbHash. Checks the hash, decodes nothing.
- (nullable instancetype)initWithString:(NSString *)text NS_SWIFT_NAME(init(_:));
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;

/// The blurred preview, at most 32 pixels on its longer side. An image
/// decode: run it off the main thread.
- (UIImage *)preview;
@end

NS_ASSUME_NONNULL_END
