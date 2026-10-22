import AVFoundation
import UIKit

/// CameraView: a live preview of its session. The camera runs while the view
/// is on screen, the app is in the foreground and the app hasn't paused it;
/// it stops otherwise, and lets the device go when Kuito unmounts the view.
final class KuitoCameraView: UIView, KuitoNativeView, KuitoCameraSession.Delegate {
    private enum Access {
        case unknown, asking, granted, denied
    }

    var configuration = KuitoCameraSession.Configuration() {
        didSet { if configuration != oldValue { update() } }
    }

    private let events: KuitoViewEvents
    private let session = KuitoCameraSession()
    private let preview = AVCaptureVideoPreviewLayer()
    private var access = Access.unknown
    private var paused = false
    private var wanted = false
    /// Between the session starting and the view stopping it.
    private var running = false
    private var lifecycle: UUID?
    private var unmounted = false
    /// The codes in view, so each is reported once as it comes into view.
    private var scanned: Set<String> = []
    /// Reported once until the camera starts again: updates retry what failed.
    private var failure: KuitoCameraSession.Failure?

    init(events: KuitoViewEvents) {
        self.events = events
        super.init(frame: .zero)
        clipsToBounds = true
        backgroundColor = .black
        preview.videoGravity = .resizeAspectFill
        layer.addSublayer(preview)
        session.delegate = self
        lifecycle = KuitoAppLifecycle.shared.observe { [weak self] event in
            guard case .changed = event else { return }

            MainActor.assumeIsolated { self?.update() }
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        preview.frame = bounds
        preview.connection?.videoOrientation = orientation
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        update()
    }

    /// Kuito removed the view, or the runtime is reloading: an open
    /// recording finishes and resolves.
    func unmount() {
        unmounted = true
        running = false
        lifecycle.map(KuitoAppLifecycle.shared.cancel)
        lifecycle = nil
        session.release()
    }

    // MARK: Functions

    func takePicture(_ options: PictureOptions?, _ promise: KuitoPromise<CameraPicture>) {
        session.takePicture(quality: options?.quality ?? 1, bytes: options?.bytes ?? false,
                            orientation: orientation, promise)
    }

    func startRecording(_ options: RecordingOptions?, _ promise: KuitoPromise<CameraRecording>) {
        // Checked before the microphone prompt, which would otherwise come first.
        guard configuration.mode == .video else {
            return promise.reject("ERR_MODE", "set mode=\"video\" on the CameraView first")
        }
        guard running else {
            return promise.reject("ERR_NOT_READY", "the camera isn't running; wait for onReady")
        }
        guard !configuration.mute else {
            return session.startRecording(maxDuration: options?.maxDuration, orientation: orientation, promise)
        }
        guard Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil else {
            return promise.reject("ERR_PERMISSION",
                "add permissions.microphone to kuito.config.ts, or record with mute")
        }

        KuitoPermissions.request(.microphone) { [weak self] response in
            guard response.status == .granted else {
                return promise.reject("ERR_PERMISSION",
                    "the microphone permission is \(response.status.rawValue); record with mute, or ask again")
            }
            guard let self else {
                return promise.reject("ERR_VIEW_NOT_FOUND", "the camera unmounted")
            }

            session.startRecording(maxDuration: options?.maxDuration, orientation: orientation, promise)
        }
    }

    func stopRecording(_ promise: KuitoPromise<CameraRecording>) {
        session.stopRecording(promise)
    }

    func pausePreview() {
        // A disabled connection keeps the last frame on screen while the camera stops.
        preview.connection?.isEnabled = false
        paused = true
        update()
    }

    func resumePreview() {
        preview.connection?.isEnabled = true
        paused = false
        update()
    }

    // MARK: Session

    func cameraStarted() {
        // Only once it runs: on a device without a camera, a preview of an
        // unconfigured session reports a runtime error.
        if preview.session == nil { preview.session = session.session }

        running = true
        failure = nil
        events.emit("ready")
    }

    func cameraFailed(_ failure: KuitoCameraSession.Failure) {
        running = false

        guard failure != self.failure else { return }

        self.failure = failure
        events.emit("error", failure)
    }

    func cameraScanned(_ objects: [AVMetadataMachineReadableCodeObject]) {
        var visible: Set<String> = []

        for object in objects {
            guard let data = object.stringValue, let type = KuitoBarcodeType(object.type) else { continue }

            let key = type.rawValue + "\u{1F}" + data

            visible.insert(key)

            guard !scanned.contains(key), let frame = preview.transformedMetadataObject(for: object)?.bounds else { continue }

            events.emit("barcode", KuitoCameraSession.Barcode(
                format: type.rawValue, data: data,
                bounds: .init(x: frame.minX, y: frame.minY, width: frame.width, height: frame.height)))
        }

        scanned = visible
    }

    /// Runs the session when it should run, asking for the camera the first
    /// time it should, and again each time it comes back after a denial.
    private func update() {
        guard !unmounted else { return }

        let should = window != nil && KuitoAppLifecycle.shared.state != .background && !paused
        let returning = should && !wanted

        wanted = should

        if returning, access == .denied || access == .unknown { return ask() }

        guard access == .granted else { return }

        if !should { running = false }

        session.apply(configuration, running: should)
    }

    private func ask() {
        guard Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil else {
            access = .denied
            return cameraFailed(.init(code: "ERR_PERMISSION",
                message: "CameraView: add permissions.camera to kuito.config.ts; iOS needs its reason to ask"))
        }

        access = .asking
        KuitoPermissions.request(.camera) { [weak self] response in
            guard let self else { return }

            access = response.status == .granted ? .granted : .denied

            if access == .denied {
                cameraFailed(.init(code: "ERR_PERMISSION",
                    message: "Camera access is \(response.status.rawValue). Ask with permissions.request('camera'), or send the user to app.openSettings()"))
            }

            update()
        }
    }

    /// Previews, pictures and videos stand the way the interface does.
    private var orientation: AVCaptureVideoOrientation {
        switch window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: .landscapeLeft
        case .landscapeRight: .landscapeRight
        case .portraitUpsideDown: .portraitUpsideDown
        default: .portrait
        }
    }
}
