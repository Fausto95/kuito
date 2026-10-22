import UIKit
import UniformTypeIdentifiers

/// UIImagePickerController: the camera, and the library when the user edits
/// what they pick (PHPicker has no editor). One asset at a time.
@MainActor
final class KuitoSystemPicker: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private let request: MediaPickerRequest
    private let source: UIImagePickerController.SourceType
    private let done: (Result<[MediaAsset], Error>) -> Void

    init(_ request: MediaPickerRequest, source: UIImagePickerController.SourceType,
         done: @escaping (Result<[MediaAsset], Error>) -> Void) {
        self.request = request
        self.source = source
        self.done = done
    }

    func controller() -> UIViewController {
        let picker = UIImagePickerController()

        picker.sourceType = source
        picker.mediaTypes = (request.images ? [UTType.image.identifier] : []) + (request.videos ? [UTType.movie.identifier] : [])
        picker.allowsEditing = request.allowsEditing
        picker.videoQuality = .typeHigh
        picker.delegate = self

        return picker
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        done(.success([]))
    }

    func imagePickerController(_ picker: UIImagePickerController,
                               didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let request = request
        let image = (info[.editedImage] ?? info[.originalImage]) as? UIImage
        let video = info[.mediaURL] as? URL
        let name = (info[.imageURL] as? URL)?.lastPathComponent

        picker.dismiss(animated: true)

        Task.detached(priority: .userInitiated) { [done] in
            do {
                if let video {
                    done(.success([try await KuitoPickedMedia.video(movingFrom: video, named: nil)]))
                } else if let image {
                    done(.success([try KuitoPickedMedia.image(image, named: name, request)]))
                } else {
                    throw KuitoModuleError("ERR_IMAGE", "The picker returned neither an image nor a video")
                }
            } catch {
                done(.failure(error))
            }
        }
    }
}
