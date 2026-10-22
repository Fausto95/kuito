// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/RNGestureHandlerState.h),
// MIT License, Copyright (c) 2016 Software Mansion.

/// A gesture's state as `gesture` events report it; the numbers are RNGH's.
enum KuitoGestureState: Int {
    case undetermined = 0
    case failed
    case began
    case cancelled
    case active
    case end
}
