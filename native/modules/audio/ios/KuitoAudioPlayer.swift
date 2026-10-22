import AVFoundation

/// One `AudioPlayer` (src/native/audio.ts): an AVPlayer and the status it
/// reports when its state changes. There is no clock here: JavaScript has the
/// UI thread move `time` from the last report, so playing sends nothing until
/// something changes. Main thread only; KVO callbacks hop there before reading.
final class KuitoAudioPlayer {
    let id: Double
    private let player: AVPlayer
    private let item: AVPlayerItem
    private let report: (AudioPlayerStatus) -> Void
    private var loop: Bool
    private var observations: [NSKeyValueObservation] = []
    private var endObserver: NSObjectProtocol?

    init(_ request: AudioPlayerRequest, url: URL, report: @escaping (AudioPlayerStatus) -> Void) {
        id = request.id
        item = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: item)
        loop = request.loop
        self.report = report

        // Keeps the pitch when `rate` isn't 1.
        item.audioTimePitchAlgorithm = .timeDomain
        player.volume = Float(request.volume)
        player.defaultRate = Float(request.rate)
        player.actionAtItemEnd = .pause

        let changed = { [weak self] in DispatchQueue.main.async { self?.send() } }

        observations = [
            player.observe(\.timeControlStatus) { _, _ in changed() },
            item.observe(\.status) { _, _ in changed() },
        ]
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in self?.finished() }
    }

    var playing: Bool { player.timeControlStatus != .paused }

    func play() {
        // Played to the end: start over, as a media player's play button does.
        if item.status == .readyToPlay, item.currentTime() >= item.duration { item.seek(to: .zero, completionHandler: nil) }

        player.play()
    }

    func pause() {
        player.pause()
    }

    func seek(to seconds: Double) {
        player.seek(to: CMTime(seconds: seconds, preferredTimescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) {
            [weak self] _ in DispatchQueue.main.async { self?.send() }
        }
    }

    func setVolume(_ volume: Double) {
        player.volume = Float(volume)
        send()
    }

    func setRate(_ rate: Double) {
        player.defaultRate = Float(rate)
        if playing { player.rate = Float(rate) }
        send()
    }

    func setLoop(_ loop: Bool) {
        self.loop = loop
        send()
    }

    func release() {
        player.pause()
        observations.forEach { $0.invalidate() }
        observations = []
        endObserver.map(NotificationCenter.default.removeObserver)
        endObserver = nil
        player.replaceCurrentItem(with: nil)
    }

    private func finished() {
        if loop {
            item.seek(to: .zero, completionHandler: nil)
            player.play()
        }

        send(ended: true)
    }

    private func send(ended: Bool = false) {
        let duration = item.status == .readyToPlay && item.duration.isNumeric ? item.duration.seconds : -1
        let time = item.currentTime()

        report(AudioPlayerStatus(
            id: id,
            isLoaded: item.status == .readyToPlay,
            playing: playing,
            isBuffering: player.timeControlStatus == .waitingToPlayAtSpecifiedRate,
            currentTime: time.isNumeric ? max(0, time.seconds) : 0,
            duration: duration,
            ended: ended,
            volume: Double(player.volume),
            rate: Double(player.defaultRate),
            loop: loop,
            error: item.error?.localizedDescription
        ))
    }
}
