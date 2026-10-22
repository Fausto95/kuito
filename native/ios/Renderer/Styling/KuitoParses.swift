import Foundation

/// Prop values the renderer turned from text into a value: a number, a color,
/// a flag, an enum, JSON. The host batch types every value, so only a native
/// module view, whose props arrive as scalars, pays a parse; the performance
/// monitor shows them per commit. Main thread only.
public enum KuitoParses {
    public nonisolated(unsafe) private(set) static var count = 0

    /// `value`, counted when it is text about to be parsed.
    static func of<T>(_ value: T) -> T {
        if value is String { count += 1 }

        return value
    }
}
