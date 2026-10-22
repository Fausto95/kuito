import Foundation

/// One entry of the `gestures` prop (docs/motion.md, "Native contract"),
/// validated: a config of its type's keys, relations by tag.
@MainActor
struct KuitoGestureSpec {
    let tag: Int
    let type: KuitoGestureType
    let config: KuitoGestureConfig
    let relations: KuitoGestureRelations

    /// The view's gestures; nil, the prop unset, is none.
    static func parse(_ values: [KuitoGestureSpecValue]?) throws -> [KuitoGestureSpec] {
        let specs = try (values ?? []).map(KuitoGestureSpec.init)

        guard Set(specs.map(\.tag)).count == specs.count else { throw KuitoRenderError.Rejection("gestures repeat a tag") }

        return specs
    }

    private init(_ value: KuitoGestureSpecValue) throws {
        let type = KuitoGestureType(value.type)

        tag = value.tag
        self.type = type
        config = try KuitoGestureConfig(value.config ?? [:], keys: type.configKeys, gesture: "gesture \(value.tag) (\(type.name))")
        relations = KuitoGestureRelations(
            waitFor: value.waitFor ?? [],
            simultaneousHandlers: value.simultaneousHandlers ?? [],
            blocksHandlers: value.blocksHandlers ?? []
        )
    }
}
