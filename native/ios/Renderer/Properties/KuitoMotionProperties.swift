import UIKit

/// A view that sends its motion source's `motion` events while the app asks (docs/motion.md#motion-sources).
@MainActor
protocol KuitoMotionSource: AnyObject {
    var sendsMotion: Bool { get set }
}

extension KuitoScrollView: KuitoMotionSource {
    var sendsMotion: Bool {
        get { motion.on }
        set { motion.on = newValue }
    }
}

extension KuitoListView: KuitoMotionSource {
    var sendsMotion: Bool {
        get { motion.on }
        set { motion.on = newValue }
    }
}

extension KuitoSheetView: KuitoMotionSource {
    var sendsMotion: Bool {
        get { motion.on }
        set { motion.on = newValue }
    }
}

extension KuitoNavigationStackView: KuitoMotionSource {
    var sendsMotion: Bool {
        get { motion.on }
        set { motion.on = newValue }
    }
}

/// Motion sources: whether a view sends where it moves, every frame.
@MainActor
enum KuitoMotionProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "emitsMotion": { context, value in
            guard let view = context.view as? KuitoMotionSource else { throw context.unsupportedProp() }

            view.sendsMotion = try context.flag(value)
        },
    ]
}
