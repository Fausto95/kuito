import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// PHPickerViewController: the photo library without a photo library
/// permission. The picker runs out of process and hands over only what the
/// user picks.
@MainActor
final class KuitoLibraryPicker: NSObject, PHPickerViewControllerDelegate {
    private let request: MediaPickerRequest
    private let done: (Result<[MediaAsset], Error>) -> Void

    init(_ request: MediaPickerRequest, done: @escaping (Result<[MediaAsset], Error>) -> Void) {
        self.request = request
        self.done = done
    }

    func controller() -> UIViewController {
        var configuration = PHPickerConfiguration()
        let filters = (request.images ? [PHPickerFilter.images] : []) + (request.videos ? [.videos] : [])

        configuration.filter = filters.count == 1 ? filters[0] : .any(of: filters)
        configuration.selectionLimit = Int(request.selectionLimit)
        // The file as it is in the library: no transcoding before it reaches the app.
        configuration.preferredAssetRepresentationMode = .current

        let picker = PHPickerViewController(configuration: configuration)

        picker.delegate = self

        return picker
    }

    nonisolated func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        let request = request
        let providers = results.map(\.itemProvider)

        MainActor.assumeIsolated { picker.dismiss(animated: true) }

        Task.detached(priority: .userInitiated) { [done] in
            do {
                var assets: [MediaAsset] = []

                for provider in providers { assets.append(try await Self.asset(provider, request)) }

                done(.success(assets))
            } catch {
                done(.failure(error))
            }
        }
    }

    private nonisolated static func asset(_ provider: NSItemProvider, _ request: MediaPickerRequest) async throws -> MediaAsset {
        let video = provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
        let type = video ? UTType.movie : UTType.image
        let name = provider.suggestedName
        // The provider's file lives only during its callback: move it somewhere that lasts.
        let file = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
                guard let url else {
                    return continuation.resume(throwing: error ?? KuitoModuleError("ERR_IMAGE", "The picked item has no file"))
                }

                do {
                    let kept = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).\(url.pathExtension)")

                    try FileManager.default.copyItem(at: url, to: kept)
                    continuation.resume(returning: kept)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }

        defer { try? FileManager.default.removeItem(at: file) }

        return video
            ? try await KuitoPickedMedia.video(movingFrom: file, named: name)
            : try KuitoPickedMedia.image(at: file, named: name, request)
    }
}
