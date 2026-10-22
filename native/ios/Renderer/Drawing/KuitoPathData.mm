#import "KuitoPathData.h"

#include "PathData.h"

@implementation KuitoPathData

+ (CGPathRef)pathFromData:(NSString *)data error:(NSError **)error {
  kuito::path::Path parsed;

  try {
    parsed = kuito::path::parse(data.UTF8String ?: "");
  } catch (const std::invalid_argument &failure) {
    if (error)
      *error = [NSError errorWithDomain:@"KuitoPathData"
                                   code:1
                               userInfo:@{NSLocalizedDescriptionKey : @(failure.what()) ?: @"KUITO_PATH: malformed path data"}];
    return nil;
  }

  CGMutablePathRef path = CGPathCreateMutable();
  const float *p = parsed.points.data();

  for (kuito::path::Verb verb : parsed.verbs) {
    switch (verb) {
    case kuito::path::Verb::Move: CGPathMoveToPoint(path, nullptr, p[0], p[1]); break;
    case kuito::path::Verb::Line: CGPathAddLineToPoint(path, nullptr, p[0], p[1]); break;
    case kuito::path::Verb::Quad: CGPathAddQuadCurveToPoint(path, nullptr, p[0], p[1], p[2], p[3]); break;
    case kuito::path::Verb::Cubic: CGPathAddCurveToPoint(path, nullptr, p[0], p[1], p[2], p[3], p[4], p[5]); break;
    case kuito::path::Verb::Close: CGPathCloseSubpath(path); break;
    }
    p += kuito::path::pointCount(verb);
  }

  return path;
}

@end
