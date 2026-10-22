// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/RNGestureHandlerRegistry.m),
// MIT License, Copyright (c) 2016 Software Mansion.

/// Every bound gesture by tag, and the relations between them (`waitFor`,
/// `simultaneousHandlers`, `blocksHandlers`), which may name gestures on other
/// views. Views own their handlers; the registry only indexes them.
@MainActor
enum KuitoGestureRegistry {
    private struct Entry {
        weak var handler: KuitoGestureHandler?
    }

    private static var handlers: [Int: Entry] = [:]
    static let relations = KuitoGestureRelationTable()

    static func handler(withTag tag: Int) -> KuitoGestureHandler? { handlers[tag]?.handler }

    static func register(_ handler: KuitoGestureHandler) {
        handlers[handler.tag] = Entry(handler: handler)
    }

    /// A tag may already belong to a newer handler (a gesture moved to another
    /// view within one batch): only the registered handler drops its tag.
    static func drop(_ handler: KuitoGestureHandler) {
        guard handlers[handler.tag]?.handler === handler else { return }

        handlers[handler.tag] = nil
        relations.drop(handler.tag)
    }
}
