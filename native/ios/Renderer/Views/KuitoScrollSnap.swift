import CoreGraphics

/// Where a drag on a snapping scroll view comes to rest; Android's
/// KuitoScrollSnap follows the same rule.
enum KuitoScrollSnap {
    /// The point nearest where scrolling would stop (`projected`), moving on
    /// to the next one in the fling's direction rather than back behind where
    /// the finger let go (`current`). The start and the end are points too,
    /// so content past the last one stays reachable.
    static func restingOffset(points: [CGFloat], current: CGFloat, projected: CGFloat, velocity: CGFloat, maximum: CGFloat) -> CGFloat {
        let resting = Set(points.map { min(max($0, 0), maximum) } + [0, maximum]).sorted()
        let nearest = resting.min { abs($0 - projected) < abs($1 - projected) } ?? 0

        if velocity > 0, nearest < current { return resting.first { $0 >= current } ?? nearest }

        if velocity < 0, nearest > current { return resting.last { $0 <= current } ?? nearest }

        return nearest
    }
}
