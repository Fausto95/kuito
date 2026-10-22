// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/RNGestureHandlerPointerType.h),
// MIT License, Copyright (c) 2016 Software Mansion.

import UIKit

/// What drove a gesture, as `gesture` events report it; the numbers are RNGH's.
enum KuitoGesturePointerType: Int {
    case touch = 0
    case stylus
    case mouse
    case key
    case other

    init(_ event: UIEvent) {
        switch event.allTouches?.first?.type {
        case .direct: self = .touch
        case .pencil: self = .stylus
        case .indirectPointer: self = .mouse
        default: self = .other
        }
    }
}
