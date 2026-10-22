import UIKit

/// SafeAreaView's edges: a list of `top`, `right`, `bottom`, `left`.
@MainActor
enum KuitoSafeAreaProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "edges": on(KuitoSafeAreaView.self) { context, view, value in
            view.edges = Set(try context.structure(value, KuitoPropValues.edges))
        },
    ]
}
