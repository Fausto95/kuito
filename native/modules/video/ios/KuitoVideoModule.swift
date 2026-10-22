import UIKit

/// `Video` in native/modules/video/video.ts: a view and the methods a ref to
/// it calls. Each view owns its player and releases it when Kuito removes
/// the view or the runtime reloads.
final class KuitoVideoModule: VideoSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoVideoView.self) { view in
            view.prop("src") { (view, source: KuitoVideoProps.Source?) in view.video.load(source?.url) }
            view.prop("paused") { (view, paused: Bool?) in view.video.setPaused(paused ?? false) }
            view.prop("muted") { (view, muted: Bool?) in view.video.setMuted(muted ?? false) }
            view.prop("volume") { (view, volume: KuitoVideoProps.Volume?) in view.video.setVolume(volume?.value ?? 1) }
            view.prop("rate") { (view, rate: KuitoVideoProps.Rate?) in view.video.setRate(rate?.value ?? 1) }
            view.prop("loop") { (view, loop: Bool?) in view.video.setLoop(loop ?? false) }
            view.prop("objectFit") { (view, mode: KuitoVideoProps.ResizeMode?) in view.setResizeMode(mode ?? .contain) }
            view.prop("controls") { (view, controls: Bool?) in view.setControls(controls ?? false) }
            view.prop("progressInterval") { (view, interval: KuitoVideoProps.Interval?) in
                view.video.setProgressInterval(interval?.seconds ?? KuitoVideoPlayer.defaultProgressInterval)
            }
        }
    }

    @MainActor func seek(_ view: UIView, _ seconds: Double, _ promise: KuitoPromise<Void>) {
        settle(promise) { try video(view).video.seek(to: seconds) { promise.resolve() } }
    }

    @MainActor func play(_ view: UIView) throws {
        try video(view).video.play()
    }

    @MainActor func pause(_ view: UIView) throws {
        try video(view).video.pause()
    }

    @MainActor func enterFullscreen(_ view: UIView, _ promise: KuitoPromise<Void>) {
        settle(promise) { try video(view).enterFullscreen { error in Self.finish(promise, error) } }
    }

    @MainActor func exitFullscreen(_ view: UIView, _ promise: KuitoPromise<Void>) {
        settle(promise) { try video(view).exitFullscreen { promise.resolve() } }
    }

    @MainActor func startPictureInPicture(_ view: UIView, _ promise: KuitoPromise<Void>) {
        settle(promise) { try video(view).startPictureInPicture { error in Self.finish(promise, error) } }
    }

    @MainActor func stopPictureInPicture(_ view: UIView, _ promise: KuitoPromise<Void>) {
        settle(promise) { try video(view).stopPictureInPicture { promise.resolve() } }
    }

    @MainActor private func video(_ view: UIView) throws -> KuitoVideoView {
        guard let video = view as? KuitoVideoView else {
            throw KuitoModuleError(KuitoErrorCode.viewNotFound, "The view is not a Video")
        }

        return video
    }

    /// A callback method can't throw: a view that isn't a Video rejects its promise.
    @MainActor private func settle(_ promise: KuitoPromise<Void>, _ call: () throws -> Void) {
        do { try call() } catch { promise.reject(error) }
    }

    private static func finish(_ promise: KuitoPromise<Void>, _ error: Error?) {
        if let error { promise.reject(error) } else { promise.resolve() }
    }
}
