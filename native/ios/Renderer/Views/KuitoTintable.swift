import UIKit

/// A view `tintColor` recolors: an Image's opaque pixels, a Symbol.
@MainActor
protocol KuitoTintable: AnyObject {
    var tint: UIColor? { get set }
}
