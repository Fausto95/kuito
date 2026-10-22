/// A gesture type: the config keys it takes and how to make its handler.
@MainActor
struct KuitoGestureType {
    let name: String
    let configKeys: [String: KuitoGestureConfig.Kind]
    let make: @MainActor (Int) -> KuitoGestureHandler

    init(_ type: KuitoGestureTypeValue) {
        name = type.rawValue

        switch type {
        case .pan: (configKeys, make) = (KuitoPanGestureHandler.configKeys, KuitoPanGestureHandler.init)
        case .tap: (configKeys, make) = (KuitoTapGestureHandler.configKeys, KuitoTapGestureHandler.init)
        case .longPress: (configKeys, make) = (KuitoLongPressGestureHandler.configKeys, KuitoLongPressGestureHandler.init)
        case .pinch: (configKeys, make) = (KuitoPinchGestureHandler.configKeys, KuitoPinchGestureHandler.init)
        case .rotation: (configKeys, make) = (KuitoRotationGestureHandler.configKeys, KuitoRotationGestureHandler.init)
        case .fling: (configKeys, make) = (KuitoFlingGestureHandler.configKeys, KuitoFlingGestureHandler.init)
        }
    }
}
