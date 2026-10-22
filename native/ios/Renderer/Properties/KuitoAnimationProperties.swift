import UIKit

/// Animatable props (opacity, background color, transform), which apply at
/// once: their animations and CSS transitions run on the UI thread, which sets
/// them frame by frame, enter and exit effects too (docs/motion.md). Corners,
/// border color and shadows animate the same way through
/// KuitoDecorationProperties, and width and height through a partial layout
/// (KuitoLayoutNode.relayout). `layout` animates the view's frame changes
/// with a native animator.
@MainActor
enum KuitoAnimationProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "opacity": { context, value in
            let opacity = try context.number(value)
            let style = context.style

            style.opacity = opacity
            context.view.alpha = style.effectiveOpacity
        },
        "backgroundColor": { context, value in
            context.view.backgroundColor = value == .null ? nil : try context.color(value)
        },
        "translateX": transform { $0.translateX = $1 },
        "translateY": transform { $0.translateY = $1 },
        "scale": transform { $0.scale = $1 },
        "scaleX": transform { $0.scaleX = $1 },
        "scaleY": transform { $0.scaleY = $1 },
        "rotate": transform { $0.rotate = $1 },
        "exit": { context, value in
            context.style.exit = try context.flag(value)
        },
        "exited": { context, value in
            context.style.exited = try context.flag(value)
        },
        "layout": { context, value in
            guard value != .null else { return context.style.layout.frameAnimation = nil }

            guard let spec = KuitoAnimationSpec(try context.structure(value, KuitoPropValues.layout)) else {
                throw context.unsupportedValue(value, "expects a timing easing of four numbers")
            }

            context.style.layout.frameAnimation = KuitoFrameAnimation(spec)
        },
    ]

    /// Transform components compose into one CGAffineTransform.
    private static func transform(
        _ assign: @escaping @MainActor (KuitoViewStyle, CGFloat) -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            let style = context.style

            assign(style, try context.number(value))
            context.view.transform = style.transform()
        }
    }
}
