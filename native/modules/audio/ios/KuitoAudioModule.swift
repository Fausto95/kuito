import AVFoundation

/// `Audio` in native/modules/audio/audio.ts. Players and recorders are
/// native objects keyed by the id JavaScript gives them; every function but
/// `nextId` runs on the main thread, so the tables need no lock. A reload
/// releases them all.
final class KuitoAudioModule: AudioSpec {
    private let session = KuitoAudioSession.shared
    private var players: [Double: KuitoAudioPlayer] = [:]
    private var recorders: [Double: KuitoAudioRecorder] = [:]
    private var interruptions: NSObjectProtocol?
    private var lifecycle: UUID?
    /// Touched only by `nextId`, on the JS thread.
    private var ids = 0.0
    // Set while JavaScript listens: src/native/audio.ts listens while any
    // player or recorder lives, from before it makes the first.
    private var playerStatus: KuitoEmitter<AudioPlayerStatus>?
    private var recorderStatus: KuitoEmitter<AudioRecorderStatus>?
    private var interruption: KuitoEmitter<AudioInterruption>?

    init(context: KuitoModuleContext) {}

    func nextId() throws -> Double {
        ids += 1
        return ids
    }

    @MainActor func createPlayer(_ request: AudioPlayerRequest) throws {
        guard players[request.id] == nil else {
            throw KuitoModuleError("ERR_ARGUMENT", "A player with id \(Int(request.id)) already exists")
        }

        let url = try Self.url(request.uri)

        try session.activate()
        observe()
        players[request.id] = KuitoAudioPlayer(request, url: url) { [weak self] in self?.playerStatus?.send($0) }
    }

    @MainActor func play(_ id: Double) throws {
        try session.activate()
        try player(id).play()
    }

    @MainActor func pause(_ id: Double) throws {
        try player(id).pause()
    }

    @MainActor func seekTo(_ id: Double, _ seconds: Double) throws {
        try player(id).seek(to: seconds)
    }

    @MainActor func setVolume(_ id: Double, _ volume: Double) throws {
        try player(id).setVolume(volume)
    }

    @MainActor func setRate(_ id: Double, _ rate: Double) throws {
        try player(id).setRate(rate)
    }

    @MainActor func setLoop(_ id: Double, _ loop: Bool) throws {
        try player(id).setLoop(loop)
    }

    @MainActor func releasePlayer(_ id: Double) throws {
        players.removeValue(forKey: id)?.release()
        settle()
    }

    @MainActor func createRecorder(_ request: AudioRecorderRequest) throws {
        guard recorders[request.id] == nil else {
            throw KuitoModuleError("ERR_ARGUMENT", "A recorder with id \(Int(request.id)) already exists")
        }

        observe()
        recorders[request.id] = KuitoAudioRecorder(request) { [weak self] in self?.recorderStatus?.send($0) }
    }

    @MainActor func startRecording(_ id: Double, _ promise: KuitoPromise<Void>) {
        let recorder: KuitoAudioRecorder

        do {
            recorder = try self.recorder(id)
            try mayRecord()
        } catch {
            return promise.reject(error)
        }

        KuitoPermissions.request(.microphone) { [session] response in
            guard response.status == .granted else {
                return promise.reject("ERR_PERMISSION", "AudioRecorder.start: the microphone permission is \(response.status.rawValue)")
            }

            do {
                try session.activate()
                try recorder.start()
                promise.resolve()
            } catch {
                promise.reject(error)
            }
        }
    }

    @MainActor func pauseRecording(_ id: Double) throws {
        try recorder(id).pause()
    }

    @MainActor func stopRecording(_ id: Double) throws -> AudioRecording {
        try recorder(id).stop()
    }

    @MainActor func releaseRecorder(_ id: Double) throws {
        recorders.removeValue(forKey: id)?.release()
        settle()
    }

    @MainActor func setAudioMode(_ mode: AudioMode) throws {
        try session.set(KuitoAudioSession.Mode(
            playsInSilentMode: mode.playsInSilentMode,
            mixWithOthers: mode.mixWithOthers,
            duckOthers: mode.duckOthers,
            allowsRecording: mode.allowsRecording,
            staysActiveInBackground: mode.staysActiveInBackground
        ))
    }

    @MainActor func startPlayerStatus(_ emitter: KuitoEmitter<AudioPlayerStatus>) {
        playerStatus = emitter
    }

    @MainActor func stopPlayerStatus() {
        playerStatus = nil
    }

    @MainActor func startRecorderStatus(_ emitter: KuitoEmitter<AudioRecorderStatus>) {
        recorderStatus = emitter
    }

    @MainActor func stopRecorderStatus() {
        recorderStatus = nil
    }

    @MainActor func startInterruption(_ emitter: KuitoEmitter<AudioInterruption>) {
        interruption = emitter
    }

    @MainActor func stopInterruption() {
        interruption = nil
    }

    func destroy() {
        players.values.forEach { $0.release() }
        recorders.values.forEach { $0.release() }
        players = [:]
        recorders = [:]
        settle()
        session.reset()
    }

    private func player(_ id: Double) throws -> KuitoAudioPlayer {
        guard let player = players[id] else { throw KuitoModuleError("ERR_NOT_FOUND", "No player with id \(Int(id)); it was released") }

        return player
    }

    private func recorder(_ id: Double) throws -> KuitoAudioRecorder {
        guard let recorder = recorders[id] else { throw KuitoModuleError("ERR_NOT_FOUND", "No recorder with id \(Int(id)); it was released") }

        return recorder
    }

    /// Fails before prompting, so a missing usage string or mode is a clear error rather than a crash.
    private func mayRecord() throws {
        guard Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil else {
            throw KuitoModuleError("ERR_PERMISSION",
                "AudioRecorder.start: add permissions.microphone to kuito.config.ts; iOS needs its reason to ask")
        }

        guard session.mode.allowsRecording else {
            throw KuitoModuleError("ERR_AUDIO_MODE",
                "AudioRecorder.start: call audio.configure({ allowsRecording: true }) first")
        }
    }

    /// `asset:///` names a file in the app bundle, as on Android.
    private static func url(_ uri: String) throws -> URL {
        if uri.hasPrefix("asset:///") {
            let name = String(uri.dropFirst("asset:///".count))

            guard let url = Bundle.main.resourceURL?.appendingPathComponent(name), FileManager.default.fileExists(atPath: url.path) else {
                throw KuitoModuleError("ERR_NOT_FOUND", "\(uri) is not in the app bundle")
            }

            return url
        }

        guard let url = URL(string: uri) else { throw KuitoModuleError("ERR_ARGUMENT", "\(uri) is not a URL") }

        if url.isFileURL, !FileManager.default.fileExists(atPath: url.path) {
            throw KuitoModuleError("ERR_NOT_FOUND", "Nothing at \(uri)")
        }

        return url
    }

    /// Interruptions and the app going to the background, while any player or recorder lives.
    private func observe() {
        guard interruptions == nil else { return }

        interruptions = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] note in self?.interrupted(note) }
        lifecycle = KuitoAppLifecycle.shared.observe { [weak self] event in
            guard case .changed(.background) = event, let self, !self.session.mode.staysActiveInBackground else { return }

            self.players.values.forEach { $0.pause() }
            self.recorders.values.forEach { $0.pause() }
        }
    }

    /// The system pauses players and recorders itself; pausing them here too
    /// keeps their status, and Android's, the same whatever the source.
    private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }

        let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt).map(AVAudioSession.InterruptionOptions.init)

        switch type {
        case .began:
            players.values.forEach { $0.pause() }
            recorders.values.forEach { $0.pause() }
            interruption?.send(AudioInterruption(type: .began, shouldResume: false))
        case .ended: interruption?.send(AudioInterruption(type: .ended, shouldResume: options?.contains(.shouldResume) ?? false))
        @unknown default: return
        }
    }

    /// With nothing left to play or record, stops observing and lets other apps' audio resume.
    private func settle() {
        guard players.isEmpty, recorders.isEmpty else { return }

        interruptions.map(NotificationCenter.default.removeObserver)
        interruptions = nil
        lifecycle.map(KuitoAppLifecycle.shared.cancel)
        lifecycle = nil
        session.deactivate()
    }
}
