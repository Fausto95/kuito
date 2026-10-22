import UIKit

/// A container's page: a layout root sized by the platform's container,
/// titled in its header or bar item.
@MainActor
protocol KuitoPage: KuitoLayoutRoot {
    var title: String? { get set }
}
