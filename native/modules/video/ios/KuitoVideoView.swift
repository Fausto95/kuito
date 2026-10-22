import AVKit
import UIKit

/// `Video` (src/native/video.tsx): an AVPlayer drawn by an AVPlayerLayer, or
/// by an embedded AVPlayerViewController with `controls`. Fullscreen presents
/// another AVPlayerViewController on the same player; picture in picture
/// takes the layer. See docs/video.md.
final class KuitoVideoView: UIView, KuitoNativeView {
    let video: KuitoVideoPlayer
    private let events: KuitoViewEvents
    private let pictureLayer = AVPlayerLayer()
    private var controller: AVPlayerViewController?
    private var gravity = AVLayerVideoGravity.resizeAspect
    private lazy var fullscreen = KuitoVideoFullscreen(player: video.player) { [weak self] presented in
        self?.events.emit("fullscreenChange", ["fullscreen": presented])
    }
    private lazy var pictureInPicture = KuitoVideoPictureInPicture(layer: pictureLayer) { [weak self] active in
        self?.pictureInPictureChanged(active)
    }
    private var lifecycle: UUID?

    init(events: KuitoViewEvents) {
        self.events = events
        video = KuitoVideoPlayer(events: events)
        super.init(frame: .zero)
        clipsToBounds = true
        backgroundColor = .black
        pictureLayer.player = video.player
        pictureLayer.videoGravity = gravity
        layer.addSublayer(pictureLayer)
        lifecycle = KuitoAppLifecycle.shared.observe { [weak self] event in
            guard case .changed(let state) = event else { return }

            DispatchQueue.main.async { self?.appChanged(state) }
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // The layer follows the view without an implicit animation.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        pictureLayer.frame = bounds
        CATransaction.commit()
        controller?.view.frame = bounds
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        adoptController()
    }

    func setResizeMode(_ mode: KuitoVideoProps.ResizeMode) {
        gravity = mode.gravity
        pictureLayer.videoGravity = gravity
        controller?.videoGravity = gravity
    }

    /// The platform's controls: an embedded AVPlayerViewController draws the
    /// picture instead of the layer, which keeps the player only for picture
    /// in picture.
    func setControls(_ controls: Bool) {
        guard controls != (controller != nil) else { return }

        if controls {
            let controller = AVPlayerViewController()

            controller.player = video.player
            controller.videoGravity = gravity
            controller.delegate = fullscreen
            controller.view.frame = bounds
            controller.view.backgroundColor = .clear
            addSubview(controller.view)
            self.controller = controller
            pictureLayer.player = pictureInPicture.active ? video.player : nil
            adoptController()
        } else {
            controller?.willMove(toParent: nil)
            controller?.view.removeFromSuperview()
            controller?.removeFromParent()
            controller = nil
            pictureLayer.player = video.player
        }
    }

    func enterFullscreen(_ done: @escaping (Error?) -> Void) {
        fullscreen.enter(gravity: gravity, done)
    }

    func exitFullscreen(_ done: @escaping () -> Void) {
        fullscreen.exit(done)
    }

    func startPictureInPicture(_ done: @escaping (Error?) -> Void) {
        pictureLayer.player = video.player
        pictureInPicture.start(done)
    }

    func stopPictureInPicture(_ done: @escaping () -> Void) {
        pictureInPicture.stop(done)
    }

    /// Kuito removed the view, or the runtime is reloading.
    func unmount() {
        lifecycle.map(KuitoAppLifecycle.shared.cancel)
        lifecycle = nil
        fullscreen.exit {}
        pictureInPicture.stop {}
        setControls(false)
        pictureLayer.player = nil
        video.release()
    }

    /// The embedded controller joins the nearest view controller, which
    /// forwards it appearance and trait changes.
    private func adoptController() {
        guard let controller, controller.parent == nil, window != nil else { return }

        var responder: UIResponder? = self

        while let next = responder?.next, !(next is UIViewController) { responder = next }

        guard let parent = responder?.next as? UIViewController else { return }

        parent.addChild(controller)
        controller.didMove(toParent: parent)
    }

    /// In the background, a player still attached to a visible layer is
    /// paused by the system, so a video that keeps playing (the audio mode
    /// allows it, or it is in picture in picture) lets go of its layers.
    private func appChanged(_ state: KuitoAppLifecycle.State) {
        switch state {
        case .background:
            if pictureInPicture.active { return }

            guard KuitoAudioSession.shared.mode.staysActiveInBackground else { return video.pause() }

            pictureLayer.player = nil
            controller?.player = nil
        case .active:
            if controller == nil || pictureInPicture.active { pictureLayer.player = video.player }

            controller?.player = video.player
        case .inactive:
            return
        }
    }

    private func pictureInPictureChanged(_ active: Bool) {
        // With controls, the layer holds the player only while in picture in picture.
        if !active, controller != nil { pictureLayer.player = nil }

        events.emit("pictureInPictureChange", ["active": active])
    }
}
