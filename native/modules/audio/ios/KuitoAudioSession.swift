import AVFoundation

/// The app's AVAudioSession, set from `audio.configure`
/// (src/native/audio.ts). One for the app, like the session: Video plays
/// under the same mode (docs/video.md). Main thread only.
final class KuitoAudioSession {
    static let shared = KuitoAudioSession()

    struct Mode: Decodable {
        let playsInSilentMode: Bool
        let mixWithOthers: Bool
        let duckOthers: Bool
        let allowsRecording: Bool
        let staysActiveInBackground: Bool

        static let initial = Mode(playsInSilentMode: true, mixWithOthers: false, duckOthers: false,
                                  allowsRecording: false, staysActiveInBackground: false)
    }

    private let session = AVAudioSession.sharedInstance()
    private(set) var mode = Mode.initial
    private var applied = false

    private init() {}

    /// Recording needs `.playAndRecord`; playing on silent, in the
    /// background or ducking needs `.playback`; otherwise `.ambient` mixes
    /// and follows the switch, and `.soloAmbient` stops other audio.
    func set(_ next: Mode) throws {
        if next.staysActiveInBackground, !Self.declaresBackgroundAudio {
            throw KuitoModuleError("ERR_AUDIO_MODE",
                "staysActiveInBackground needs the audio background mode: add ios.backgroundModes: ['audio'] to kuito.config.ts")
        }

        let category: AVAudioSession.Category = next.allowsRecording ? .playAndRecord
            : next.playsInSilentMode || next.staysActiveInBackground || next.duckOthers ? .playback
            : next.mixWithOthers ? .ambient : .soloAmbient
        var options: AVAudioSession.CategoryOptions = []

        if next.mixWithOthers { options.insert(.mixWithOthers) }
        if next.duckOthers { options.insert(.duckOthers) }
        if category == .playAndRecord { options.formUnion([.defaultToSpeaker, .allowBluetoothA2DP]) }
        // `.ambient` always mixes and takes no options.
        if category == .ambient { options = [] }

        try session.setCategory(category, mode: .default, options: options)
        mode = next
        applied = true
    }

    /// Applies the initial mode before the first player or recorder, and activates the session.
    func activate() throws {
        if !applied { try set(mode) }

        try session.setActive(true)
    }

    /// Back to the initial mode, applied again before the next player: a
    /// reloaded runtime starts from the default, as a launch does.
    func reset() {
        mode = .initial
        applied = false
    }

    /// Lets other apps' audio resume. It fails only while audio I/O still
    /// runs, and then the system deactivates the session once it stops.
    func deactivate() {
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static var declaresBackgroundAudio: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("audio") ?? false
    }
}
