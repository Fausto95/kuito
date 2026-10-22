import Foundation

/// The directories FileSystem may touch, and the check every URI passes
/// before it does: reads stay in the document, cache and bundle directories,
/// writes inside the document and cache directories only.
struct KuitoSandbox {
    enum Access { case read, write }

    let document: URL
    let cache: URL
    let bundle: URL

    static let app: KuitoSandbox = {
        let files = FileManager.default

        // FileManager and Bundle always have these; the force is the platform's contract.
        return KuitoSandbox(
            document: files.urls(for: .documentDirectory, in: .userDomainMask)[0].standardizedFileURL,
            cache: files.urls(for: .cachesDirectory, in: .userDomainMask)[0].standardizedFileURL,
            bundle: Bundle.main.bundleURL.standardizedFileURL)
    }()

    /// The file `uri` names, after `..` is resolved. A write must land strictly
    /// inside a writable directory, so the directories themselves can't be
    /// deleted or replaced.
    func url(_ uri: String, _ access: Access) throws -> URL {
        guard let url = URL(string: uri), url.isFileURL else {
            throw KuitoModuleError("ERR_URI", "'\(uri)' is not a file:// URI")
        }

        let path = url.standardizedFileURL.path
        let inside = { (root: URL, strictly: Bool) in
            path.hasPrefix(root.path + "/") || (!strictly && path == root.path)
        }

        switch access {
        case .read where [document, cache, bundle].contains(where: { inside($0, false) }):
            return URL(fileURLWithPath: path)
        case .write where [document, cache].contains(where: { inside($0, true) }):
            return URL(fileURLWithPath: path)
        case .write where inside(bundle, false):
            throw KuitoModuleError("ERR_SANDBOX", "\(uri) is in the app bundle, which is read-only")
        default:
            throw KuitoModuleError("ERR_SANDBOX",
                "\(uri) is outside the app's sandbox: use a URI under documentDirectory or cacheDirectory")
        }
    }
}
