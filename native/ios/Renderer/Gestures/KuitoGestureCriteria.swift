// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/RNGestureHandler.h),
// MIT License, Copyright (c) 2016 Software Mansion.

import CoreGraphics

/// RNGH's activation and failure tests. An unset limit is NaN and never
/// passes; a negative limit is reached by going below it.
enum KuitoGestureCriteria {
    static func reachesMin(_ value: CGFloat, _ limit: CGFloat) -> Bool {
        !limit.isNaN && ((limit < 0 && value <= limit) || (limit >= 0 && value >= limit))
    }

    static func reachesAbsMin(_ value: CGFloat, _ limit: CGFloat) -> Bool {
        !limit.isNaN && abs(value) >= abs(limit)
    }

    static func exceedsMax(_ value: CGFloat, _ max: CGFloat) -> Bool {
        !max.isNaN && ((max < 0 && value < max) || (max >= 0 && value > max))
    }

    static func lengthSquared(_ point: CGPoint) -> CGFloat {
        point.x * point.x + point.y * point.y
    }
}
