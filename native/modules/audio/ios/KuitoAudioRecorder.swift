import AVFoundation

/// One `AudioRecorder` (src/native/audio.ts): an AVAudioRecorder per file,
/// made on the first `start` after `stop`. It reports when it starts and
/// stops, and its level every `levelInterval` while metering; JavaScript has
/// the UI thread move `time` in between. Main thread only.
final class KuitoAudioRecorder {
    /// How often the level is sampled while metering; src/native/audio.ts eases between samples over the same time.
    private static let levelInterval = 0.1

    /// Sample rate, channels and AAC bit rate per quality; docs/audio.md lists them.
    private static let qualities: [RecordingQuality: (rate: Double, channels: Int, bitRate: Int)] = [
        .low: (22_050, 1, 64_000),
        .medium: (44_100, 1, 96_000),
        .high: (44_100, 2, 128_000),
    ]

    let id: Double
    private let request: AudioRecorderRequest
    private let report: (AudioRecorderStatus) -> Void
    private var recorder: AVAudioRecorder?
    private var timer: Timer?

    init(_ request: AudioRecorderRequest, report: @escaping (AudioRecorderStatus) -> Void) {
        id = request.id
        self.request = request
        self.report = report
    }

    /// Resumes a paused file, or starts a new one in the caches directory.
    func start() throws {
        if let recorder {
            recorder.record()
            return started()
        }

        let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let url = caches.appendingPathComponent("recording-\(UUID().uuidString).\(request.format == .aac ? "m4a" : "wav")")
        let next = try AVAudioRecorder(url: url, settings: settings())

        next.isMeteringEnabled = request.metering

        guard next.prepareToRecord(), next.record() else {
            throw KuitoModuleError("ERR_RECORDING", "The recorder could not start; another app may hold the microphone")
        }

        recorder = next
        started()
    }

    func pause() {
        recorder?.pause()
        stopTimer()
        send()
    }

    func stop() throws -> AudioRecording {
        guard let recorder else { throw KuitoModuleError("ERR_NOT_RECORDING", "AudioRecorder.stop: nothing was recorded since the last stop") }

        // AVAudioRecorder resets currentTime when it stops.
        let duration = recorder.currentTime

        recorder.stop()
        self.recorder = nil
        stopTimer()
        send()

        return AudioRecording(uri: recorder.url.absoluteString, duration: duration)
    }

    /// Discards an unfinished file: nothing else knows its URL.
    func release() {
        recorder?.stop()
        recorder?.deleteRecording()
        recorder = nil
        stopTimer()
    }

    private func settings() -> [String: Any] {
        let quality = Self.qualities[request.quality] ?? (44_100, 2, 128_000)
        let common: [String: Any] = [AVSampleRateKey: quality.rate, AVNumberOfChannelsKey: quality.channels]

        switch request.format {
        case .aac:
            return common.merging([
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVEncoderBitRateKey: quality.bitRate,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ]) { $1 }
        case .wav:
            return common.merging([
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
            ]) { $1 }
        }
    }

    private func started() {
        stopTimer()
        if request.metering {
            timer = Timer.scheduledTimer(withTimeInterval: Self.levelInterval, repeats: true) { [weak self] _ in
                self?.send()
            }
        }
        send()
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func send() {
        let metering = recorder.flatMap { recorder -> Double? in
            guard request.metering, recorder.isRecording else { return nil }

            recorder.updateMeters()

            return Double(recorder.averagePower(forChannel: 0))
        }

        report(AudioRecorderStatus(id: id, recording: recorder?.isRecording ?? false, currentTime: recorder?.currentTime ?? 0,
                                   metering: request.metering ? metering ?? -160 : nil))
    }
}
