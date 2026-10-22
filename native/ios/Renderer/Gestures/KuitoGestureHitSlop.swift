// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/RNGestureHandler.mm and
// src/handlers/hitSlop.ts), MIT License, Copyright (c) 2016 Software Mansion.

import CoreGraphics

/// How far a gesture's hit area reaches past its view's bounds. An unset edge
/// is NaN; `width` and `height` are absolute sizes measured from the set edge.
struct KuitoGestureHitSlop {
    var left = CGFloat.nan, top = CGFloat.nan, right = CGFloat.nan, bottom = CGFloat.nan
    var width = CGFloat.nan, height = CGFloat.nan

    static let empty = KuitoGestureHitSlop()

    private init() {}

    /// A number for every edge, or `{ left, top, right, bottom, width, height,
    /// horizontal, vertical }` where an edge wins over its axis shorthand.
    init?(_ value: KuitoGestureConfigEntryValue) {
        let edges: KuitoHitSlopEdgesValue

        switch value {
        case .number(let number):
            let edge = CGFloat(number)

            left = edge
            top = edge
            right = edge
            bottom = edge

            return
        case .flag:
            return nil
        case .edges(let value):
            edges = value
        }

        let edge = { (value: Double?) in value.map { CGFloat($0) } }

        left = edge(edges.left ?? edges.horizontal) ?? .nan
        top = edge(edges.top ?? edges.vertical) ?? .nan
        right = edge(edges.right ?? edges.horizontal) ?? .nan
        bottom = edge(edges.bottom ?? edges.vertical) ?? .nan
        width = edge(edges.width) ?? .nan
        height = edge(edges.height) ?? .nan

        // `width` and `height` are sizes, not deltas, and need an edge to measure from.
        if width < 0 || height < 0 { return nil }
        if !width.isNaN, left.isNaN == right.isNaN { return nil }
        if !height.isNaN, top.isNaN == bottom.isNaN { return nil }
    }

    var isSet: Bool { !left.isNaN || !right.isNaN || !top.isNaN || !bottom.isNaN }

    func inset(_ bounds: CGRect) -> CGRect {
        var rect = bounds

        rect.origin.x -= inset(left)
        rect.origin.y -= inset(top)

        if !width.isNaN {
            if !right.isNaN {
                rect.origin.x = rect.size.width - width + inset(right)
            }
            rect.size.width = width
        } else {
            rect.size.width += inset(left) + inset(right)
        }
        if !height.isNaN {
            if !bottom.isNaN {
                rect.origin.y = rect.size.height - height + inset(bottom)
            }
            rect.size.height = height
        } else {
            rect.size.height += inset(top) + inset(bottom)
        }
        return rect
    }

    private func inset(_ edge: CGFloat) -> CGFloat { edge.isNaN ? 0 : edge }
}
