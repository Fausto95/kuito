import AVKit
import UIKit

/// A Video's fullscreen: an AVPlayerViewController with the platform's
/// controls, presented over the app on the same player. The user leaves it
/// with its close button or a swipe. It is also the delegate of the embedded
/// controller `controls` shows, whose own fullscreen button `changed` hears
/// too, both ways.
@MainActor
final class KuitoVideoFullscreen: NSObject, AVPlayerViewControllerDelegate {
    private let player: AVPlayer
    private let changed: (Bool) -> Void
    private var presented: AVPlayerViewController?
    /// The embedded controller's own fullscreen is showing.
    private var embedded = false

    init(player: AVPlayer, changed: @escaping (Bool) -> Void) {
        self.player = player
        self.changed = changed
    }

    func enter(gravity: AVLayerVideoGravity, _ done: @escaping (Error?) -> Void) {
        guard presented == nil else { return done(nil) }

        guard let top = KuitoPresenter.top() else {
            return done(KuitoModuleError("ERR_FULLSCREEN", "No window to present the video in"))
        }

        let controller = AVPlayerViewController()

        controller.player = player
        controller.videoGravity = gravity
        controller.delegate = self
        controller.modalPresentationStyle = .fullScreen
        presented = controller
        top.present(controller, animated: true) { [weak self] in
            self?.changed(true)
            done(nil)
        }
    }

    func exit(_ done: @escaping () -> Void) {
        guard let presented, presented.presentingViewController != nil else { return done() }

        presented.dismiss(animated: true) { [weak self] in
            self?.dismissed()
            done()
        }
    }

    nonisolated func playerViewController(
        _ playerViewController: AVPlayerViewController,
        willBeginFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
    ) {
        coordinator.animate(alongsideTransition: nil) { context in
            guard !context.isCancelled else { return }

            DispatchQueue.main.async { [weak self] in self?.began(playerViewController) }
        }
    }

    nonisolated func playerViewController(
        _ playerViewController: AVPlayerViewController,
        willEndFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
    ) {
        coordinator.animate(alongsideTransition: nil) { context in
            guard !context.isCancelled else { return }

            DispatchQueue.main.async { [weak self] in self?.dismissed() }
        }
    }

    /// The presented controller reports its own presentation, which `enter` already did.
    private func began(_ controller: AVPlayerViewController) {
        guard controller !== presented, !embedded else { return }

        embedded = true
        changed(true)
    }

    private func dismissed() {
        if embedded {
            embedded = false

            return changed(false)
        }

        guard presented != nil else { return }

        presented = nil
        changed(false)
    }
}
