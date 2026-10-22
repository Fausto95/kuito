import UIKit

/// Visibility, padding, size, position and flexbox layout, applied to the
/// view's node in the shared layout engine (native/shared/layout).
@MainActor
enum KuitoLayoutProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "hidden": layout { context, value in context.view.isHidden = value == .bool(true) },
        "padding": layout(),
        "paddingTop": layout(),
        "paddingRight": layout(),
        "paddingBottom": layout(),
        "paddingLeft": layout(),
        "paddingInlineStart": layout(),
        "paddingInlineEnd": layout(),
        "width": layout(),
        "height": layout(),
        "minWidth": layout(),
        "maxWidth": layout(),
        "minHeight": layout(),
        "maxHeight": layout(),
        "aspectRatio": layout(),
        "alignItems": layout(),
        "justifyContent": layout(),
        // A list spaces its rows and a grid's columns by its gaps, as a flex
        // container would; a stylesheet's `gap` arrives as the two longhands.
        "gap": layout { context, value in
            guard let list = context.view as? KuitoListView else { return }

            let gap = max(value.points, 0)

            list.rowGap = gap
            list.columnGap = gap
        },
        "position": layout(),
        "top": layout(),
        "right": layout(),
        "bottom": layout(),
        "left": layout(),
        "insetInlineStart": layout(),
        "insetInlineEnd": layout(),
        "margin": layout(),
        "marginTop": layout(),
        "marginRight": layout(),
        "marginBottom": layout(),
        "marginLeft": layout(),
        "marginInlineStart": layout(),
        "marginInlineEnd": layout(),
        "rowGap": layout { context, value in (context.view as? KuitoListView)?.rowGap = max(value.points, 0) },
        "columnGap": layout { context, value in (context.view as? KuitoListView)?.columnGap = max(value.points, 0) },
        "flexDirection": layout(),
        "flexWrap": layout(),
        "flexLineCount": layout(),
        "flexGrow": layout(),
        "flexShrink": layout(),
        "flexBasis": layout(),
        "flex": layout(),
        "alignSelf": layout(),
        "alignContent": layout(),
        // Views inherit it, the pages in them included: every one in the window lays out again.
        "direction": layout { context, _ in context.view.window?.layOutEveryView() },
        "boxSizing": layout(),
    ]

    /// Decoration props that also lay out: a border insets content, and
    /// overflow decides whether an item may shrink below its content.
    static func alsoLayOut(_ context: KuitoPropertyContext, _ value: KuitoValue) throws {
        try set(context.style.layout, context.key, value, changing: false)
    }

    /// The engine validates the value; `apply` mirrors it onto the view when
    /// UIKit draws it too. A driven value leaves the node for the renderer
    /// to lay out at once (KuitoLayoutNode.relayout).
    private static func layout(
        _ apply: (@MainActor (KuitoPropertyContext, KuitoValue) -> Void)? = nil
    ) -> KuitoPropertySetter {
        { context, value in
            try change(context.style, context.key, value)
            apply?(context, value)
        }
    }

    /// Sets a layout prop on the node; a driven one without marking it dirty.
    static func change(_ style: KuitoViewStyle, _ key: UInt16, _ value: KuitoValue) throws {
        try set(style.layout, key, value, changing: style.driven)
    }

    /// Hands the engine the prop by key and its value as the batch typed it:
    /// a number, a boolean as 0 or 1, an enum's index, or a length's text read
    /// in place. Nothing else is a layout value: it resets the prop.
    static func set(_ node: KuitoLayoutNode, _ key: UInt16, _ value: KuitoValue, changing: Bool) throws {
        let write = changing ? node.changeProperty(_:value:) : node.setProperty(_:value:)

        switch value {
        case .number(let number):
            try write(key, KuitoLayoutValue(kind: .number, number: number, index: 0, text: nil, textLength: 0))
        case .bool(let flag):
            try write(key, KuitoLayoutValue(kind: .number, number: flag ? 1 : 0, index: 0, text: nil, textLength: 0))
        case .enumValue(let index, _):
            try write(key, KuitoLayoutValue(kind: .enum, number: 0, index: index, text: nil, textLength: 0))
        case .text(var text):
            try text.withUTF8 { bytes in
                try bytes.withMemoryRebound(to: CChar.self) { chars in
                    try write(key, KuitoLayoutValue(kind: .text, number: 0, index: 0, text: chars.baseAddress, textLength: chars.count))
                }
            }
        case .null, .color, .json, .keys, .structure:
            try write(key, KuitoLayoutValue(kind: .null, number: 0, index: 0, text: nil, textLength: 0))
        }
    }
}
