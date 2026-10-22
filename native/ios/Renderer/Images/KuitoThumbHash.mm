#import "KuitoThumbHash.h"

#include "ThumbHash.h"
#include <optional>
#include <utility>

@implementation KuitoThumbHash {
    std::optional<kuito::ThumbHash> _hash;
}

- (nullable instancetype)initWithString:(NSString *)text {
    auto hash = kuito::ThumbHash::parse(text.UTF8String ?: "");

    if (!hash) return nil;
    if ((self = [super init])) _hash = std::move(hash);
    return self;
}

- (UIImage *)preview {
    kuito::ThumbHashPreview preview = _hash->decode();
    NSData *bytes = [NSData dataWithBytes:preview.rgba.data() length:preview.rgba.size()];
    CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)bytes);
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    // The decoder's alpha is not premultiplied: kCGImageAlphaLast says so.
    CGImageRef image = CGImageCreate(preview.width, preview.height, 8, 32, preview.width * 4, space,
                                     kCGBitmapByteOrderDefault | kCGImageAlphaLast, provider, NULL, true,
                                     kCGRenderingIntentDefault);
    UIImage *result = [UIImage imageWithCGImage:image];

    CGImageRelease(image);
    CGColorSpaceRelease(space);
    CGDataProviderRelease(provider);
    return result;
}

@end
