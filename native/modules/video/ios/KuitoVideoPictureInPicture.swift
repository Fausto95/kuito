import AVKit

/// A Video's picture in picture, from its AVPlayerLayer. The system needs
/// the audio background mode for it (`ios.backgroundModes: ['audio']`) and a
/// `.playback` audio session, which Audio's default mode is.
@MainActor
final class KuitoVideoPictureInPicture: NSObject, AVPictureInPictureControllerDelegate {
    private let layer: AVPlayerLayer
    private let changed: (Bool) -> Void
    private var controller: AVPictureInPictureController?
    private var possible: NSKeyValueObservation?
    private var starting: ((Error?) -> Void)?
    private var stopping: (() -> Void)?
    private(set) var active = false

    init(layer: AVPlayerLayer, changed: @escaping (Bool) -> Void) {
        self.layer = layer
        self.changed = changed
    }

    func start(_ done: @escaping (Error?) -> Void) {
        guard !active else { return done(nil) }

        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            return done(KuitoModuleError("ERR_UNSUPPORTED", "This device has no picture in picture"))
        }

        guard Self.declaresBackgroundAudio else {
            return done(KuitoModuleError("ERR_PICTURE_IN_PICTURE",
                "Picture in picture needs the audio background mode: add ios.backgroundModes: ['audio'] to kuito.config.ts"))
        }

        let controller = self.controller ?? AVPictureInPictureController(playerLayer: layer)

        guard let controller else {
            return done(KuitoModuleError("ERR_PICTURE_IN_PICTURE", "Picture in picture is not available for this video"))
        }

        controller.delegate = self
        self.controller = controller
        starting = done

        // A new controller becomes possible a moment after it gets its layer.
        if controller.isPictureInPicturePossible { return controller.startPictureInPicture() }

        possible = controller.observe(\.isPictureInPicturePossible) { [weak self] controller, _ in
            guard controller.isPictureInPicturePossible else { return }

            DispatchQueue.main.async {
                self?.possible = nil
                controller.startPictureInPicture()
            }
        }
    }

    func stop(_ done: @escaping () -> Void) {
        guard active, let controller else { return done() }

        stopping = done
        controller.stopPictureInPicture()
    }

    nonisolated func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            active = true
            changed(true)
            starting?(nil)
            starting = nil
        }
    }

    nonisolated func pictureInPictureController(
        _ controller: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error
    ) {
        DispatchQueue.main.async { [weak self] in
            self?.starting?(KuitoModuleError("ERR_PICTURE_IN_PICTURE", error.localizedDescription))
            self?.starting = nil
        }
    }

    nonisolated func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            active = false
            changed(false)
            stopping?()
            stopping = nil
        }
    }

    /// The video is still on screen in the app: it takes the picture back as is.
    nonisolated func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(true)
    }

    private static var declaresBackgroundAudio: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("audio") ?? false
    }
}
