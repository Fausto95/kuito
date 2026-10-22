import AVFoundation
import UIKit

/// One view's capture session. AVFoundation blocks while it configures and
/// starts, so everything touching the session runs on `queue`, never on the
/// main thread; the view hears back through `delegate`, on the main thread.
final class KuitoCameraSession: NSObject, @unchecked Sendable {
    /// What the view asks for. The session applies only what changed.
    struct Configuration: Equatable {
        var facing = KuitoCameraFacing.back
        var mode = KuitoCameraMode.picture
        var mute = false
        var flash = KuitoCameraFlash.off
        var torch = false
        var zoom = 0.0
        var barcodeTypes: [KuitoBarcodeType] = []
    }

    struct Barcode: Encodable {
        struct Bounds: Encodable {
            let x: Double, y: Double, width: Double, height: Double
        }

        let format: String
        let data: String
        let bounds: Bounds
    }

    struct Failure: Encodable, Equatable {
        let code: String
        let message: String
    }

    @MainActor protocol Delegate: AnyObject {
        func cameraStarted()
        func cameraFailed(_ failure: Failure)
        func cameraScanned(_ objects: [AVMetadataMachineReadableCodeObject])
    }

    let session = AVCaptureSession()
    weak var delegate: Delegate?

    private let queue = DispatchQueue(label: "dev.kuito.camera.session")
    private let photo = AVCapturePhotoOutput()
    private let movie = AVCaptureMovieFileOutput()
    private let metadata = AVCaptureMetadataOutput()
    private var input: AVCaptureDeviceInput?
    private var audio: AVCaptureDeviceInput?
    private var applied: Configuration?
    private var captures: Set<KuitoPhotoCapture> = []
    /// Settled with the video once the recording ends, whatever ends it.
    private var recording: [KuitoPromise<CameraRecording>] = []
    private var observers: [NSObjectProtocol] = []

    override init() {
        super.init()

        let center = NotificationCenter.default

        observers = [
            center.addObserver(forName: AVCaptureSession.didStartRunningNotification, object: session, queue: .main) {
                [weak self] _ in MainActor.assumeIsolated { self?.delegate?.cameraStarted() }
            },
            center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: .main) {
                [weak self] note in
                let error = note.userInfo?[AVCaptureSessionErrorKey] as? Error

                MainActor.assumeIsolated {
                    self?.delegate?.cameraFailed(Failure(code: "ERR_CAMERA",
                        message: "The camera stopped: \(error?.localizedDescription ?? "unknown error")"))
                }
            },
        ]
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    /// Configures the session for `configuration`, then runs or stops it.
    func apply(_ configuration: Configuration, running: Bool) {
        queue.async { [self] in
            do {
                try configure(configuration)
            } catch let error as KuitoModuleError {
                stop()
                return fail(Failure(code: error.code, message: error.message))
            } catch {
                stop()
                return fail(Failure(code: "ERR_CAMERA", message: error.localizedDescription))
            }

            if running, !session.isRunning { session.startRunning() }
            if !running { stop() }
        }
    }

    /// Finishes any recording, stops and lets the device go; the view is gone.
    func release() {
        queue.async { [self] in
            if movie.isRecording { movie.stopRecording() }
            stop()
            session.inputs.forEach(session.removeInput)
            session.outputs.forEach(session.removeOutput)
        }
    }

    func takePicture(quality: Double, bytes: Bool, orientation: AVCaptureVideoOrientation, _ promise: KuitoPromise<CameraPicture>) {
        queue.async { [self] in
            guard session.isRunning, let flash = applied?.flash else {
                return promise.reject("ERR_NOT_READY", "the camera isn't running; wait for onReady")
            }

            let settings = AVCapturePhotoSettings(format: [
                AVVideoCodecKey: AVVideoCodecType.jpeg,
                AVVideoCompressionPropertiesKey: [AVVideoQualityKey: min(max(quality, 0), 1)],
            ])
            let mode = flash.mode

            settings.flashMode = photo.supportedFlashModes.contains(mode) ? mode : .off
            photo.connection(with: .video)?.videoOrientation = orientation

            let capture = KuitoPhotoCapture(bytes: bytes, promise: promise) { [weak self] done in
                self?.queue.async { self?.captures.remove(done) }
            }

            captures.insert(capture)
            photo.capturePhoto(with: settings, delegate: capture)
        }
    }

    func startRecording(maxDuration: Double?, orientation: AVCaptureVideoOrientation, _ promise: KuitoPromise<CameraRecording>) {
        queue.async { [self] in
            guard let configuration = applied, configuration.mode == .video else {
                return promise.reject("ERR_MODE", "set mode=\"video\" on the CameraView first")
            }
            guard session.isRunning else {
                return promise.reject("ERR_NOT_READY", "the camera isn't running; wait for onReady")
            }
            guard !movie.isRecording else {
                return promise.reject("ERR_RECORDING", "the camera is already recording")
            }

            do {
                if !configuration.mute { try addAudio() }

                let file = try KuitoCameraFiles.file(extension: "mp4")

                movie.maxRecordedDuration = maxDuration.map { CMTime(seconds: $0, preferredTimescale: 600) } ?? .invalid
                movie.connection(with: .video)?.videoOrientation = orientation
                recording = [promise]
                movie.startRecording(to: file, recordingDelegate: self)
            } catch {
                promise.reject(error)
            }
        }
    }

    func stopRecording(_ promise: KuitoPromise<CameraRecording>) {
        queue.async { [self] in
            guard movie.isRecording else {
                return promise.reject("ERR_RECORDING", "the camera isn't recording")
            }

            recording.append(promise)
            movie.stopRecording()
        }
    }

    // MARK: Configuration, on `queue`

    private func configure(_ next: Configuration) throws {
        let previous = applied

        if previous?.facing != next.facing || previous?.mode != next.mode || previous?.mute != next.mute
            || previous?.barcodeTypes != next.barcodeTypes {
            // Found before configuring: committing a configuration without a camera posts a runtime error.
            let camera = previous?.facing == next.facing ? nil : try device(next.facing)

            session.beginConfiguration()
            defer { session.commitConfiguration() }

            if let camera { try use(camera, next.facing) }

            session.sessionPreset = next.mode == .video ? .high : .photo
            add(photo)

            if next.mode == .video { add(movie) } else { remove(movie) }

            if next.barcodeTypes.isEmpty {
                remove(metadata)
            } else {
                add(metadata)
                metadata.setMetadataObjectsDelegate(self, queue: .main)
                metadata.metadataObjectTypes = next.barcodeTypes.map(\.type).filter(metadata.availableMetadataObjectTypes.contains)
            }

            if next.mute, let audio {
                session.removeInput(audio)
                self.audio = nil
            }
        }

        // Applied the moment the configuration is, so a failure above retries it all.
        applied = next

        guard let device = input?.device else { return }

        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }

        if device.hasTorch, device.isTorchModeSupported(next.torch ? .on : .off) {
            device.torchMode = next.torch ? .on : .off
        }

        // Linear from no zoom to the device's most, at most 10x: beyond it, digital zoom is only blur.
        let most = min(device.maxAvailableVideoZoomFactor, 10)

        device.videoZoomFactor = device.minAvailableVideoZoomFactor
            + CGFloat(min(max(next.zoom, 0), 1)) * (most - device.minAvailableVideoZoomFactor)
    }

    private func device(_ facing: KuitoCameraFacing) throws -> AVCaptureDevice {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: facing.position) else {
            throw KuitoModuleError("ERR_CAMERA_UNAVAILABLE",
                "This device has no \(facing.rawValue) camera. The iOS simulator has none: test the camera on a device.")
        }

        return device
    }

    private func use(_ device: AVCaptureDevice, _ facing: KuitoCameraFacing) throws {
        let next = try AVCaptureDeviceInput(device: device)

        if let input { session.removeInput(input) }

        guard session.canAddInput(next) else {
            if let input { session.addInput(input) }
            throw KuitoModuleError("ERR_CAMERA", "The \(facing.rawValue) camera can't be used with this session")
        }

        session.addInput(next)
        input = next
    }

    private func addAudio() throws {
        guard audio == nil else { return }

        guard let device = AVCaptureDevice.default(for: .audio) else {
            throw KuitoModuleError("ERR_CAMERA_UNAVAILABLE", "no microphone; record with mute")
        }

        let input = try AVCaptureDeviceInput(device: device)

        session.beginConfiguration()
        defer { session.commitConfiguration() }

        guard session.canAddInput(input) else {
            throw KuitoModuleError("ERR_CAMERA", "the microphone can't be used with this session")
        }

        session.addInput(input)
        audio = input
    }

    private func add(_ output: AVCaptureOutput) {
        if !session.outputs.contains(output), session.canAddOutput(output) { session.addOutput(output) }
    }

    private func remove(_ output: AVCaptureOutput) {
        if session.outputs.contains(output) { session.removeOutput(output) }
    }

    /// Stopping ends a recording, which settles its promises with the video.
    private func stop() {
        if session.isRunning { session.stopRunning() }
    }

    private func fail(_ failure: Failure) {
        DispatchQueue.main.async { MainActor.assumeIsolated { self.delegate?.cameraFailed(failure) } }
    }
}

extension KuitoCameraSession: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo file: URL,
                    from connections: [AVCaptureConnection], error: Error?) {
        queue.async { [self] in
            let promises = recording
            // Stopping the session, reaching maxDuration or an interruption end
            // the recording with an error, yet the file is complete.
            let finished = error == nil
                || ((error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? false)

            recording = []

            if finished {
                let video = CameraRecording(uri: file.absoluteString, duration: output.recordedDuration.seconds)

                promises.forEach { $0.resolve(video) }
            } else {
                try? FileManager.default.removeItem(at: file)
                promises.forEach { $0.reject("ERR_RECORDING", "the recording failed: \(error?.localizedDescription ?? "")") }
            }
        }
    }
}

extension KuitoCameraSession: AVCaptureMetadataOutputObjectsDelegate {
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        let codes = objects.compactMap { $0 as? AVMetadataMachineReadableCodeObject }

        MainActor.assumeIsolated { delegate?.cameraScanned(codes) }
    }
}

/// One picture on its way: AVFoundation holds its delegate weakly.
private final class KuitoPhotoCapture: NSObject, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
    private let bytes: Bool
    private let promise: KuitoPromise<CameraPicture>
    private let done: (KuitoPhotoCapture) -> Void

    init(bytes: Bool, promise: KuitoPromise<CameraPicture>, done: @escaping (KuitoPhotoCapture) -> Void) {
        self.bytes = bytes
        self.promise = promise
        self.done = done
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        defer { done(self) }

        do {
            if let error { throw error }

            guard let data = photo.fileDataRepresentation() else {
                throw KuitoModuleError("ERR_CAMERA", "the camera returned no image")
            }

            let file = try KuitoCameraFiles.file(extension: "jpg")
            let size = KuitoCameraFiles.uprightSize(of: data)

            try data.write(to: file)
            promise.resolve(CameraPicture(
                uri: file.absoluteString, width: Double(size.width), height: Double(size.height),
                bytes: bytes ? data : nil))
        } catch {
            promise.reject(error)
        }
    }
}
