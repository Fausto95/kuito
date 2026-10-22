import Foundation

/// `Fonts` in native/modules/fonts/fonts.ts: registers font files into
/// KuitoFonts, which the text renderer resolves `fontFamily` through.
final class KuitoFontsModule: FontsSpec {
    init(context: KuitoModuleContext) {}

    func isLoaded(_ family: String) -> Bool {
        KuitoFonts.shared.isRegistered(family)
    }

    func load(_ faces: [FontFace]) throws {
        for face in faces {
            guard let url = URL(string: face.uri), url.isFileURL else {
                throw KuitoModuleError("ERR_URI", "'\(face.uri)' is not a file:// URI")
            }

            guard FileManager.default.fileExists(atPath: url.path) else {
                throw KuitoModuleError("ERR_NOT_FOUND", "No font file at \(face.uri)")
            }

            do {
                try KuitoFonts.shared.register(family: face.family, weight: Int(face.weight),
                                                italic: face.style == .italic, url: url)
            } catch {
                throw KuitoModuleError("ERR_FONT", error.localizedDescription)
            }
        }
    }
}
