import UIKit

/// React Native's Pressable: a column that reports press-in, press-out,
/// press and long press, with feedback applied natively on touch-down.
/// A press ends in onPress only when no long press fired, as in React Native.
@MainActor
final class KuitoPressableView: UIView, KuitoStyled {
    /// Emits a press phase with the touch location.
    var emit: ((String, KuitoTouchPayload) -> Void)?
    /// The view's style, which composes pressed feedback with its own opacity and transform.
    weak var style: KuitoViewStyle?

    func style(_ style: KuitoViewStyle, in _: KuitoTreeLinks) {
        self.style = style
    }

    var activeOpacity: CGFloat = 1
    var pressedScale: CGFloat = 1
    var longPressDuration: TimeInterval = 0.5
    var hitSlop: CGFloat = 0
    var haptic: String?
    var isDisabled = false

    /// How far a touch may leave the view (plus hitSlop) before the press cancels.
    private let pressRetention: CGFloat = 20
    private var pressing = false
    private var longPressed = false
    private var longPressTimer: Timer?

    override init(frame: CGRect) {
        super.init(frame: frame)
        // One screen reader element, as React Native's Pressable is.
        isAccessibilityElement = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// Without an accessibilityLabel, VoiceOver reads the pressable's children.
    override var accessibilityLabel: String? {
        get { super.accessibilityLabel ?? KuitoAccessibility.childText(of: self) }
        set { super.accessibilityLabel = newValue }
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: -hitSlop, dy: -hitSlop).contains(point)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard !isDisabled, let touch = touches.first else { return }

        pressing = true
        longPressed = false
        showPressed(true)
        playHaptic()
        emit?("pressin", location(of: touch))

        longPressTimer = Timer.scheduledTimer(withTimeInterval: longPressDuration, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.pressing else { return }

                self.longPressed = true
                self.emit?("longpress", self.location(of: touch))
            }
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard pressing, let touch = touches.first else { return }

        let slop = hitSlop + pressRetention

        if !bounds.insetBy(dx: -slop, dy: -slop).contains(touch.location(in: self)) {
            finish(touch, pressed: false)
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard pressing, let touch = touches.first else { return }

        finish(touch, pressed: !longPressed)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard pressing, let touch = touches.first else { return }

        finish(touch, pressed: false)
    }

    private func finish(_ touch: UITouch, pressed: Bool) {
        let location = location(of: touch)

        pressing = false
        longPressTimer?.invalidate()
        longPressTimer = nil
        showPressed(false)
        emit?("pressout", location)

        if pressed { emit?("press", location) }
    }

    private func location(of touch: UITouch) -> KuitoTouchPayload {
        let local = touch.location(in: self)
        let page = touch.location(in: nil)

        return KuitoTouchPayload(
            locationX: Double(local.x), locationY: Double(local.y), pageX: Double(page.x), pageY: Double(page.y)
        )
    }

    /// Quick in, gentle out, from the current state so fast taps never jump.
    private func showPressed(_ pressed: Bool) {
        guard let style, activeOpacity != 1 || pressedScale != 1 else { return }

        style.pressedOpacity = pressed ? activeOpacity : 1
        style.pressedScale = pressed ? pressedScale : 1

        UIView.animate(
            withDuration: pressed ? 0.08 : 0.2,
            delay: 0,
            options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut]
        ) {
            self.alpha = style.effectiveOpacity
            self.transform = style.transform()
        }
    }

    private func playHaptic() {
        switch haptic {
        case "selection": UISelectionFeedbackGenerator().selectionChanged()
        case "light": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        default: break
        }
    }
}
