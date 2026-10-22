import UIKit

/// Image source, fit and loading options; aspectRatio is a layout prop.
@MainActor
enum KuitoImageProperties {
    private static let modes: [String: UIView.ContentMode] = [
        "cover": .scaleAspectFill,
        "contain": .scaleAspectFit,
        "fill": .scaleToFill,
        "none": .center,
    ]

    static let setters: [String: KuitoPropertySetter] = [
        "src": { context, value in
            guard let view = context.view as? KuitoImageView else { throw context.unsupportedProp() }

            let source = try source(from: value, context)

            do {
                try view.setSource(source)
            } catch {
                throw context.unsupportedValue(value, error.localizedDescription)
            }
        },
        "objectFit": option({ modes[$0] }) { $0.contentMode = $1 },
        "placeholderColor": image { context, view, value in view.placeholderColor = value == .null ? nil : try context.color(value) },
        "thumbhash": image { context, view, value in
            if value == .null { return view.setThumbHash(nil) }

            guard let hash = KuitoThumbHash(try context.text(value)) else {
                throw context.unsupportedValue(value, "expects a base64 ThumbHash")
            }

            view.setThumbHash(hash)
        },
        "fadeDuration": image { context, view, value in view.transitionDuration = max(try context.number(value), 0) / 1000 },
        // Image's and Symbol's.
        "tintColor": { context, value in
            guard let view = context.view as? KuitoTintable else { throw context.unsupportedProp() }

            view.tint = value == .null ? nil : try context.color(value)
        },
        "cache": option(KuitoImageLoader.CachePolicy.init(rawValue:)) {
            $0.cachePolicy = $1
        },
    ]

    /// A URL string, `{ uri, headers? }`, or a bundled image's `{ asset }`;
    /// a string that is no URL shows no image.
    private static func source(from value: KuitoValue, _ context: KuitoPropertyContext) throws -> KuitoImageSource? {
        if value == .null { return nil }

        switch try context.structure(value, KuitoPropValues.src) {
        case .url(let url): return URL(string: url).map { .remote($0, headers: [:]) }
        case .bundled(let image): return .bundled(image.asset)
        case .remote(let image): return URL(string: image.uri).map { .remote($0, headers: image.headers ?? [:]) }
        }
    }

    /// A string prop with a fixed set of values; any other value is unsupported.
    private static func option<Value>(
        _ parse: @escaping (String) -> Value?,
        _ apply: @escaping @MainActor (KuitoImageView, Value) -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let view = context.view as? KuitoImageView else { throw context.unsupportedProp() }
            guard let option = parse(try context.keyword(value)) else {
                throw context.unsupportedValue(value, "expects one of its values")
            }

            apply(view, option)
        }
    }

    private static func image(
        _ apply: @escaping @MainActor (KuitoPropertyContext, KuitoImageView, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let view = context.view as? KuitoImageView else { throw context.unsupportedProp() }

            try apply(context, view, value)
        }
    }
}
