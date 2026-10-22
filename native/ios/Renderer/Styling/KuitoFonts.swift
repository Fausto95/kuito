import CoreText
import UIKit

/// The fonts `fontFamily` names beyond the system's: the app's bundled fonts
/// (`fonts/fonts.json`, written by src/cli/fonts.ts and registered by
/// UIAppFonts) and those `fonts.load` registers. One per process, as
/// CoreText's registrations are; read from the main and JS threads.
final class KuitoFonts: @unchecked Sendable {
    struct Face {
        let weight: Int
        let italic: Bool
        let postScriptName: String
    }

    private struct Bundled: Decodable {
        let family: String
        let weight: Int
        let style: String
        let file: String
    }

    struct LoadError: LocalizedError {
        let errorDescription: String?
    }

    static let shared = KuitoFonts()

    private let lock = NSLock()
    private var families: [String: [Face]] = [:]

    private init() {
        guard let manifest = Bundle.main.url(forResource: "fonts", withExtension: "json", subdirectory: "fonts"),
              let data = try? Data(contentsOf: manifest),
              let bundled = try? JSONDecoder().decode([Bundled].self, from: data)
        else { return }

        for font in bundled {
            let file = manifest.deletingLastPathComponent().appendingPathComponent(font.file)

            if let name = Self.postScriptName(file) {
                add(font.family, Face(weight: font.weight, italic: font.style == "italic", postScriptName: name))
            }
        }
    }

    /// Registers the font file at `url` as one face of `family`.
    func register(family: String, weight: Int, italic: Bool, url: URL) throws {
        var error: Unmanaged<CFError>?

        if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error), let failure = error?.takeRetainedValue() {
            let code = CTFontManagerError(rawValue: CFErrorGetCode(failure))

            // Loading a font twice, or one with a registered name, keeps the first.
            guard code == .alreadyRegistered || code == .duplicatedName else {
                throw LoadError(errorDescription: "\(url.lastPathComponent) is not a font iOS can load: \(failure)")
            }
        }

        guard let name = Self.postScriptName(url), UIFont(name: name, size: 12) != nil else {
            throw LoadError(errorDescription: "\(url.lastPathComponent) is not a font iOS can load")
        }

        lock.lock()
        add(family, Face(weight: weight, italic: italic, postScriptName: name))
        lock.unlock()
    }

    /// Whether `family` was bundled or loaded.
    func isRegistered(_ family: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }

        return families[family] != nil
    }

    /// Whether `fontFamily` takes `family`: registered here, or a family or font name of the system's.
    func has(_ family: String) -> Bool {
        isRegistered(family) || UIFont.familyNames.contains(family) || UIFont(name: family, size: 12) != nil
    }

    /// The registered face of `family` nearest `weight` and `italic`, or nil for a system family.
    func font(family: String, weight: Int, italic: Bool, size: CGFloat) -> UIFont? {
        lock.lock()
        let faces = families[family]
        lock.unlock()

        return faces.flatMap { Self.match($0, weight: weight, italic: italic) }
            .flatMap { UIFont(name: $0.postScriptName, size: size) }
    }

    static func missing(_ family: String) -> String {
        "no font family \"\(family)\": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)"
    }

    /// The face CSS would pick: the requested style if the family has it, then
    /// the nearest weight in the direction CSS Fonts 4 searches (§5.2).
    static func match(_ faces: [Face], weight: Int, italic: Bool) -> Face? {
        let styled = faces.filter { $0.italic == italic }

        return (styled.isEmpty ? faces : styled).min { rank($0.weight, weight) < rank($1.weight, weight) }
    }

    /// Lower is nearer. 400 and 500 look up to 500 first, then lighter, then
    /// heavier; lighter weights look lighter first, heavier ones heavier.
    private static func rank(_ candidate: Int, _ desired: Int) -> Int {
        switch desired {
        case 400...500:
            if candidate >= desired, candidate <= 500 { return candidate - desired }

            return candidate < desired ? 1000 + desired - candidate : 2000 + candidate - desired
        case ..<400:
            return candidate <= desired ? desired - candidate : 1000 + candidate - desired
        default:
            return candidate >= desired ? candidate - desired : 1000 + desired - candidate
        }
    }

    private func add(_ family: String, _ face: Face) {
        families[family, default: []].removeAll { $0.weight == face.weight && $0.italic == face.italic }
        families[family, default: []].append(face)
    }

    private static func postScriptName(_ url: URL) -> String? {
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
              let first = descriptors.first
        else { return nil }

        return CTFontDescriptorCopyAttribute(first, kCTFontNameAttribute) as? String
    }
}
