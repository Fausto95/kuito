import UIKit

/// `ImagePicker` in native/modules/image-picker/image-picker.ts.
final class KuitoImagePickerModule: ImagePickerSpec {
    /// The picker on screen. Pickers hold their delegates weakly, so the
    /// module keeps it until it settles; one at a time, as UIKit presents them.
    private var active: NSObject?

    init(context: KuitoModuleContext) {}

    @MainActor func launchImageLibrary(_ request: MediaPickerRequest, _ promise: KuitoPromise<[MediaAsset]>) {
        let done = settle(promise)
        // PHPicker has no editor; the older picker edits one asset.
        let picker: NSObject & KuitoPicker = request.allowsEditing
            ? KuitoSystemPicker(request, source: .photoLibrary, done: done)
            : KuitoLibraryPicker(request, done: done)

        do {
            try present(picker, popover: true)
        } catch {
            promise.reject(error)
        }
    }

    @MainActor func launchCamera(_ request: MediaPickerRequest, _ promise: KuitoPromise<[MediaAsset]>) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            return promise.reject("ERR_CAMERA_UNAVAILABLE", "This device has no camera (the iOS simulator has none)")
        }

        KuitoPermissions.request(.camera) { response in
            guard response.status == .granted else {
                return promise.reject("ERR_PERMISSION", "The camera permission is \(response.status.rawValue)")
            }

            do {
                try self.present(KuitoSystemPicker(request, source: .camera, done: self.settle(promise)), popover: false)
            } catch {
                promise.reject(error)
            }
        }
    }

    @MainActor
    private func present(_ picker: NSObject & KuitoPicker, popover: Bool) throws {
        guard active == nil else { throw KuitoModuleError("ERR_BUSY", "A picker is already open") }
        guard let host = KuitoPresenter.top() else {
            throw KuitoModuleError("ERR_NO_WINDOW", "There is no window to show the picker in")
        }

        let controller = picker.controller()

        // iPad shows the library as a popover, which needs an anchor.
        if popover, UIDevice.current.userInterfaceIdiom == .pad {
            controller.modalPresentationStyle = .popover
            controller.popoverPresentationController?.sourceView = host.view
            controller.popoverPresentationController?.sourceRect = CGRect(
                x: host.view.bounds.midX, y: host.view.bounds.midY, width: 0, height: 0)
            controller.popoverPresentationController?.permittedArrowDirections = []
        }

        active = picker
        host.present(controller, animated: true)
    }

    /// Settles the call once the picker finishes, from any thread, and lets the picker go.
    private func settle(_ promise: KuitoPromise<[MediaAsset]>) -> (Result<[MediaAsset], Error>) -> Void {
        { [weak self] result in
            DispatchQueue.main.async { self?.active = nil }

            switch result {
            case .success(let assets): promise.resolve(assets)
            case .failure(let error): promise.reject(error)
            }
        }
    }
}

/// A system picker the module presents.
@MainActor
protocol KuitoPicker {
    func controller() -> UIViewController
}

extension KuitoLibraryPicker: KuitoPicker {}
extension KuitoSystemPicker: KuitoPicker {}
