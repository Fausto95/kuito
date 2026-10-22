#import "KuitoLinkHost.h"

@implementation KuitoLinkFailure

- (instancetype)initWithCode:(NSString *)code message:(NSString *)message {
  self = [super init];
  if (self) {
    _code = [code copy];
    _message = [message copy];
  }
  return self;
}

@end
