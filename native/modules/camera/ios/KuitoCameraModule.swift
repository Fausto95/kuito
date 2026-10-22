import UIKit

/// `Camera` in native/modules/camera/camera.ts: a view and the methods its
/// ref calls. Each view owns its capture session (KuitoCameraView).
final class KuitoCameraModule: CameraSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoCameraView.self) { view in
            view.prop("facing") { (camera, value: KuitoCameraFacing?) in camera.configuration.facing = value ?? .back }
            view.prop("mode") { (camera, value: KuitoCameraMode?) in camera.configuration.mode = value ?? .picture }
            view.prop("flash") { (camera, value: KuitoCameraFlash?) in camera.configuration.flash = value ?? .off }
            view.prop("torch") { (camera, value: Bool?) in camera.configuration.torch = value ?? false }
            view.prop("zoom") { (camera, value: Double?) in camera.configuration.zoom = value ?? 0 }
            view.prop("mute") { (camera, value: Bool?) in camera.configuration.mute = value ?? false }
            view.prop("barcodes") { (camera, value: [KuitoBarcodeType]?) in
                camera.configuration.barcodeTypes = value ?? []
            }
        }
    }

    @MainActor func takePicture(_ view: UIView, _ options: PictureOptions?, _ promise: KuitoPromise<CameraPicture>) {
        settle(promise) { try camera(view).takePicture(options, promise) }
    }

    @MainActor func startRecording(
        _ view: UIView, _ options: RecordingOptions?, _ promise: KuitoPromise<CameraRecording>
    ) {
        settle(promise) { try camera(view).startRecording(options, promise) }
    }

    @MainActor func stopRecording(_ view: UIView, _ promise: KuitoPromise<CameraRecording>) {
        settle(promise) { try camera(view).stopRecording(promise) }
    }

    @MainActor func pausePreview(_ view: UIView) throws {
        try camera(view).pausePreview()
    }

    @MainActor func resumePreview(_ view: UIView) throws {
        try camera(view).resumePreview()
    }

    @MainActor private func camera(_ view: UIView) throws -> KuitoCameraView {
        guard let camera = view as? KuitoCameraView else {
            throw KuitoModuleError(KuitoErrorCode.viewNotFound, "The view is not a Camera")
        }

        return camera
    }

    /// A callback method can't throw: a view that isn't a Camera rejects its promise.
    @MainActor private func settle<Value>(_ promise: KuitoPromise<Value>, _ call: () throws -> Void) {
        do { try call() } catch { promise.reject(error) }
    }
}
