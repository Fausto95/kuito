import UIKit

/// Sheet presentation: open state, how it presents, snap points and chrome.
@MainActor
enum KuitoSheetProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "open": on(KuitoSheetView.self) { context, view, value in view.open = try context.flag(value) },
        "snapPoints": on(KuitoSheetView.self) { context, view, value in
            let points = try context.structure(value, KuitoPropValues.snapPoints).map { point in
                guard let point = KuitoSnapPoint(point) else {
                    throw context.unsupportedValue(value, "expects heights in points, percentages such as \"50%\", or \"content\"")
                }

                return point
            }

            view.snapPoints = points.isEmpty ? [.content] : points
        },
        "grabber": on(KuitoSheetView.self) { context, view, value in view.grabber = try context.flag(value) },
        "dismissible": on(KuitoSheetView.self) { context, view, value in
            view.dismissible = try context.flag(value)
        },
        "sheetCornerRadius": on(KuitoSheetView.self) { context, view, value in
            view.cornerRadius = value == .null ? nil : try context.number(value)
        },
        "presentation": on(KuitoSheetView.self) { context, view, value in
            guard let presentation = KuitoSheetPresentation(rawValue: try context.keyword(value)) else {
                throw context.unsupportedValue(value, "expects one of its values")
            }

            view.presentation = presentation
        },
    ]
}
