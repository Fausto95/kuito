import AVFoundation

/// The AVPlayer behind one Video view, and the events it reports
/// (docs/video.md). Main thread only; KVO callbacks hop there first.
@MainActor
final class KuitoVideoPlayer {
    private struct Load: Encodable {
        @KuitoNullable var duration: Double?
        let currentTime: Double
        let naturalSize: Size
    }

    private struct Size: Encodable {
        let width: Double
        let height: Double
    }

    private struct Progress: Encodable {
        let currentTime: Double
        let playableDuration: Double
    }

    private struct Buffer: Encodable { let isBuffering: Bool }

    /// With where and how fast it plays, so JavaScript can run `time` from here (src/native/video.ts).
    private struct PlaybackState: Encodable {
        let isPlaying: Bool
        let currentTime: Double
        let rate: Float
    }

    let player = AVPlayer()
    private let events: KuitoViewEvents
    /// What the app asked for last, through the `paused` prop or play/pause.
    private var wantsToPlay = false
    private var loop = false
    private var rate: Float = 1
    private var progressInterval: Double = 0
    private var itemObservations: [NSKeyValueObservation] = []
    private var playerObservation: NSKeyValueObservation?
    private var endObserver: NSObjectProtocol?
    private var timeObserver: Any?
    private var loaded = false
    private var source: URL?
    private var buffering = false
    private var playing = false

    init(events: KuitoViewEvents) {
        self.events = events
        player.actionAtItemEnd = .pause
        playerObservation = player.observe(\.timeControlStatus) { [weak self] _, _ in
            DispatchQueue.main.async { self?.statusChanged() }
        }
        setProgressInterval(Self.defaultProgressInterval)
    }

    /// Seconds between progress events while playing, unless the app says otherwise.
    static let defaultProgressInterval = 0.25

    var currentTime: Double {
        let time = player.currentTime()

        return time.isNumeric ? max(0, time.seconds) : 0
    }

    /// A new source, or none. A missing file fails at once, as `onError`.
    func load(_ url: URL?) {
        // The same source again (a re-render, a Live Patch) keeps playing where it is.
        guard url != source || url == nil else { return }

        source = url
        clearItem()

        guard let url else { return player.replaceCurrentItem(with: nil) }

        if url.isFileURL, !FileManager.default.fileExists(atPath: url.path) {
            player.replaceCurrentItem(with: nil)

            return events.emit("error", KuitoModuleError("ERR_NOT_FOUND", "Nothing at \(url.absoluteString)"))
        }

        let item = AVPlayerItem(url: url)

        // Keeps the pitch when `rate` isn't 1.
        item.audioTimePitchAlgorithm = .timeDomain
        itemObservations = [
            item.observe(\.status) { [weak self] _, _ in DispatchQueue.main.async { self?.itemChanged(item) } },
        ]
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in self?.ended(item) }
        player.replaceCurrentItem(with: item)
        apply()
    }

    func setPaused(_ paused: Bool) {
        wantsToPlay = !paused
        apply()
    }

    func play() {
        // Played to the end: start over, as a player's play button does.
        if let item = player.currentItem, item.status == .readyToPlay, item.duration.isNumeric,
           item.currentTime() >= item.duration {
            item.seek(to: .zero, completionHandler: nil)
        }

        wantsToPlay = true
        apply()
    }

    func pause() {
        wantsToPlay = false
        apply()
    }

    func setMuted(_ muted: Bool) {
        player.isMuted = muted
    }

    func setVolume(_ volume: Float) {
        player.volume = volume
    }

    func setRate(_ rate: Float) {
        self.rate = rate
        player.defaultRate = rate

        if player.rate != 0 { player.rate = rate }
    }

    /// A looping player doesn't pause at the end, so it reports no pause between rounds.
    func setLoop(_ loop: Bool) {
        self.loop = loop
        player.actionAtItemEnd = loop ? .none : .pause
    }

    func setProgressInterval(_ seconds: Double) {
        guard seconds != progressInterval else { return }

        progressInterval = seconds
        timeObserver.map(player.removeTimeObserver)
        timeObserver = nil

        guard seconds > 0 else { return }

        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: seconds, preferredTimescale: 1000), queue: .main
        ) { [weak self] _ in self?.progressed() }
    }

    func seek(to seconds: Double, completion: @escaping () -> Void) {
        player.seek(to: CMTime(seconds: seconds, preferredTimescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) {
            _ in DispatchQueue.main.async(execute: completion)
        }
    }

    /// Stops and lets go of the stream: the view is gone.
    func release() {
        wantsToPlay = false
        player.pause()
        clearItem()
        setProgressInterval(0)
        source = nil
        playerObservation?.invalidate()
        playerObservation = nil
        player.replaceCurrentItem(with: nil)
    }

    private func apply() {
        guard wantsToPlay else { return player.pause() }

        // Under the app's audio mode, as Audio's players (docs/video.md).
        do {
            try KuitoAudioSession.shared.activate()
        } catch {
            wantsToPlay = false

            return events.emit("error", KuitoModuleError("ERR_AUDIO_MODE", ((error as? KuitoModuleError)?.message ?? error.localizedDescription)))
        }

        player.defaultRate = rate
        player.play()
    }

    private func clearItem() {
        itemObservations.forEach { $0.invalidate() }
        itemObservations = []
        endObserver.map(NotificationCenter.default.removeObserver)
        endObserver = nil
        loaded = false
    }

    private func itemChanged(_ item: AVPlayerItem) {
        guard item === player.currentItem else { return }

        switch item.status {
        case .readyToPlay where !loaded:
            loaded = true

            let size = item.presentationSize

            events.emit("load", Load(
                duration: item.duration.isNumeric ? item.duration.seconds : nil,
                currentTime: currentTime,
                naturalSize: Size(width: Double(size.width), height: Double(size.height))))
        case .failed:
            events.emit("error", KuitoModuleError("ERR_PLAYBACK", item.error?.localizedDescription ?? "The video failed to play"))
        default:
            return
        }
    }

    private func statusChanged() {
        let nowBuffering = player.timeControlStatus == .waitingToPlayAtSpecifiedRate
        let nowPlaying = player.timeControlStatus == .playing

        if nowBuffering != buffering {
            buffering = nowBuffering
            events.emit("buffer", Buffer(isBuffering: nowBuffering))
        }

        if nowPlaying != playing {
            playing = nowPlaying
            events.emit("playbackStateChange", PlaybackState(isPlaying: nowPlaying, currentTime: currentTime, rate: rate))
        }
    }

    /// The periodic observer also fires on seeks and pauses; progress is for playback.
    private func progressed() {
        guard player.timeControlStatus == .playing, let item = player.currentItem else { return }

        let buffered = item.loadedTimeRanges.map { CMTimeRangeGetEnd($0.timeRangeValue) }.max() ?? .zero

        events.emit("progress", Progress(currentTime: currentTime, playableDuration: buffered.isNumeric ? buffered.seconds : 0))
    }

    private func ended(_ item: AVPlayerItem) {
        guard item === player.currentItem else { return }

        events.emit("end")

        guard loop else {
            wantsToPlay = false

            return
        }

        item.seek(to: .zero, completionHandler: nil)
        player.play()
    }
}
